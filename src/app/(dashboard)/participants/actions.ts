'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { loadParticipantDetails } from './participant-queries';
import type { ParticipantRow } from './participants-table';
import { isIeeeConfigured, lookupMember, type MemberLookup } from '@/lib/ieee-api';
import {
  isPlausibleIeeeId,
  isRasClaimNote,
  pricedValues,
  recordNotes,
  storedStatus,
  type IeeeIssue,
  type IeeeVerification,
} from '@/lib/ieee-verification';

/** Re-checks are per participant from the details popup; a small cap keeps
 *  this public endpoint from being used to fan out IEEE calls. */
const MAX_BATCH = 10;

export type VerifyOutcome =
  | {
      participantId: string;
      ok: true;
      verification: IeeeVerification;
      /** The priced values written through, for the client to merge. */
      priced: { participantType: string; isRas: boolean };
    }
  /** Nothing is stored for a failure: the participant keeps their last result
   *  and the main website's own checks carry on. */
  | { participantId: string; ok: false; message: string };

export type VerifyResult = { ok: true; outcomes: VerifyOutcome[] } | { ok: false; message: string };

/**
 * Checks participants against IEEE GetMemberStatus and writes each conclusive
 * result through: the participant's priced `participant_type` / `is_ras` are
 * updated from the record, and the row is stored with `claimed_*` set to those
 * updated values, in one transaction. Their fee is right immediately rather
 * than when the main website next applies the row.
 *
 * Only ids come from the client; every fact the check is made against is read
 * here, so a tampered request cannot vouch for anything.
 */
export async function verifyParticipants(participantIds: string[]): Promise<VerifyResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: 'Only admins can run IEEE checks.' };

  if (!isIeeeConfigured()) {
    return { ok: false, message: 'IEEE API credentials are not configured on the server.' };
  }

  const ids = [...new Set(participantIds)].slice(0, MAX_BATCH);

  const participants = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ieeeId: true,
      careerStage: true,
      sb: true,
      user: { select: { email: true, active: true, name: true, lastName: true } },
      // For a RAS claim made under the old form, which must survive a re-check.
      ieeeVerification: { select: { issues: true } },
    },
  });
  const byId = new Map(participants.map((p) => [p.id, p]));

  const outcomes = await Promise.all(
    ids.map(async (id): Promise<VerifyOutcome> => {
      const p = byId.get(id);
      if (!p) return { participantId: id, ok: false, message: 'Participant no longer exists.' };

      try {
        return await checkOne(p, admin);
      } catch (error) {
        return {
          participantId: id,
          ok: false,
          message: error instanceof Error ? error.message : 'Could not save the result.',
        };
      }
    }),
  );

  // No revalidatePath: the client merges the result into its own state and
  // refreshes the page itself once it has.
  return { ok: true, outcomes };
}

type Subject = {
  id: string;
  ieeeId: number | null;
  careerStage: string | null;
  sb: string | null;
  user: { email: string; active: boolean; name: string; lastName: string };
  ieeeVerification: { issues: unknown } | null;
};

async function checkOne(p: Subject, admin: { id: string; name: string }): Promise<VerifyOutcome> {
  // The IEEE number is the precise key; email is the fallback for participants
  // who left it blank or mistyped it.
  let lookup: MemberLookup = { kind: 'not_found' };
  let matchedBy: 'IEEE_ID' | 'EMAIL' = 'IEEE_ID';

  // A number too short to be a member number cannot match anyone; asking IEEE
  // would only spend one of their (slow) calls to learn that.
  if (p.ieeeId !== null && isPlausibleIeeeId(p.ieeeId)) {
    lookup = await lookupMember(String(p.ieeeId));
  }

  // By email only once they have proved they own it by activating the account
  // — otherwise the record could be someone else's, and it now sets the price.
  // Same rule as the main website.
  if (lookup.kind === 'not_found' && p.user.active) {
    lookup = await lookupMember(p.user.email);
    matchedBy = 'EMAIL';
  }

  if (lookup.kind === 'error') return { participantId: p.id, ok: false, message: lookup.message };

  const record = lookup.kind === 'found' ? lookup.record : null;
  const priced = pricedValues(record, p);
  const raw = {
    memberStatus: record?.memberStatus ?? null,
    grade: record?.grade ?? null,
    societies: record?.societies ?? [],
    firstInitial: record?.firstInitial ?? null,
    lastInitial: record?.lastInitial ?? null,
    matchedBy: record ? matchedBy : null,
  };

  const data = {
    ...raw,
    status: storedStatus(record),
    issues: [
      // Registration no longer asks about RAS, so the only record of an earlier
      // claim is the note on the previous row — carried over unchanged.
      ...((p.ieeeVerification?.issues ?? []) as IeeeIssue[]).filter(isRasClaimNote),
      ...recordNotes({ ieeeId: p.ieeeId, firstName: p.user.name, lastName: p.user.lastName }, raw),
    ],
    // The participant's values after the update below, so the row is current.
    claimedIeeeId: p.ieeeId,
    claimedType: priced.participantType,
    claimedIsRas: priced.isRas,
    claimedEmail: p.user.email,
    checkedAt: new Date(),
    checkedBy: admin.id,
  };

  const [, saved] = await prisma.$transaction([
    prisma.participant.update({
      where: { id: p.id },
      data: { participantType: priced.participantType, isRas: priced.isRas },
    }),
    prisma.ieeeVerification.upsert({
      where: { participantId: p.id },
      create: { participantId: p.id, ...data },
      update: data,
      select: IEEE_VERIFICATION_SELECT,
    }),
  ]);

  return {
    participantId: p.id,
    ok: true,
    verification: {
      ...saved,
      matchedBy: saved.matchedBy as IeeeVerification['matchedBy'],
      issues: saved.issues as IeeeIssue[],
      checkedAt: saved.checkedAt.toISOString(),
      checkedBy: admin.name,
    },
    priced,
  };
}

/** Most rows one export may ask for — comfortably above the whole event. */
const MAX_EXPORT = 2000;

export type DetailsResult = { ok: true; participants: ParticipantRow[] } | { ok: false; message: string };

/**
 * Full records for the details popup (one id) or the CSV export (the visible
 * rows). The list page loads only what the table shows; this is the rest, on
 * demand. Admin-only, like every action here.
 */
export async function getParticipantDetails(participantIds: string[]): Promise<DetailsResult> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, message: 'Only admins can read participant details.' };

  const ids = [...new Set(participantIds)].slice(0, MAX_EXPORT);
  if (ids.length === 0) return { ok: true, participants: [] };

  try {
    return { ok: true, participants: await loadParticipantDetails(ids) };
  } catch {
    return { ok: false, message: 'Could not load the details. Try again.' };
  }
}

async function currentAdmin() {
  const supabase = await createClient();
  // Verified locally with asymmetric keys, like the dashboard layout's check.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return null;

  const admin = await prisma.admin.findUnique({
    where: { supabaseId: userId },
    select: { id: true, name: true, lastName: true },
  });
  return admin ? { id: admin.id, name: `${admin.name} ${admin.lastName}` } : null;
}

/** The columns handed back to the client. */
const IEEE_VERIFICATION_SELECT = {
  status: true,
  memberStatus: true,
  grade: true,
  societies: true,
  firstInitial: true,
  lastInitial: true,
  matchedBy: true,
  issues: true,
  checkedAt: true,
  claimedIeeeId: true,
  claimedType: true,
  claimedIsRas: true,
  claimedEmail: true,
} as const;
