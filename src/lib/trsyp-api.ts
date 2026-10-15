import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Thin client for the TRSYP 3.0 Nest backend.
 *
 * This is the only place in the dashboard that speaks HTTP. Everything else
 * reads Postgres through Prisma (src/lib/prisma.ts) — the split is deliberate:
 * reads are just shapes, but the payment writes have side effects that live
 * inside the backend (guards on banned/already-paid participants, and the
 * PARTICIPANT_PAID domain event other modules listen for). Those cannot be
 * reproduced with SQL, so they go over the API.
 *
 * Auth is the admin's own Supabase access token, forwarded as a bearer token.
 * The backend's AdminGuard resolves it against the same `admins` table that
 * src/lib/require-admin.ts checks, so the two cannot disagree.
 *
 * Called from Server Actions and server components only, so this is
 * server-to-server: no preflight, no CORS, and the URL never reaches the
 * browser (hence no NEXT_PUBLIC_ prefix).
 */

const BASE_URL = process.env.TRSYP_API_URL;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/** Status codes the payment routes use, given meaning here once. */
export const API_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORISED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  /** The proof was already reviewed — someone else got there first. */
  CONFLICT: 409,
} as const;

export async function apiFetch<T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
  },
): Promise<ApiResult<T>> {
  if (!BASE_URL) {
    return {
      ok: false,
      status: 0,
      message: 'TRSYP_API_URL is not set. Add it to .env.local.',
    };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, status: API_STATUS.UNAUTHORISED, message: 'Your session has expired. Sign in again.' };
  }

  const serialised = init?.body === undefined ? undefined : JSON.stringify(init.body);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(serialised === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: serialised,
      // Admin review data must never be served from a cache.
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the payments service.' };
  }

  if (!response.ok) {
    const raw = await response.text();
    // Full body to the server console: the UI shows one line, but a generic
    // "Validation failed" is only diagnosable with what the backend actually
    // sent back, and which field it objected to.
    console.error(`[trsyp-api] ${init?.method ?? 'GET'} ${BASE_URL}${path} -> ${response.status}`, {
      sentBody: serialised ?? null,
      sentContentType: serialised === undefined ? null : 'application/json',
      received: raw,
    });
    return { ok: false, status: response.status, message: readError(response, raw) };
  }

  // 204 and other empty bodies are valid successes.
  const text = await response.text();
  if (!text) return { ok: true, data: null as T };

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    // A 200 that is not JSON means TRSYP_API_URL is pointed at something other
    // than the API — in production the deployed site answers non-/api paths
    // with its own HTML. Fail with that, rather than a raw parse error.
    return {
      ok: false,
      status: response.status,
      message: 'TRSYP_API_URL does not point at the API (got a non-JSON response).',
    };
  }
}

/** Nest error bodies are `{ statusCode, message, error }`, where `message` is
 *  a string for most throws and an array for validation failures. */
function readError(response: Response, raw: string): string {
  // An HTML error body means the request never reached the API: the base URL
  // is pointing at a web server instead. Worth saying outright, because the
  // generic "Not found" this would otherwise produce sends you hunting for a
  // missing proof rather than a misconfigured URL.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return `TRSYP_API_URL (${BASE_URL}) does not point at the API — got HTTP ${response.status} as ${
      response.headers.get('content-type') ?? 'an unknown type'
    }.`;
  }

  let detail = '';
  try {
    const body = JSON.parse(raw);
    detail = Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? '');
  } catch {
    // Valid JSON content-type but an unparseable body — fall through below.
  }

  switch (response.status) {
    case API_STATUS.BAD_REQUEST:
      return detail || 'The backend rejected that request.';
    // 401 and 403 keep the backend's own wording when it sends any, since the
    // two guards fail for different reasons and the distinction is the whole
    // diagnostic: a role-claim guard and an admins-table guard both land here.
    case API_STATUS.UNAUTHORISED:
      return detail
        ? `Not signed in as far as the backend is concerned: "${detail}".`
        : 'Your session has expired. Sign in again.';
    case API_STATUS.FORBIDDEN:
      return detail
        ? `The backend refused this account: "${detail}".`
        : 'Your account is not authorised to review payments.';
    case API_STATUS.NOT_FOUND:
      return detail || 'Not found.';
    case API_STATUS.CONFLICT:
      return detail || 'This payment has already been reviewed.';
    default:
      return detail || `The payments service failed (HTTP ${response.status}).`;
  }
}
