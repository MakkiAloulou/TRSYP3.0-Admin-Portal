'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  METHOD_LABELS,
  PAYMENT_PROOF_STATUSES,
  REJECTION_REASON_MAX,
  STATUS_LABELS,
  formatAmount,
  isCashWithoutReceipt,
  isPdfReceipt,
  validateRejectionReason,
  type PaymentProofRow,
  type PaymentProofStatus,
} from '@/lib/payment';
import { useEscapeKey } from '@/lib/use-escape-key';
import { ModalPresence } from '../modal-presence';
import { approveProof, getReceiptUrl, rejectProof } from './actions';

type Props = {
  proofs: PaymentProofRow[];
  total: number;
  skip: number;
  take: number;
  status: PaymentProofStatus | 'ALL';
  /** Deep link from the participants page — highlights that row on arrival. */
  focusProofId?: string;
};

export function PaymentsTable({ proofs, total, skip, take, status, focusProofId }: Props) {
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
  const [receipt, setReceipt] = useState<{ proof: PaymentProofRow; url: string } | null>(null);
  const [confirming, setConfirming] = useState<PaymentProofRow | null>(null);
  const [rejecting, setRejecting] = useState<PaymentProofRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  // The row a review just changed, tinted briefly so the reviewer sees which one moved.
  const [justReviewedId, setJustReviewedId] = useState<string | null>(null);

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

  async function handleViewReceipt(proof: PaymentProofRow) {
    setBusyId(proof.id);
    setRowError(null);
    try {
      // Signed URLs expire after 60s, so they are fetched per click, never upfront.
      const result = await getReceiptUrl(proof.id);
      if (!result.ok) {
        setRowError({ id: proof.id, message: result.message });
        return;
      }
      setReceipt({ proof, url: result.url });
    } finally {
      setBusyId(null);
    }
  }

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

      <StatusFilters active={status} take={take} />

      <div className="admin-card mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Participant</Th>
              <Th>Price</Th>
              <Th>Submitted</Th>
              <Th>Receipt</Th>
              <Th>Status</Th>
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
                onView={() => handleViewReceipt(proof)}
                onApprove={() => setConfirming(proof)}
                onReject={() => setRejecting(proof)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={total} skip={skip} take={take} status={status} count={rows.length} />

      <ModalPresence>
        {receipt && <ReceiptModal proof={receipt.proof} url={receipt.url} onClose={() => setReceipt(null)} />}
      </ModalPresence>

      <ModalPresence>
        {confirming && (
          <ApproveModal
            proof={confirming}
            busy={busyId === confirming.id}
            onConfirm={() => handleApprove(confirming)}
            onClose={() => setConfirming(null)}
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
  onView,
  onApprove,
  onReject,
}: {
  proof: PaymentProofRow;
  busy: boolean;
  error: string | null;
  focused: boolean;
  justReviewed: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  const cashInPerson = isCashWithoutReceipt(proof);
  const pending = proof.status === 'PENDING';

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);

  return (
    <>
      <tr
        ref={ref}
        className={cashInPerson ? 'pay-row--cash' : undefined}
        data-reviewed={justReviewed ? proof.status : undefined}
        style={{
          borderBottom: error ? 'none' : '1px solid rgba(255,255,255,0.05)',
          background: focused ? 'rgba(0,232,122,0.06)' : undefined,
        }}
      >
        <Td>
          <div className="font-medium text-white">{proof.participantName}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{proof.participantEmail}</div>
        </Td>
        <Td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(proof.currentFee)}</Td>
        <Td style={{ color: 'rgba(255,255,255,0.5)' }}>{formatDateTime(proof.createdAt)}</Td>
        <Td>
          {cashInPerson ? (
            // Handed to a committee member in person: there is no file to open,
            // so no receipt button is rendered at all.
            <span className="pay-no-receipt">Paid in person</span>
          ) : proof.hasFile ? (
            <button type="button" className="pay-link" onClick={onView} disabled={busy}>
              {busy ? 'Opening...' : (proof.fileName ?? 'View receipt')}
            </button>
          ) : (
            <span className="pay-no-receipt">No file</span>
          )}
        </Td>
        <Td>
          <StatusBadge status={proof.status} />
        </Td>
        <Td align="right">
          {pending ? (
            <div className="pay-actions">
              <button type="button" className="pay-btn-approve" onClick={onApprove} disabled={busy}>
                Approve
              </button>
              <button type="button" className="pay-btn-reject" onClick={onReject} disabled={busy}>
                Reject
              </button>
            </div>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              {proof.reviewedAt ? `Reviewed ${formatDateTime(proof.reviewedAt)}` : 'Reviewed'}
            </span>
          )}
        </Td>
      </tr>

      {proof.status === 'REJECTED' && proof.rejectionReason && (
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={6} className="px-4 pb-3" style={{ color: 'var(--color-pink)', fontSize: 12 }}>
            Reason sent to participant: &ldquo;{proof.rejectionReason}&rdquo;
          </td>
        </tr>
      )}

      {error && (
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={6} className="px-4 pb-3">
            <span className="pay-error">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: PaymentProofStatus }) {
  const variant =
    status === 'APPROVED'
      ? 'admin-badge--green'
      : status === 'REJECTED'
        ? 'admin-badge--pink'
        : 'admin-badge--amber';
  return <span className={`admin-badge ${variant}`}>{STATUS_LABELS[status]}</span>;
}

function StatusFilters({ active, take }: { active: PaymentProofStatus | 'ALL'; take: number }) {
  const options: Array<{ value: PaymentProofStatus | 'ALL'; label: string }> = [
    ...PAYMENT_PROOF_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    { value: 'ALL', label: 'All' },
  ];

  return (
    <div className="pay-filters">
      {options.map((option) => (
        <Link
          key={option.value}
          href={`/payments?status=${option.value}&take=${take}`}
          className="pay-filter"
          data-active={option.value === active ? '' : undefined}
          // Each filter is a fresh backend query; prefetching on hover would
          // fire them for filters nobody opens.
          prefetch={false}
        >
          {option.label}
        </Link>
      ))}
    </div>
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

function ReceiptModal({ proof, url, onClose }: { proof: PaymentProofRow; url: string; onClose: () => void }) {
  const isPdf = isPdfReceipt(proof);
  useEscapeKey(onClose);

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal pay-modal-wide" onClick={(e) => e.stopPropagation()}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="mb-4">
          <h3 className="admin-heading text-lg text-white">{proof.participantName}</h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {METHOD_LABELS[proof.method]} &middot; {formatAmount(proof.currentFee)} &middot; {proof.fileName}
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

        <div className="mt-4 flex items-center justify-between">
          <span className="pay-counter">This link expires in 60 seconds.</span>
          <a className="pay-link" href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({
  proof,
  busy,
  onConfirm,
  onClose,
}: {
  proof: PaymentProofRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEscapeKey(busy ? null : onClose);

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h3 className="admin-heading mb-3 text-lg text-white">Approve this payment?</h3>

        <p className="mb-4 text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
          This marks <strong className="text-white">{proof.participantName}</strong> as paid. Approving cannot be undone
          from this dashboard.
        </p>

        {isCashWithoutReceipt(proof) && (
          <div className="pay-banner mb-4">
            <span aria-hidden>!</span>
            <span>Cash payment with no receipt &mdash; confirm it against the committee&apos;s own records first.</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="admin-btn-primary px-4 py-2 text-sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Approving...' : 'Approve'}
          </button>
        </div>
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

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className="px-4 py-3 text-[11px] font-semibold uppercase"
      style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textAlign: align ?? 'left' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
  align,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  align?: 'right';
}) {
  return (
    <td className={`px-4 py-3 ${className ?? ''}`} style={{ textAlign: align ?? 'left', ...style }}>
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
