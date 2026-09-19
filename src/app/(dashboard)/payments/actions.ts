'use server';

import { revalidatePath } from 'next/cache';
import { API_STATUS, apiFetch } from '@/lib/trsyp-api';
import { validateRejectionReason, type PaymentProofRow } from '@/lib/payment';

export type ReviewResult =
  | { ok: true; proof: PaymentProofRow }
  /** `stale` is the backend's 409: another admin reviewed this first, so the
   *  caller should refetch the queue rather than show a raw error. */
  | { ok: false; stale: boolean; message: string };

/**
 * Approves a proof.
 *
 * This goes through the backend rather than writing `paid` directly, because
 * the route calls markAsPaid(), which enforces guards the dashboard cannot see
 * (a banned participant cannot be marked paid, an already-paid one cannot be
 * re-paid) and emits the PARTICIPANT_PAID event other modules listen for.
 *
 * There is no un-approve route by design, so the UI confirms before calling.
 */
export async function approveProof(id: string): Promise<ReviewResult> {
  const result = await apiFetch<PaymentProofRow>(`/payment/admin/proofs/${id}/approve`, {
    method: 'POST',
  });

  return finish(result, '/payments');
}

/**
 * Rejects a proof with a reason the participant sees verbatim. Rejection is
 * not terminal — they can submit a new receipt afterwards.
 */
export async function rejectProof(id: string, reason: string): Promise<ReviewResult> {
  const trimmed = reason.trim();

  // Mirrors the backend's own bounds so an invalid reason never round-trips.
  const invalid = validateRejectionReason(trimmed);
  if (invalid) return { ok: false, stale: false, message: invalid };

  const result = await apiFetch<PaymentProofRow>(`/payment/admin/proofs/${id}/reject`, {
    method: 'POST',
    body: { reason: trimmed },
  });

  return finish(result, '/payments');
}

export type ReceiptUrlResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Asks the backend for a signed URL to one receipt. Fetched when the reviewer
 * clicks a specific row, never upfront for a list — the URL expires in 60s.
 *
 * Note this route is not under /admin, and it authorises owner-or-admin.
 */
export async function getReceiptUrl(id: string): Promise<ReceiptUrlResult> {
  const result = await apiFetch<{ url: string; expiresIn: number }>(`/payment/proof/${id}/file`);

  if (!result.ok) {
    // 404 here means the proof has no receipt, which is normal for cash.
    const message =
      result.status === API_STATUS.NOT_FOUND ? 'This submission has no receipt attached.' : result.message;
    return { ok: false, message };
  }

  return { ok: true, url: result.data.url };
}

/** Shared tail for both review actions: map 409 to the stale case, and let the
 *  participants page pick up the changed payment state on its next render. */
function finish(
  result: Awaited<ReturnType<typeof apiFetch<PaymentProofRow>>>,
  path: string,
): ReviewResult {
  if (!result.ok) {
    if (result.status === API_STATUS.CONFLICT) {
      return {
        ok: false,
        stale: true,
        message: 'Another admin reviewed this payment first. The queue has been refreshed.',
      };
    }
    return { ok: false, stale: false, message: result.message };
  }

  revalidatePath(path);
  revalidatePath('/participants');
  return { ok: true, proof: result.data };
}
