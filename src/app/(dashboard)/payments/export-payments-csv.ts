import { PAYMENT_TYPE_LABELS, STATUS_LABELS, type PaymentProofRow, type ProofFilter } from '@/lib/payment';
import { escapeCell } from '../participants/export-csv';

/**
 * One row per payment, in the order the treasurer reconciles by. The fee is a
 * bare number so a spreadsheet can sum the column, and dates are local time,
 * as the page shows them.
 */
const COLUMNS: { header: string; value: (p: PaymentProofRow) => string }[] = [
  { header: 'Name', value: (p) => p.participantName },
  { header: 'Email', value: (p) => p.participantEmail },
  { header: 'Fee (TND)', value: (p) => String(p.currentFee) },
  { header: 'Payment type', value: paymentType },
  { header: 'Payment date', value: (p) => localDateTime(p.createdAt) },
  { header: 'Review date', value: (p) => localDateTime(p.reviewedAt) },
  { header: 'Status', value: (p) => STATUS_LABELS[p.status] },
];

export function buildPaymentsCsv(payments: PaymentProofRow[]): string {
  const rows = [COLUMNS.map((c) => c.header), ...payments.map((p) => COLUMNS.map((c) => c.value(p)))];

  // A BOM is what makes Excel read the file as UTF-8 rather than latin-1.
  return '﻿' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Names the tab it came from, so two exports from one day are told apart. */
export function paymentsCsvFilename(filter: ProofFilter, now = new Date()) {
  const tab = filter.toLowerCase().replace('_', '-');
  return `trsyp-payments-${tab}-${localDate(now)}.csv`;
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

/** "2026-10-10 15:32": sortable, and read as a date by spreadsheets. */
function localDateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
