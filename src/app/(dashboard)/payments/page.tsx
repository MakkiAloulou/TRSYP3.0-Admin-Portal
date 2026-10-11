import type { Metadata } from 'next';
import { PROOFS_TAKE, getAllProofs } from '@/lib/payment-proofs';
import {
  PAYMENT_PROOF_STATUSES,
  STATUS_LABELS,
  byOldestFirst,
  latestProofPerParticipant,
  needsPaymentType,
  type PaymentProofStatus,
  type ProofFilter,
} from '@/lib/payment';
import { PaymentsTable } from './payments-table';

/**
 * The queue shows one row per participant, so it cannot let the backend
 * paginate: collapsing a page of proofs could leave any number of rows, and
 * the counts would not survive it. Everything is fetched (getAllProofs),
 * collapsed, and the whole tab shown, with no paging, so it can be scanned,
 * searched with the browser and exported in one go. At ~300 participants this
 * is one modest request and one modest table; revisit if it ever outgrows that.
 */

type SearchParams = {
  status?: string;
  proof?: string;
};

function parseStatus(value: string | undefined): ProofFilter {
  if (value === 'ALL' || value === 'TO_CONFIRM') return value;
  return PAYMENT_PROOF_STATUSES.includes(value as PaymentProofStatus)
    ? (value as PaymentProofStatus)
    : 'PENDING';
}

function subtitle(status: ProofFilter, total: number, pending: number) {
  if (status === 'PENDING') return `${pending} awaiting review`;
  if (status === 'ALL') return `${total} participants`;
  if (status === 'TO_CONFIRM') {
    return total === 0
      ? 'Every payment is confirmed.'
      : `${total} to confirm. For each one, pick how the money arrived: Bank transfer, Internal fund or Cash.`;
  }
  return `${total} ${STATUS_LABELS[status].toLowerCase()}`;
}

/** "(12) Payments" while proofs wait, so the queue shows from another tab. */
export async function generateMetadata(): Promise<Metadata> {
  const result = await getAllProofs();
  const pending = result.ok
    ? latestProofPerParticipant(result.data.data).filter((proof) => proof.status === 'PENDING').length
    : 0;
  return { title: pending > 0 ? `(${pending}) Payments` : 'Payments' };
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const status = parseStatus(params.status);

  // Fetched without a status filter on purpose. Collapsing has to happen across
  // a participant's whole history: filtering first would surface a superseded
  // PENDING proof from before a resubmission, which is exactly what this is
  // meant to hide.
  const result = await getAllProofs();

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h2 className="admin-heading text-lg text-white">Payments</h2>
        <div className="admin-card p-6">
          <p className="pay-error">{result.message}</p>
        </div>
      </div>
    );
  }

  const current = latestProofPerParticipant(result.data.data).sort(byOldestFirst);
  const matching =
    status === 'ALL'
      ? current
      : status === 'TO_CONFIRM'
        ? current.filter(needsPaymentType)
        : current.filter((proof) => proof.status === status);

  const total = matching.length;
  const pending = current.filter((proof) => proof.status === 'PENDING').length;

  // Every tab's count, so the filters say how much is in each queue before
  // anyone opens it.
  const counts = Object.fromEntries([
    ...PAYMENT_PROOF_STATUSES.map((s) => [s, current.filter((proof) => proof.status === s).length]),
    ['ALL', current.length],
    ['TO_CONFIRM', current.filter(needsPaymentType).length],
  ]) as Record<ProofFilter, number>;

  const truncated = result.data.total > result.data.data.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Payments</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {subtitle(status, total, pending)}
        </p>
      </div>

      {truncated && (
        <div className="pay-banner">
          <span aria-hidden>!</span>
          <span>
            Only the first {PROOFS_TAKE} of {result.data.total} proofs were read, so some participants may be missing
            from this queue.
          </span>
        </div>
      )}

      <PaymentsTable
        proofs={matching}
        status={status}
        counts={counts}
        focusProofId={params.proof}
      />
    </div>
  );
}
