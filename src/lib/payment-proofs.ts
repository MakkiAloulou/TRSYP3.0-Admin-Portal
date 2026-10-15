import 'server-only';
import { cache } from 'react';
import { apiFetch } from '@/lib/trsyp-api';
import { prisma } from '@/lib/prisma';
import { feeFor, type PaymentProofRow } from '@/lib/payment';

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

/**
 * `proofs` with `currentFee` priced the way this portal prices (feeFor), not
 * the backend's way: the backend knows neither a participant's fee_override
 * nor the flat Fablab fee, so its figure is wrong for exactly the people the
 * organisers priced by hand. If the participants cannot be read, the
 * backend's figures are kept rather than the page failing.
 */
export async function withAdminFees(proofs: PaymentProofRow[]): Promise<PaymentProofRow[]> {
  const participants = await prisma.participant
    .findMany({
      where: { id: { in: [...new Set(proofs.map((p) => p.participantId))] } },
      select: {
        id: true,
        participantType: true,
        isRas: true,
        feeOverride: true,
        memberships: { select: { activity: true } },
      },
    })
    .catch((error: unknown) => {
      console.error('Could not price payments; showing the backend fees', error);
      return [];
    });

  const fees = new Map(participants.map((p) => [p.id, feeFor(p)]));
  return proofs.map((proof) => ({ ...proof, currentFee: fees.get(proof.participantId) ?? proof.currentFee }));
}
