'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PAYMENT_PROOF_STATUSES,
  PAYMENT_STATE_COLORS,
  REJECTION_REASON_MAX,
  STATUS_LABELS,
  formatAmount,
  isPdfReceipt,
  validateRejectionReason,
  type PaymentProofRow,
  type PaymentProofStatus,
  type PaymentState,
} from '@/lib/payment';
import { useEscapeKey } from '@/lib/use-escape-key';
import { ModalPresence } from '../modal-presence';
import { PaymentIcon } from '../payment-icon';
import { approveProof, getReceiptUrl, rejectProof } from './actions';

type Props = {
  proofs: PaymentProofRow[];
  total: number;
  skip: number;
  take: number;
  status: PaymentProofStatus | 'ALL';
  /** How many participants sit in each tab. */
  counts: Record<PaymentProofStatus | 'ALL', number>;
  /** Deep link from the participants page — highlights that row on arrival. */
  focusProofId?: string;
};

export function PaymentsTable({ proofs, total, skip, take, status, counts, focusProofId }: Props) {
  const router = useRouter();

  // Actions hand back the updated proof, so a review updates one row in place
  // instead of refetching the queue. When the server does send a fresh list
  // (pagination, filtering, or a refresh after a stale conflict) that wins.
  const [rows, setRows] = useState(proofs);
  const [lastProofs, setLastProofs] = useState(proofs);
  if (lastProofs !== proofs) {
    setLastProofs(proofs);
    setRows(proofs);
  }

  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  // A quiet confirmation, e.g. once the viewer has worked through the page.
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ proof: PaymentProofRow; url: string } | null>(null);
  const [confirming, setConfirming] = useState<PaymentProofRow | null>(null);
  const [rejecting, setRejecting] = useState<PaymentProofRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // The row a review just changed, tinted briefly so the reviewer sees which one moved.
  const [justReviewedId, setJustReviewedId] = useState<string | null>(null);
  // Read once per visit: "3 days ago" stays put while the page is open, and
  // the clock is never read during render.
  const [now] = useState(() => Date.now());

  function applyUpdate(updated: PaymentProofRow) {
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    setJustReviewedId(updated.id);
  }

  /** A proof someone else already reviewed means our list is stale: tell the
   *  reviewer what happened and pull fresh data rather than surfacing a raw error. */
  function handleStale(message: string) {
    setStaleNotice(message);
    router.refresh();
  }

  /** Opens `proof` in the viewer. Returns an error message, or null. */
  async function loadReceipt(proof: PaymentProofRow) {
    // Signed URLs expire after 60s, so they are fetched per proof, never upfront.
    const result = await getReceiptUrl(proof.id);
    if (!result.ok) return result.message;
    setReceipt({ proof, url: result.url });
    return null;
  }

  async function handleViewReceipt(proof: PaymentProofRow) {
    setBusyId(proof.id);
    setRowError(null);
    setNotice(null);
    try {
      const message = await loadReceipt(proof);
      if (message) setRowError({ id: proof.id, message });
    } finally {
      setBusyId(null);
    }
  }

  // The proofs the viewer can walk through: pending, with a receipt to read.
  const reviewable = rows.filter((row) => row.status === 'PENDING' && row.hasFile);

  /** Moves the viewer on from `fromId` — the next reviewable proof after it,
   *  wrapping round — or closes it when none are left. */
  async function advanceFrom(fromId: string) {
    const index = rows.findIndex((row) => row.id === fromId);
    const ordered = [...rows.slice(index + 1), ...rows.slice(0, Math.max(index, 0))];
    const next = ordered.find((row) => row.status === 'PENDING' && row.hasFile && row.id !== fromId);

    if (!next) {
      setReceipt(null);
      setNotice('Every proof on this page has been reviewed.');
      return;
    }

    const message = await loadReceipt(next);
    if (message) {
      setReceipt(null);
      setRowError({ id: next.id, message });
    }
  }

  /** Approve or reject from the viewer, then move on. Returns an error to show
   *  in the viewer, or null once handled. */
  async function decideInViewer(proof: PaymentProofRow, decide: () => ReturnType<typeof approveProof>) {
    setBusyId(proof.id);
    try {
      const result = await decide();
      if (result.ok) {
        applyUpdate(result.proof);
        await advanceFrom(proof.id);
        return null;
      }
      if (result.stale) {
        setReceipt(null);
        handleStale(result.message);
        return null;
      }
      return result.message;
    } finally {
      setBusyId(null);
    }
  }

  const reviewControls = (proof: PaymentProofRow) =>
    proof.status === 'PENDING'
      ? {
          position: reviewable.findIndex((row) => row.id === proof.id) + 1,
          total: reviewable.length,
          busy: busyId === proof.id,
          onApprove: () => decideInViewer(proof, () => approveProof(proof.id)),
          onReject: (reason: string) => decideInViewer(proof, () => rejectProof(proof.id, reason)),
          onSkip: () => {
            setBusyId(proof.id);
            void advanceFrom(proof.id).finally(() => setBusyId(null));
          },
        }
      : undefined;

  async function handleApprove(proof: PaymentProofRow) {
    setBusyId(proof.id);
    setRowError(null);
    try {
      const result = await approveProof(proof.id);
      setConfirming(null);
      if (result.ok) {
        applyUpdate(result.proof);
      } else if (result.stale) {
        handleStale(result.message);
      } else {
        setRowError({ id: proof.id, message: result.message });
      }
    } finally {
      setBusyId(null);
    }
  }

  /** Returns an error message to show inside the reject modal, or null on success. */
  async function handleReject(proof: PaymentProofRow, reason: string) {
    setBusyId(proof.id);
    setRowError(null);
    try {
      const result = await rejectProof(proof.id, reason);
      if (result.ok) {
        setRejecting(null);
        applyUpdate(result.proof);
        return null;
      }
      if (result.stale) {
        setRejecting(null);
        handleStale(result.message);
        return null;
      }
      return result.message;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {staleNotice && (
        <div className="pay-banner mb-4">
          <span aria-hidden>&#8635;</span>
          <span>
            {staleNotice}
            <button type="button" className="pay-link ml-2" onClick={() => setStaleNotice(null)}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      {notice && (
        <div className="pay-banner pay-banner--ok mb-4">
          <span aria-hidden>&#10003;</span>
          <span>
            {notice}
            <button type="button" className="pay-link ml-2" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </span>
        </div>
      )}

      <StatusFilters active={status} take={take} counts={counts} />

      <div className="admin-card mt-4 overflow-x-auto">
        {/* Fixed layout, same as the participants table: each column keeps its
            planned share whatever the rows on this page contain. */}
        <table className="proof-table text-sm">
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '19%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Participant</Th>
              <Th>Fee</Th>
              <Th>Submitted</Th>
              <Th>Receipt</Th>
              <Th align="center">Status</Th>
              <Th align="right">Review</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="viz-empty">
                  Nothing in this queue.
                </td>
              </tr>
            )}
            {rows.map((proof) => (
              <ProofRow
                key={proof.id}
                proof={proof}
                busy={busyId === proof.id}
                error={rowError?.id === proof.id ? rowError.message : null}
                focused={proof.id === focusProofId}
                justReviewed={proof.id === justReviewedId}
                now={now}
                onView={() => handleViewReceipt(proof)}
                confirming={confirming?.id === proof.id}
                onApprove={() => setConfirming(proof)}
                onConfirmApprove={() => handleApprove(proof)}
                onCancelApprove={() => setConfirming(null)}
                onReject={() => setRejecting(proof)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={total} skip={skip} take={take} status={status} count={rows.length} />

      <ModalPresence>
        {receipt && (
          <ReceiptModal
            proof={receipt.proof}
            url={receipt.url}
            review={reviewControls(receipt.proof)}
            onClose={() => setReceipt(null)}
          />
        )}
      </ModalPresence>

      <ModalPresence>
        {rejecting && (
          <RejectModal
            proof={rejecting}
            busy={busyId === rejecting.id}
            onSubmit={(reason) => handleReject(rejecting, reason)}
            onClose={() => setRejecting(null)}
          />
        )}
      </ModalPresence>
    </>
  );
}

function ProofRow({
  proof,
  busy,
  error,
  focused,
  justReviewed,
  now,
  onView,
  confirming,
  onApprove,
  onConfirmApprove,
  onCancelApprove,
  onReject,
}: {
  proof: PaymentProofRow;
  busy: boolean;
  error: string | null;
  focused: boolean;
  justReviewed: boolean;
  now: number;
  onView: () => void;
  /** This row's Approve was clicked and waits for its in-place confirm. */
  confirming: boolean;
  onApprove: () => void;
  onConfirmApprove: () => void;
  onCancelApprove: () => void;
  onReject: () => void;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  const pending = proof.status === 'PENDING';
  const hasReason = proof.status === 'REJECTED' && Boolean(proof.rejectionReason);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);

  // Escape backs out of a pending confirm, as it does in the viewer.
  useEscapeKey(confirming && !busy ? onCancelApprove : null);

  return (
    <>
      <tr
        ref={ref}
        data-reviewed={justReviewed ? proof.status : undefined}
        style={{
          // The reason / error line below belongs to this row, so the divider
          // moves under it.
          borderBottom: error || hasReason ? 'none' : '1px solid rgba(255,255,255,0.05)',
          background: focused ? 'rgba(0,232,122,0.06)' : undefined,
        }}
      >
        <Td className="proof-cell-who">
          <div className="truncate font-medium text-white" title={proof.participantName}>
            {proof.participantName}
          </div>
          <div
            className="truncate"
            style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}
            title={proof.participantEmail}
          >
            {proof.participantEmail}
          </div>
        </Td>
        <Td className="proof-cell-fee">
          <span className="text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatAmount(proof.currentFee)}
          </span>
        </Td>
        <Td className="proof-cell-when">
          <WaitTime proof={proof} now={now} />
        </Td>
        <Td className="proof-cell-receipt">
          {proof.hasFile ? (
            <button
              type="button"
              className="proof-file"
              onClick={onView}
              disabled={busy}
              title={proof.fileName ?? undefined}
            >
              <FileIcon pdf={isPdfReceipt(proof)} />
              {busy ? 'Opening…' : 'View'}
            </button>
          ) : (
            <span className="pay-no-receipt">No file</span>
          )}
        </Td>
        <Td className="proof-cell-status" align="center">
          <StatusMark status={proof.status} />
        </Td>
        <Td className="proof-cell-review" align="right">
          {pending && confirming ? (
            // Same two-step approval as the receipt viewer: approving can't be
            // undone from the dashboard, so it takes a second, in-place click.
            <div className="pay-actions">
              <button
                type="button"
                className="admin-btn-secondary px-3 py-1.5 text-xs"
                onClick={onCancelApprove}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary px-3 py-1.5 text-xs"
                onClick={onConfirmApprove}
                disabled={busy}
                autoFocus
              >
                {busy ? 'Approving…' : 'Yes, approve'}
              </button>
            </div>
          ) : pending ? (
            <div className="pay-actions">
              <button type="button" className="pay-btn-approve" onClick={onApprove} disabled={busy}>
                Approve
              </button>
              <button type="button" className="pay-btn-reject" onClick={onReject} disabled={busy}>
                Reject
              </button>
            </div>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
              {proof.reviewedAt ? `Reviewed ${formatDateTime(proof.reviewedAt)}` : 'Reviewed'}
            </span>
          )}
        </Td>
      </tr>

      {hasReason && (
        <tr className="proof-subrow" style={{ borderBottom: error ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={6} className="px-4 pb-3">
            <span className="proof-reason">
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>Reason sent:</span> {proof.rejectionReason}
            </span>
          </td>
        </tr>
      )}

      {error && (
        <tr className="proof-subrow" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={6} className="px-4 pb-3">
            <span className="pay-error">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

/** A proof's status in the participants table's icon language. All three
 *  share the same tinted ring, so no single status outshouts the queue. */
const PROOF_ICON_STATE: Record<PaymentProofStatus, PaymentState> = {
  APPROVED: 'PAID',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
};

function StatusMark({ status }: { status: PaymentProofStatus }) {
  const state = PROOF_ICON_STATE[status];
  return (
    <span
      className="pay-mark"
      style={{ '--pay-mark': PAYMENT_STATE_COLORS[state] } as React.CSSProperties}
      title={STATUS_LABELS[status]}
      role="img"
      aria-label={STATUS_LABELS[status]}
    >
      <PaymentIcon state={state} size={16} />
    </span>
  );
}

/** Proofs waiting longer than this are flagged, so the oldest get seen first. */
const LONG_WAIT_HOURS = 48;

/**
 * How long ago the proof came in, which is what a reviewer weighs; the exact
 * time is on hover. A pending proof past LONG_WAIT_HOURS turns amber.
 */
function WaitTime({ proof, now }: { proof: PaymentProofRow; now: number }) {
  const hours = (now - Date.parse(proof.createdAt)) / 3_600_000;
  const overdue = proof.status === 'PENDING' && hours >= LONG_WAIT_HOURS;

  return (
    <span
      className="proof-when"
      data-overdue={overdue ? '' : undefined}
      title={formatDateTime(proof.createdAt)}
      // Relative to now, so server and browser can disagree by a minute.
      suppressHydrationWarning
    >
      {timeAgo(hours)}
    </span>
  );
}

function timeAgo(hours: number) {
  const minutes = Math.floor(hours * 60);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** A photo for image receipts, a page for PDFs — what will open, before it does. */
function FileIcon({ pdf }: { pdf: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {pdf ? (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.75" />
          <path d="M21 16l-5-5-9 9" />
        </>
      )}
    </svg>
  );
}

function StatusFilters({
  active,
  take,
  counts,
}: {
  active: PaymentProofStatus | 'ALL';
  take: number;
  counts: Record<PaymentProofStatus | 'ALL', number>;
}) {
  const options: Array<{ value: PaymentProofStatus | 'ALL'; label: string }> = [
    ...PAYMENT_PROOF_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    { value: 'ALL', label: 'All' },
  ];

  return (
    <nav className="pay-filters" aria-label="Payment queues">
      {options.map((option) => (
        <Link
          key={option.value}
          href={`/payments?status=${option.value}&take=${take}`}
          className="pay-filter"
          data-active={option.value === active ? '' : undefined}
          aria-current={option.value === active ? 'page' : undefined}
          // Each filter is a fresh backend query; prefetching on hover would
          // fire them for filters nobody opens.
          prefetch={false}
        >
          {option.label}
          <span className="pay-filter-count">{counts[option.value]}</span>
        </Link>
      ))}
    </nav>
  );
}

function Pagination({
  total,
  skip,
  take,
  status,
  count,
}: {
  total: number;
  skip: number;
  take: number;
  status: PaymentProofStatus | 'ALL';
  count: number;
}) {
  const from = total === 0 ? 0 : skip + 1;
  const to = skip + count;
  const prev = Math.max(0, skip - take);
  const next = skip + take;

  return (
    <div className="pay-pagination mt-4">
      <span>
        {from}&ndash;{to} of {total}
      </span>
      <span className="flex gap-2">
        {skip > 0 && (
          <Link
            className="admin-btn-secondary px-3 py-1.5 text-xs"
            href={`/payments?status=${status}&skip=${prev}&take=${take}`}
            prefetch={false}
          >
            Previous
          </Link>
        )}
        {next < total && (
          <Link
            className="admin-btn-secondary px-3 py-1.5 text-xs"
            href={`/payments?status=${status}&skip=${next}&take=${take}`}
            prefetch={false}
          >
            Next
          </Link>
        )}
      </span>
    </div>
  );
}

type ReviewControls = {
  /** 1-based place of this proof among the page's reviewable proofs. */
  position: number;
  total: number;
  busy: boolean;
  /** Each resolves to an error to show here, or null once handled. */
  onApprove: () => Promise<string | null>;
  onReject: (reason: string) => Promise<string | null>;
  onSkip: () => void;
};

/**
 * The receipt, and — for a pending proof — the decision right under it, so a
 * reviewer reads the receipt and rules on it in one place. Approving takes a
 * second, in-place click: it cannot be undone from the dashboard.
 */
function ReceiptModal({
  proof,
  url,
  review,
  onClose,
}: {
  proof: PaymentProofRow;
  url: string;
  review?: ReviewControls;
  onClose: () => void;
}) {
  const isPdf = isPdfReceipt(proof);
  const [mode, setMode] = useState<'idle' | 'confirm' | 'reject'>('idle');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The viewer stays open while it moves to the next proof; start each fresh.
  const [shownId, setShownId] = useState(proof.id);
  if (shownId !== proof.id) {
    setShownId(proof.id);
    setMode('idle');
    setReason('');
    setError(null);
  }

  const busy = review?.busy ?? false;
  useEscapeKey(busy ? null : mode === 'idle' ? onClose : () => setMode('idle'));

  async function approve() {
    if (!review) return;
    setError(await review.onApprove());
  }

  async function reject() {
    if (!review) return;
    const invalid = validateRejectionReason(reason);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(await review.onReject(reason.trim()));
  }

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="admin-modal pay-modal-wide" onClick={(e) => e.stopPropagation()}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
          &times;
        </button>

        <div className="mb-4 pr-8">
          <h3 className="admin-heading text-lg text-white">{proof.participantName}</h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {formatAmount(proof.currentFee)} &middot; {proof.fileName}
          </p>
        </div>

        {isPdf ? (
          <iframe className="pay-preview-frame" src={url} title={`Receipt from ${proof.participantName}`} />
        ) : (
          // Supabase signed URL, valid for 60 seconds — deliberately not run
          // through next/image, whose optimizer would cache a URL that then expires.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pay-preview-img" src={url} alt={`Receipt from ${proof.participantName}`} />
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="pay-counter">This link expires in 60 seconds.</span>
          <a className="pay-link" href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>

        {review && (
          <div className="review-bar">
            {mode === 'reject' ? (
              <div className="space-y-2">
                <textarea
                  className="admin-input pay-textarea"
                  value={reason}
                  maxLength={REJECTION_REASON_MAX}
                  placeholder="What should they fix? They see this word for word."
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError(null);
                  }}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="pay-error">{error ?? ''}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="pay-counter">
                      {reason.trim().length}/{REJECTION_REASON_MAX}
                    </span>
                    <button
                      type="button"
                      className="admin-btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => setMode('idle')}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button type="button" className="pay-btn-reject" onClick={reject} disabled={busy}>
                      {busy ? 'Sending…' : 'Send rejection'}
                    </button>
                  </span>
                </div>
              </div>
            ) : mode === 'confirm' ? (
              <div className="review-row">
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  Mark <strong className="text-white">{proof.participantName}</strong> as paid? This can&apos;t be
                  undone here.
                </span>
                <span className="review-actions">
                  <button
                    type="button"
                    className="admin-btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => setMode('idle')}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="admin-btn-primary px-3 py-1.5 text-xs"
                    onClick={approve}
                    disabled={busy}
                    autoFocus
                  >
                    {busy ? 'Approving…' : 'Yes, approve'}
                  </button>
                </span>
              </div>
            ) : (
              <div className="review-row">
                <span className="pay-counter" style={{ fontSize: 12 }}>
                  Proof {review.position} of {review.total} to review
                </span>
                <span className="review-actions">
                  <button
                    type="button"
                    className="pay-link"
                    onClick={review.onSkip}
                    disabled={busy || review.total < 2}
                  >
                    Skip
                  </button>
                  <button type="button" className="pay-btn-reject" onClick={() => setMode('reject')} disabled={busy}>
                    Reject
                  </button>
                  <button type="button" className="pay-btn-approve" onClick={() => setMode('confirm')} disabled={busy}>
                    Approve
                  </button>
                </span>
              </div>
            )}
            {mode !== 'reject' && error && <p className="pay-error mt-2">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function RejectModal({
  proof,
  busy,
  onSubmit,
  onClose,
}: {
  proof: PaymentProofRow;
  busy: boolean;
  onSubmit: (reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(busy ? null : onClose);

  async function submit() {
    // Mirrors the backend's own bounds so an invalid reason never round-trips.
    const validationError = validateRejectionReason(reason);
    if (validationError) {
      setError(validationError);
      return;
    }
    const serverError = await onSubmit(reason.trim());
    if (serverError) setError(serverError);
  }

  const trimmedLength = reason.trim().length;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h3 className="admin-heading mb-1 text-lg text-white">Reject payment</h3>
        <p className="mb-4 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <strong className="text-white">{proof.participantName}</strong>{' '}
          sees this word for word, and can submit a new receipt afterwards. Say what they need to fix &mdash;
          &ldquo;screenshot unreadable&rdquo;, &ldquo;amount doesn&apos;t match&rdquo;.
        </p>

        <textarea
          className="admin-input pay-textarea"
          value={reason}
          maxLength={REJECTION_REASON_MAX}
          placeholder="What should they do differently?"
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(null);
          }}
          autoFocus
        />

        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="pay-error">{error ?? ''}</span>
          <span className="pay-counter">
            {trimmedLength}/{REJECTION_REASON_MAX}
          </span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pay-btn-reject px-4 py-2 text-sm" onClick={submit} disabled={busy}>
            {busy ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

type Align = 'left' | 'center' | 'right';

// Alignment is a class rather than an inline style, so the stylesheet's
// mobile card layout can override it.
const ALIGN_CLASSES: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: Align }) {
  return (
    <th
      className={`px-4 py-3 text-[11px] font-semibold uppercase ${ALIGN_CLASSES[align]}`}
      style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  align?: Align;
}) {
  return (
    <td className={`px-4 py-3 ${ALIGN_CLASSES[align]} ${className ?? ''}`} style={style}>
      {children}
    </td>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
