import { prisma } from '@/lib/prisma';
import { apiFetch } from '@/lib/trsyp-api';
import type { PaymentProofRow } from '@/lib/payment';
import { ParticipantsTable } from './participants-table';

/** Enough to cover every participant, since each holds at most one proof. */
const PENDING_PROOFS_TAKE = 500;

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
        sb: true,
        country: true,
        // One membership per activity (DB-enforced), so this is at most 2 rows.
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
    apiFetch<{ data: PaymentProofRow[]; total: number }>(
      `/payment/admin/proofs?status=PENDING&take=${PENDING_PROOFS_TAKE}`,
    ),
  ]);

  // A failed lookup must not take the whole page down — every row falls back to
  // Paid / Not paid — but it is called out below rather than degrading quietly,
  // since a real pending proof would otherwise read as "Not paid".
  const pendingProofByParticipant = new Map(
    pendingProofs.ok ? pendingProofs.data.data.map((proof) => [proof.participantId, proof.id]) : [],
  );

  // One proof per participant makes 500 ample; if that ever stops holding, the
  // column would silently miss rows, so say so instead.
  const truncated = pendingProofs.ok && pendingProofs.data.total > pendingProofs.data.data.length;

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the modal needs for display anyway.
  const serialized = JSON.parse(JSON.stringify(participants));

  const rows = serialized.map((participant: { id: string }) => ({
    ...participant,
    pendingProofId: pendingProofByParticipant.get(participant.id) ?? null,
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
            More than {PENDING_PROOFS_TAKE} pending proofs exist; some rows may show as Not paid.
          </span>
        </div>
      )}

      <ParticipantsTable participants={rows} />
    </div>
  );
}
