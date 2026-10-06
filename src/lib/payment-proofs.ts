import 'server-only';
import { cache } from 'react';
import { apiFetch } from '@/lib/trsyp-api';
import type { PaymentProofRow } from '@/lib/payment';

/** Generous enough to cover every participant's full submission history. */
export const PROOFS_TAKE = 1000;

export type ProofsResponse = {
  data: PaymentProofRow[];
  total: number;
  skip: number;
  take: number;
};

/**
 * Every payment proof, fetched once per request: the Payments page and its
 * tab title (which shows the queue size) both read it, and `cache` makes the
 * second ask free instead of a second call to the backend.
 */
export const getAllProofs = cache(() => apiFetch<ProofsResponse>(`/payment/admin/proofs?take=${PROOFS_TAKE}`));
