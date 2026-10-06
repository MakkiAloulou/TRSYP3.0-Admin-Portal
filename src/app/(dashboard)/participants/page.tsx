import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { withCheckerNames } from '@/lib/ieee-checkers';
import { PROOFS_TAKE, getAllProofs } from '@/lib/payment-proofs';
import { latestProofPerParticipant } from '@/lib/payment';
import { ParticipantsTable, type PaymentsInfo } from './participants-table';

export const metadata: Metadata = { title: 'Participants' };

export default async function ParticipantsPage() {
  // Participants stay on Prisma: the REST endpoint returns none of the nested
  // relations this page renders (memberships, room, the nested visaApplication)
  // and omits name and email entirely.
  //
  // Pending proofs must come from the API — `paid` alone cannot distinguish
  // "awaiting review" from "nothing submitted", and a proof's status is not a
  // shape this dashboard should be reading out of the payment tables directly.
  //
  // The page waits only for the database. The proofs go to the table as a
  // promise, so a slow payments service delays the payment icons, not the page.
  const payments = loadPaymentsInfo();

  const participants = await prisma.participant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ieeeId: true,
        phone: true,
        gender: true,
        paid: true,
        isInternational: true,
        banned: true,
        participantType: true,
        isRas: true,
        careerStage: true,
        sb: true,
        country: true,
        // One membership per activity (DB-enforced), so this is at most 3 rows.
        memberships: {
          select: {
            activity: true,
            team: { select: { name: true, code: true, leaderId: true } },
          },
        },
        room: { select: { id: true, status: true } },
        internationalInfo: {
          select: {
            dateOfBirth: true,
            countryOfResidence: true,
            cityOfResidence: true,
            affiliation: true,
            expectedArrivalDate: true,
            expectedDepartureDate: true,
            requiresVisaLetter: true,
            visaApplication: { select: { status: true } },
          },
        },
        // Latest IEEE membership check. The claimed* snapshot is what lets the
        // table tell a still-valid result from one the participant has since
        // invalidated by editing their profile.
        ieeeVerification: {
          select: {
            status: true,
            memberStatus: true,
            grade: true,
            societies: true,
            firstInitial: true,
            lastInitial: true,
            matchedBy: true,
            issues: true,
            checkedAt: true,
            checkedBy: true,
            claimedIeeeId: true,
            claimedType: true,
            claimedIsRas: true,
            claimedEmail: true,
          },
        },
        user: {
          select: {
            name: true,
            lastName: true,
            email: true,
            active: true,
            createdAt: true,
          },
        },
      },
  });

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the modal needs for display anyway.
  // Admin ids in checked_by become names before anything reaches the client.
  const serialized = JSON.parse(JSON.stringify(await withCheckerNames(participants)));

  // latestProof is filled in on the client once `payments` resolves.
  const rows = serialized.map((participant: { id: string }) => ({ ...participant, latestProof: null }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Participants</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {participants.length} total
        </p>
      </div>

      <ParticipantsTable participants={rows} payments={payments} />
    </div>
  );
}

/**
 * Each participant's newest proof, keyed by participant. Every proof is read,
 * not just pending ones: a participant's status follows their most recent
 * submission (a rejected participant who resubmits is Pending again), so the
 * history has to be collapsed first. Same rule the queue page applies.
 */
async function loadPaymentsInfo(): Promise<PaymentsInfo> {
  const result = await getAllProofs();
  // A failed lookup must not take the page down — rows fall back to Paid /
  // Not paid — but the table calls it out rather than degrading quietly.
  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    latest: Object.fromEntries(
      latestProofPerParticipant(result.data.data).map((proof) => [
        proof.participantId,
        { id: proof.id, status: proof.status },
      ]),
    ),
    // If the history ever outgrows the fetch, the column would silently miss
    // rows, so the table says so instead.
    truncatedAt: result.data.total > result.data.data.length ? PROOFS_TAKE : null,
  };
}
