// Shared payment-proof vocabulary. Kept free of Prisma and React imports so
// both server components and client components can pull from it.

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'D17', 'FLOUCI', 'CASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROOF_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type PaymentProofStatus = (typeof PAYMENT_PROOF_STATUSES)[number];

/** Reject reasons are shown to the participant verbatim — the backend trims
 *  and bounds them, and we mirror the same bounds client-side. */
export const REJECTION_REASON_MIN = 5;
export const REJECTION_REASON_MAX = 500;

export const STATUS_LABELS: Record<PaymentProofStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** One row of the review queue. Mirrors what the backend's
 *  GET /payment/admin/proofs returns, so the two stay comparable. */
export type PaymentProofRow = {
  id: string;
  method: PaymentMethod;
  status: PaymentProofStatus;
  amountSnapshot: number;
  fileName: string | null;
  hasFile: boolean;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  participantId: string;
  participantName: string;
  participantEmail: string;
  /** What the participant owes right now. Computed by the backend per request
   *  from facts that can change after registration (RAS toggle, membership
   *  type, joining a team), which is why it is never a stored column. */
  currentFee: number;
  participantPaid: boolean;
};

/**
 * Collapses a participant's submission history to their most recent proof.
 *
 * A participant can hold several proofs — resubmitting after a rejection adds
 * another — but only the newest one reflects where they actually stand, so the
 * queue shows that and discards the rest. Nothing prevents duplicates at the
 * database level: payment_proofs indexes participant_id without a unique.
 */
export function latestProofPerParticipant(proofs: PaymentProofRow[]): PaymentProofRow[] {
  const latest = new Map<string, PaymentProofRow>();

  for (const proof of proofs) {
    const held = latest.get(proof.participantId);
    if (!held || Date.parse(proof.createdAt) > Date.parse(held.createdAt)) {
      latest.set(proof.participantId, proof);
    }
  }

  return [...latest.values()];
}

/** Oldest first: the queue is worked front to back, longest wait first. */
export function byOldestFirst(a: PaymentProofRow, b: PaymentProofRow) {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/**
 * Registration fees in TND, by role and membership tier. A copy of the
 * backend's registration/domain/fees.ts (itself mirrored in the main site's
 * lib/fees.ts) — change all three together.
 */
const FEES = {
  VISITOR: { IEEE_RAS: 170, IEEE: 175, NON_IEEE: 185 },
  CHALLENGER: { IEEE_RAS: 175, IEEE: 180, NON_IEEE: 190 },
} as const;

/**
 * What a participant owes right now, priced exactly as the backend's feeFor():
 * a challenger is anyone on a team in any activity, and RAS only discounts
 * IEEE members.
 */
export function feeFor(participant: { participantType: string; isRas: boolean; memberships: unknown[] }) {
  const role = participant.memberships.length > 0 ? 'CHALLENGER' : 'VISITOR';
  const tier = participant.participantType === 'NonIEEE' ? 'NON_IEEE' : participant.isRas ? 'IEEE_RAS' : 'IEEE';
  return FEES[role][tier];
}

export function formatAmount(amount: number) {
  return `${amount} TND`;
}

/** Receipts are JPG, PNG or PDF; the list route reports only a file name, so
 *  the extension is what decides between an inline image and an embedded PDF. */
export function isPdfReceipt(proof: Pick<PaymentProofRow, 'fileName'>) {
  return (proof.fileName ?? '').toLowerCase().endsWith('.pdf');
}

/** Validates a rejection reason the same way the backend does. Returns an
 *  error string for display, or null when the reason is acceptable. */
export function validateRejectionReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < REJECTION_REASON_MIN) {
    return `Give the participant at least ${REJECTION_REASON_MIN} characters to act on.`;
  }
  if (trimmed.length > REJECTION_REASON_MAX) {
    return `Keep it under ${REJECTION_REASON_MAX} characters (currently ${trimmed.length}).`;
  }
  return null;
}

/* ─── Participants page payment status ──────────────────────────────── */

export const PAYMENT_STATES = ['PAID', 'PENDING', 'REJECTED', 'NOT_PAID'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  PAID: 'Paid',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
  NOT_PAID: 'Not Paid',
};

/** Same colour language as the participant-facing dashboard. */
export const PAYMENT_STATE_COLORS: Record<PaymentState, string> = {
  PAID: '#00e87a',
  PENDING: '#f59e0b',
  REJECTED: '#ef4444',
  NOT_PAID: '#ff1d78',
};

/**
 * The participant record carries only `paid`, so the status of their most
 * recent proof is what separates the other three: awaiting review, turned
 * down, and nothing ever sent.
 *
 * Takes the *latest* proof deliberately — a rejected participant can resubmit,
 * so an older row says nothing about where they stand now.
 */
export function derivePaymentState(
  paid: boolean,
  latestProofStatus: PaymentProofStatus | null,
): PaymentState {
  if (paid) return 'PAID';
  if (latestProofStatus === 'PENDING') return 'PENDING';
  if (latestProofStatus === 'REJECTED') return 'REJECTED';
  return 'NOT_PAID';
}
