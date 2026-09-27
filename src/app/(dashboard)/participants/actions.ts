'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { isIeeeConfigured, lookupMember, type MemberLookup } from '@/lib/ieee-api';
import {
  claimOf,
  isPlausibleIeeeId,
  judgeRecord,
  storedStatus,
  type IeeeCheckState,
  type IeeeClaim,
  type IeeeIssue,
  type IeeeVerification,
} from '@/lib/ieee-verification';

/** The client sends small batches so each row's result lands as soon as its
 *  batch returns. Checked here too — this is a public endpoint. */
const MAX_BATCH = 10;

export type VerifyOutcome =
  | { participantId: string; ok: true; verification: IeeeVerification; state: IeeeCheckState }
  /** Nothing is stored for a failure: the participant stays unverified and the
   *  next run picks them up again. */
  | { participantId: string; ok: false; message: string };

export type VerifyResult = { ok: true; outcomes: VerifyOutcome[] } | { ok: false; message: string };

/**
 * Checks a batch of participants against IEEE GetMemberStatus and stores each
 * conclusive result.
 *
 * Only ids come from the client; every fact the check is made against is read
 * here, so a tampered request cannot vouch for anything.
 */
export async function verifyParticipants(participantIds: string[]): Promise<VerifyResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  const adminId = await currentAdminId();
  if (!adminId) return { ok: false, message: 'Only admins can run IEEE checks.' };

  if (!isIeeeConfigured()) {
    return { ok: false, message: 'IEEE API credentials are not configured on the server.' };
  }

  const ids = [...new Set(participantIds)].slice(0, MAX_BATCH);

  const participants = await prisma.participant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ieeeId: true,
      participantType: true,
      isRas: true,
      user: { select: { email: true, active: true, name: true, lastName: true } },
    },
  });
  const byId = new Map(participants.map((p) => [p.id, p]));

  const outcomes = await Promise.all(
    ids.map(async (id): Promise<VerifyOutcome> => {
      const p = byId.get(id);
      if (!p) return { participantId: id, ok: false, message: 'Participant no longer exists.' };
      if (p.participantType === 'NonIEEE') {
        return { participantId: id, ok: false, message: 'Non-IEEE participants are not checked.' };
      }

      try {
        return await checkOne(id, claimOf(p), adminId);
      } catch (error) {
        return {
          participantId: id,
          ok: false,
          message: error instanceof Error ? error.message : 'Could not save the result.',
        };
      }
    }),
  );

  // No revalidatePath: the client merges each batch into its own state as it
  // arrives and refreshes once when the whole run ends, rather than
  // re-rendering the page (and refetching payments) after every batch.
  return { ok: true, outcomes };
}

async function checkOne(participantId: string, claim: IeeeClaim, adminId: string): Promise<VerifyOutcome> {
  // The IEEE ID is the precise key; email is the fallback for participants who
  // left it blank or mistyped it.
  let lookup: MemberLookup = { kind: 'not_found' };
  let matchedBy: 'IEEE_ID' | 'EMAIL' = 'IEEE_ID';

  // A number too short to be a member number cannot match anyone; asking IEEE
  // would only spend one of their (slow) calls to learn that.
  if (claim.ieeeId !== null && isPlausibleIeeeId(claim.ieeeId)) {
    lookup = await lookupMember(String(claim.ieeeId));
  }

  if (lookup.kind === 'not_found') {
    lookup = await lookupMember(claim.email);
    matchedBy = 'EMAIL';
  }

  if (lookup.kind === 'error') return { participantId, ok: false, message: lookup.message };

  const record = lookup.kind === 'found' ? lookup.record : null;
  const judgement = judgeRecord(claim, record, matchedBy);

  const data = {
    status: storedStatus(judgement, record),
    memberStatus: record?.memberStatus ?? null,
    grade: record?.grade ?? null,
    societies: record?.societies ?? [],
    firstInitial: record?.firstInitial ?? null,
    lastInitial: record?.lastInitial ?? null,
    matchedBy: record ? matchedBy : null,
    issues: judgement.issues,
    claimedIeeeId: claim.ieeeId,
    claimedType: claim.participantType,
    claimedIsRas: claim.isRas,
    claimedEmail: claim.email,
    checkedAt: new Date(),
    checkedBy: adminId,
  };

  const saved = await prisma.ieeeVerification.upsert({
    where: { participantId },
    create: { participantId, ...data },
    update: data,
    select: IEEE_VERIFICATION_SELECT,
  });

  return { participantId, ok: true, verification: toClient(saved), state: judgement.state };
}

async function currentAdminId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await prisma.admin.findUnique({ where: { supabaseId: user.id }, select: { id: true } });
  return admin?.id ?? null;
}

/** The columns the page and this action both hand to the client. */
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

function toClient(row: {
  status: IeeeVerification['status'];
  matchedBy: string | null;
  issues: unknown;
  checkedAt: Date;
} & Omit<IeeeVerification, 'status' | 'matchedBy' | 'issues' | 'checkedAt'>): IeeeVerification {
  return {
    ...row,
    matchedBy: row.matchedBy as IeeeVerification['matchedBy'],
    issues: row.issues as IeeeIssue[],
    checkedAt: row.checkedAt.toISOString(),
  };
}
