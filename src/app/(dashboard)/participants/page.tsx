import type { Metadata } from 'next';
import { PROOFS_TAKE, getAllProofs } from '@/lib/payment-proofs';
import { latestProofPerParticipant } from '@/lib/payment';
import { loadParticipantList } from './participant-queries';
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

  // Only what the table needs; the popup and export fetch the rest on demand
  // (see participant-queries.ts for why the split matters).
  const rows = await loadParticipantList();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Participants</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {rows.length} total
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
