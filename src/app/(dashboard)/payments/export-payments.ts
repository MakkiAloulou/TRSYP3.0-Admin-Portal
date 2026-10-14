import { PAYMENT_TYPE_LABELS, STATUS_LABELS, type PaymentProofRow, type ProofFilter } from '@/lib/payment';
import { buildXlsx, tabulate, type XlsxColumn } from '@/lib/xlsx';

/**
 * One row per payment, in the order the treasurer reconciles by. The fee is a
 * number so the column can be summed, and dates are local time, as the page
 * shows them.
 */
const COLUMNS: XlsxColumn<PaymentProofRow>[] = [
  { header: 'Name', value: (p) => p.participantName },
  { header: 'Email', value: (p) => p.participantEmail },
  { header: 'Fee (TND)', value: (p) => p.currentFee },
  { header: 'Payment type', value: paymentType },
  { header: 'Payment date', value: (p) => localDateTime(p.createdAt) },
  { header: 'Review date', value: (p) => localDateTime(p.reviewedAt) },
  { header: 'Status', value: (p) => STATUS_LABELS[p.status] },
];

export function buildPaymentsXlsx(payments: PaymentProofRow[]) {
  const { header, rows } = tabulate(COLUMNS, payments);
  return buildXlsx(rows, { sheet: 'Payments', header });
}

/** Names the tab it came from, so two exports from one day are told apart. */
export function paymentsXlsxFilename(filter: ProofFilter, now = new Date()) {
  const tab = filter.toLowerCase().replace('_', '-');
  return `trsyp-payments-${tab}-${localDate(now)}.xlsx`;
}

/** Only approved payments hold money, so only they have (or await) a type. */
function paymentType(p: PaymentProofRow) {
  if (p.status !== 'APPROVED') return '';
  return p.paymentType ? PAYMENT_TYPE_LABELS[p.paymentType] : 'To confirm';
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-10 15:32": sorts in date order as text. */
function localDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
