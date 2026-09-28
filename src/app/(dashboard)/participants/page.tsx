import { prisma } from '@/lib/prisma';
import { withCheckerNames } from '@/lib/ieee-checkers';
import { apiFetch } from '@/lib/trsyp-api';
import { latestProofPerParticipant, type PaymentProofRow } from '@/lib/payment';
import { ParticipantsTable } from './participants-table';

/** Generous enough to cover every participant's full submission history. */
const PROOFS_TAKE = 1000;

export default async function ParticipantsPage() {
  // Participants stay on Prisma: the REST endpoint returns none of the nested
  // relations this page renders (memberships, room, the nested visaApplication)
  // and omits name and email entirely.
  //
  // Pending proofs must come from the API — `paid` alone cannot distinguish
  // "awaiting review" from "nothing submitted", and a proof's status is not a
  // shape this dashboard should be reading out of the payment tables directly.
  const [participants, pendingProofs] = await Promise.all([
    prisma.participant.findMany({
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
    }),
    // Every proof, not just pending ones: a participant's status follows their
    // most recent submission, so the history has to be collapsed before asking
    // whether they are awaiting review. Same rule the queue page applies.
    apiFetch<{ data: PaymentProofRow[]; total: number }>(`/payment/admin/proofs?take=${PROOFS_TAKE}`),
  ]);

  // A failed lookup must not take the whole page down — every row falls back to
  // Paid / Not Paid — but it is called out below rather than degrading quietly,
  // since a real pending proof would otherwise read as never submitted.
  //
  // The latest proof's status is what the column needs, not merely whether a
  // pending one exists: a rejected participant who resubmits is Pending again,
  // and one who never resubmits stays Rejected rather than Not Paid.
  const latestProofByParticipant = new Map(
    pendingProofs.ok
      ? latestProofPerParticipant(pendingProofs.data.data).map((proof) => [
          proof.participantId,
          { id: proof.id, status: proof.status },
        ])
      : [],
  );

  // If the history ever outgrows the fetch, the column would silently miss
  // rows, so say so instead.
  const truncated = pendingProofs.ok && pendingProofs.data.total > pendingProofs.data.data.length;

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the modal needs for display anyway.
  // Admin ids in checked_by become names before anything reaches the client.
  const serialized = JSON.parse(JSON.stringify(await withCheckerNames(participants)));

  const rows = serialized.map((participant: { id: string }) => ({
    ...participant,
    latestProof: latestProofByParticipant.get(participant.id) ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Participants</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {participants.length} total
        </p>
      </div>

      {!pendingProofs.ok && (
        <div className="pay-banner">
          <span aria-hidden>!</span>
          <span>
            Payment status could not be loaded ({pendingProofs.message}) &mdash; rows below show only Paid or Not
            paid, so a pending submission will look unpaid.
          </span>
        </div>
      )}

      {truncated && (
        <div className="pay-banner">
          <span aria-hidden>!</span>
          <span>
            More than {PROOFS_TAKE} proofs exist; some rows may show as Not paid.
          </span>
        </div>
      )}

      <ParticipantsTable participants={rows} />
    </div>
  );
}
