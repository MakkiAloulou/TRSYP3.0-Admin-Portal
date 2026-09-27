import 'server-only';
import { parseSocietyList, type IeeeMemberRecord } from '@/lib/ieee-verification';

/**
 * Client for IEEE's GetMemberStatus service (Enterprise Service Charter,
 * "GetMemberStatus"). Two calls: an OAuth client-credentials token, then
 * POST /Customer/getstatus with { MemberID } — a GCN or an email address.
 *
 * Server-only: the client secret must never reach the browser, hence no
 * NEXT_PUBLIC_ prefix on any of the three variables.
 */

const BASE_URL = process.env.IEEE_API_BASE_URL;
const CLIENT_ID = process.env.IEEE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.IEEE_CLIENT_SECRET?.trim();

/** IEEE has been seen taking ~28s on a single lookup, so this is generous. */
const REQUEST_TIMEOUT_MS = 45_000;

/** Refresh this long before the token's stated expiry, so a lookup that starts
 *  just before the deadline doesn't go out with a token that dies mid-flight. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export type MemberLookup =
  | { kind: 'found'; record: IeeeMemberRecord }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

// Tokens last an hour; one per server process is plenty. Holding the promise
// rather than the value means concurrent lookups share a single token request.
let token: { value: Promise<string>; expiresAt: number } | null = null;

export function isIeeeConfigured() {
  return Boolean(BASE_URL && CLIENT_ID && CLIENT_SECRET);
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && token && Date.now() < token.expiresAt) return token.value;

  const pending = requestToken();
  // Provisional expiry until the real one is known; cleared again on failure so
  // a bad response is not cached for an hour.
  const entry = { value: pending.then((t) => t.accessToken), expiresAt: Date.now() + TOKEN_EXPIRY_MARGIN_MS };
  // Waiters get the rejection through their own await; this only stops Node
  // reporting it as unhandled when nobody else was waiting.
  entry.value.catch(() => {});
  token = entry;

  try {
    const { accessToken, expiresInSeconds } = await pending;
    entry.expiresAt = Date.now() + expiresInSeconds * 1000 - TOKEN_EXPIRY_MARGIN_MS;
    return accessToken;
  } catch (error) {
    if (token === entry) token = null;
    throw error;
  }
}

async function requestToken() {
  const res = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      scope: 'GetMemberStatus',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;

  if (!res.ok || !body?.access_token) {
    throw new Error(`IEEE sign-in failed (${res.status}${body?.error_description ? `: ${body.error_description}` : ''})`);
  }

  return { accessToken: body.access_token, expiresInSeconds: body.expires_in ?? 3600 };
}

/**
 * Looks one member up by GCN or email.
 *
 * "Not found" arrives as HTTP 200 with a `reasons` array instead of the member
 * fields, so the body shape decides the outcome, not the status code.
 */
export async function lookupMember(memberId: string): Promise<MemberLookup> {
  if (!isIeeeConfigured()) {
    return { kind: 'error', message: 'IEEE API credentials are not configured on the server.' };
  }

  try {
    let res = await postStatus(memberId, await getToken());

    // The cached token can be revoked before its stated expiry; retry once.
    if (res.status === 401) res = await postStatus(memberId, await getToken(true));

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (body && typeof body.MemberStatus === 'string') {
      return {
        kind: 'found',
        record: {
          memberStatus: body.MemberStatus,
          grade: String(body.Grade ?? ''),
          societies: parseSocietyList(body.SocietyList as string | undefined),
          firstInitial: String(body.FirstName ?? ''),
          lastInitial: String(body.LastName ?? ''),
        },
      };
    }

    const reason = firstReason(body);
    if (reason && /not found/i.test(reason)) return { kind: 'not_found' };

    return { kind: 'error', message: reason ?? `IEEE returned an unexpected response (${res.status}).` };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { kind: 'error', message: 'IEEE did not answer in time.' };
    }
    return { kind: 'error', message: error instanceof Error ? error.message : 'IEEE lookup failed.' };
  }
}

function postStatus(memberId: string, accessToken: string) {
  return fetch(`${BASE_URL}/Customer/getstatus`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ MemberID: memberId }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
}

function firstReason(body: Record<string, unknown> | null): string | null {
  const reasons = body?.reasons;
  if (!Array.isArray(reasons)) return null;
  const message = (reasons[0] as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' ? message : null;
}
