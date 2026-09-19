import { apiFetch } from '@/lib/trsyp-api';
import {
  PAYMENT_PROOF_STATUSES,
  STATUS_LABELS,
  type PaymentProofRow,
  type PaymentProofStatus,
} from '@/lib/payment';
import { PaymentsTable } from './payments-table';

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

type SearchParams = {
  status?: string;
  skip?: string;
  take?: string;
  proof?: string;
};

type ProofsResponse = {
  data: PaymentProofRow[];
  total: number;
  skip: number;
  take: number;
};

function parseStatus(value: string | undefined): PaymentProofStatus | 'ALL' {
  if (value === 'ALL') return 'ALL';
  return PAYMENT_PROOF_STATUSES.includes(value as PaymentProofStatus)
    ? (value as PaymentProofStatus)
    : 'PENDING';
}

function subtitle(status: PaymentProofStatus | 'ALL', total: number) {
  if (status === 'PENDING') return `${total} awaiting review`;
  if (status === 'ALL') return `${total} in total`;
  return `${total} ${STATUS_LABELS[status].toLowerCase()}`;
}

function parseInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const status = parseStatus(params.status);
  const take = parseInteger(params.take, DEFAULT_TAKE, MAX_TAKE) || DEFAULT_TAKE;
  const skip = parseInteger(params.skip, 0, Number.MAX_SAFE_INTEGER);

  // The backend orders oldest first — it is a queue, so the longest wait is
  // reviewed first. Omitting `status` asks for every status.
  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (status !== 'ALL') query.set('status', status);

  const result = await apiFetch<ProofsResponse>(`/payment/admin/proofs?${query}`);

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

  const { data: proofs, total } = result.data;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Payments</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {subtitle(status, total)}
        </p>
      </div>

      <PaymentsTable
        proofs={proofs}
        total={total}
        skip={skip}
        take={take}
        status={status}
        focusProofId={params.proof}
      />
    </div>
  );
}
