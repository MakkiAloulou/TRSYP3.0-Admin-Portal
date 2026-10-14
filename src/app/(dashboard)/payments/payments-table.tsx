'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PAYMENT_PROOF_STATUSES,
  PAYMENT_STATE_COLORS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  REJECTION_REASON_MAX,
  STATUS_LABELS,
  formatAmount,
  isPdfReceipt,
  validateRejectionReason,
  type PaymentProofRow,
  type PaymentProofStatus,
  type PaymentState,
  type PaymentType,
  type ProofFilter,
} from '@/lib/payment';
import { useEscapeKey } from '@/lib/use-escape-key';
import { ModalPresence } from '../modal-presence';
import { PaymentIcon } from '../payment-icon';
import { approveProof, getReceiptUrl, rejectProof, setPaymentType } from './actions';
import { downloadXlsx } from '@/lib/xlsx';
import { buildPaymentsXlsx, paymentsXlsxFilename } from './export-payments';

type Props = {
  /** Every payment in the open tab: the page shows them all, no paging. */
  proofs: PaymentProofRow[];
  status: ProofFilter;
  /** How many participants sit in each tab. */
  counts: Record<ProofFilter, number>;
  /** Deep link from the participants page — highlights that row on arrival. */
  focusProofId?: string;
};

/** Search and payment type, applied in the browser to the open tab's rows. */
type TableFilters = { query: string; type: PaymentType | 'ALL' };

const NO_TABLE_FILTERS: TableFilters = { query: '', type: 'ALL' };

/** Read from the URL, so a search survives a refresh and a switch of tab. */
function tableFiltersFrom(params: URLSearchParams): TableFilters {
  const type = params.get('type');
  return {
    query: params.get('q') ?? '',
    type: PAYMENT_TYPES.includes(type as PaymentType) ? (type as PaymentType) : NO_TABLE_FILTERS.type,
  };
}

/** A tab's URL carrying the search and type along with it. */
function paymentsHref(status: ProofFilter, filters: TableFilters) {
  const params = new URLSearchParams({ status });
  if (filters.query) params.set('q', filters.query);
  if (filters.type !== 'ALL') params.set('type', filters.type);
  return `/payments?${params}`;
}

function matchesFilters(proof: PaymentProofRow, { query, type }: TableFilters) {
  if (type !== 'ALL' && proof.paymentType !== type) return false;
  const needle = query.trim().toLowerCase();
  return !needle || `${proof.participantName} ${proof.participantEmail}`.toLowerCase().includes(needle);
}

export function PaymentsTable({ proofs, status, counts, focusProofId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TableFilters>(() => tableFiltersFrom(searchParams));

  // replaceState, as on the participants page: the URL keeps up without
  // refetching the queue, and a deep-linked proof stays in it.
  function setFilter<K extends keyof TableFilters>(key: K, value: TableFilters[K]) {
    applyFilters({ ...filters, [key]: value });
  }

  function applyFilters(next: TableFilters) {
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const [name, v] of [['q', next.query], ['type', next.type === 'ALL' ? '' : next.type]] as const) {
      if (v) params.set(name, v);
      else params.delete(name);
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }

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
  // The type being saved, shown as chosen while it saves. Kept apart from
  // busyId, which also drives the receipt button's "Opening…".
  const [typing, setTyping] = useState<{ id: string; type: PaymentType } | null>(null);
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

  // What is on screen. Review walks, the export and the counts below all
  // follow it, so a search narrows everything at once.
  const visible = useMemo(() => rows.filter((row) => matchesFilters(row, filters)), [rows, filters]);
  const isFiltered = filters.query.trim() !== '' || filters.type !== 'ALL';

  // The proofs the viewer can walk through: pending, with a receipt to read.
  const reviewable = visible.filter((row) => row.status === 'PENDING' && row.hasFile);

  /** Moves the viewer on from `fromId` — the next reviewable proof after it,
   *  wrapping round — or closes it when none are left. */
  async function advanceFrom(fromId: string) {
    const index = visible.findIndex((row) => row.id === fromId);
    const ordered = [...visible.slice(index + 1), ...visible.slice(0, Math.max(index, 0))];
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

  async function handleSetType(proof: PaymentProofRow, paymentType: PaymentType) {
    setTyping({ id: proof.id, type: paymentType });
    setRowError(null);
    try {
      const result = await setPaymentType(proof.id, paymentType);
      if (result.ok) {
        applyUpdate(result.proof);
      } else {
        setRowError({ id: proof.id, message: result.message });
      }
    } finally {
      setTyping(null);
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

      <StatusFilters active={status} counts={counts} filters={filters} />

      <div className="admin-card part-toolbar mt-4">
        <div className="part-toolbar-top">
          <input
            type="search"
            className="admin-input part-search"
            placeholder="Search name or email"
            value={filters.query}
            onChange={(e) => setFilter('query', e.target.value)}
            aria-label="Search payments"
          />
          <select
            className="admin-input part-select part-toolbar-btn"
            value={filters.type}
            onChange={(e) => setFilter('type', e.target.value as TableFilters['type'])}
            aria-label="Payment type"
            title="Only approved payments have a type"
          >
            <option value="ALL">Any type</option>
            {PAYMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PAYMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            // The rows as shown, so a payment type set a moment ago is in the file.
            onClick={async () => downloadXlsx(await buildPaymentsXlsx(visible), paymentsXlsxFilename(status))}
            disabled={visible.length === 0}
            title="Download what is shown as a spreadsheet: name, email, fee, payment type, payment and review dates"
          >
            Export Excel
          </button>
        </div>

        {isFiltered && (
          <div className="part-toolbar-foot">
            <span>
              Showing {visible.length} of {rows.length}
            </span>
            <button type="button" className="pay-link" onClick={() => applyFilters(NO_TABLE_FILTERS)}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="admin-card mt-4 overflow-x-auto">
        {/* Fixed layout, same as the participants table: each column keeps its
            planned share whatever the rows on this page contain. */}
        <table className="proof-table text-sm">
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '19%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Participant</Th>
              <Th align="center">Fee</Th>
              <Th>Submitted</Th>
              <Th align="center">Receipt</Th>
              <Th align="center">Paid via</Th>
              <Th align="center">Status</Th>
              <Th align="right">Review</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="viz-empty">
                  {rows.length === 0 ? 'Nothing in this queue.' : 'No payment matches this search.'}
                </td>
              </tr>
            )}
            {visible.map((proof) => (
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
                pendingType={typing?.id === proof.id ? typing.type : null}
                onSetType={(paymentType) => handleSetType(proof, paymentType)}
              />
            ))}
          </tbody>
        </table>
      </div>

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
  pendingType,
  onSetType,
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
  /** The payment type being saved for this row, if one is. */
  pendingType: PaymentType | null;
  onSetType: (paymentType: PaymentType) => void;
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
        <Td className="proof-cell-fee" align="center" label="Fee">
          <span className="text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatAmount(proof.currentFee)}
          </span>
        </Td>
        <Td className="proof-cell-when" label="Submitted">
          <WaitTime proof={proof} now={now} />
        </Td>
        <Td className="proof-cell-receipt" align="center" label="Receipt">
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
        <Td
          className={proof.status === 'APPROVED' ? 'proof-cell-type' : 'proof-cell-type proof-cell-type--none'}
          align="center"
        >
          {/* Only approved payments hold money, so only they get a type. */}
          {proof.status === 'APPROVED' ? (
            <PaymentVia proof={proof} pending={pendingType} onSet={onSetType} />
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>&mdash;</span>
          )}
        </Td>
        <Td className="proof-cell-status" align="center">
          <StatusMark status={proof.status} />
        </Td>
        <Td className="proof-cell-review" align="right" label="Review">
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
          <td colSpan={7} className="px-4 pb-3">
            <span className="proof-reason">
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>Reason sent:</span> {proof.rejectionReason}
            </span>
          </td>
        </tr>
      )}

      {error && (
        <tr className="proof-subrow" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={7} className="px-4 pb-3">
            <span className="pay-error">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}

/** For a table cell too narrow for the full names; cards and chips spell them out. */
const PAYMENT_TYPE_SHORT: Record<PaymentType, string> = {
  BANK_TRANSFER: 'Bank',
  INTERNAL_FUND: 'Fund',
  CASH: 'Cash',
};

/**
 * How the money arrived, as the treasurer confirms it.
 *
 * Unconfirmed, it is an empty slot to fill: Bank / Fund / Cash, one click
 * each. Confirmed, it settles into a single chip in the type's own colour, so
 * a long column reads as tags rather than as a wall of controls; clicking the
 * chip reopens the choice. A choice shows while it saves and falls back if
 * the save fails.
 */
function PaymentVia({
  proof,
  pending,
  onSet,
}: {
  proof: PaymentProofRow;
  pending: PaymentType | null;
  onSet: (paymentType: PaymentType) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Set by a choice made here, so only that chip animates in, not every chip on load.
  const [fresh, setFresh] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const shown = pending ?? proof.paymentType;
  const state = shown === null ? 'unset' : editing ? 'editing' : 'set';

  // Opening from the chip moves focus onto the current choice.
  useEffect(() => {
    if (editing) trayRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, [editing]);

  // Back on the chip once it can take focus again (it is disabled while saving),
  // unless the reviewer has already moved on.
  useEffect(() => {
    if (state !== 'set' || pending !== null || !returnFocus.current) return;
    returnFocus.current = false;
    if (document.activeElement === document.body) chipRef.current?.focus();
  }, [state, pending]);

  // A press anywhere else closes an open picker. Pointer, not blur: Safari
  // does not focus a clicked button, so a blur check would close the picker
  // before the click on an option landed.
  useEffect(() => {
    if (!editing) return;
    function onPointerDown(event: PointerEvent) {
      if (!trayRef.current?.contains(event.target as Node)) setEditing(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [editing]);

  useEscapeKey(
    editing
      ? () => {
          returnFocus.current = true;
          setEditing(false);
        }
      : null,
  );

  function choose(type: PaymentType) {
    returnFocus.current = true;
    setEditing(false);
    if (type === proof.paymentType) return;
    setFresh(true);
    onSet(type);
  }

  return (
    <div className="pay-via" data-state={state}>
      <span className="pay-via-caption" aria-hidden>
        {state === 'set' ? 'Paid via' : 'How was this paid?'}
      </span>

      {state === 'set' && shown ? (
        <button
          ref={chipRef}
          type="button"
          className="pay-via-chip"
          data-type={shown}
          data-fresh={fresh ? '' : undefined}
          aria-busy={pending ? true : undefined}
          aria-label={`Paid via ${PAYMENT_TYPE_LABELS[shown]}. Change`}
          title="Change how this was paid"
          disabled={pending !== null}
          onClick={() => setEditing(true)}
        >
          <PaymentTypeIcon type={shown} />
          <span className="pay-via-chip-label">{PAYMENT_TYPE_LABELS[shown]}</span>
          <svg className="pay-via-edit" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M11.2 2.8a1.6 1.6 0 0 1 2.3 2.3L6 12.6l-3 .7.7-3 7.5-7.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <div
          ref={trayRef}
          role="group"
          className="pay-via-tray"
          aria-label={`How ${proof.participantName} paid${shown ? '' : ', to confirm'}`}
        >
          {PAYMENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="pay-via-option"
              data-type={type}
              aria-pressed={shown === type}
              aria-label={PAYMENT_TYPE_LABELS[type]}
              title={PAYMENT_TYPE_LABELS[type]}
              onClick={() => choose(type)}
            >
              <PaymentTypeIcon type={type} />
              {/* The cell's width picks one (see .pay-via in globals.css). */}
              <span className="pay-via-short">{PAYMENT_TYPE_SHORT[type]}</span>
              <span className="pay-via-full">{PAYMENT_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One drawn mark per type, same 1.5 stroke as the receipt icon. */
function PaymentTypeIcon({ type }: { type: PaymentType }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="pay-via-icon"
    >
      {type === 'BANK_TRANSFER' && (
        <>
          {/* A bank: pediment, three columns, base. */}
          <path d="M2 6 8 2.5 14 6" />
          <path d="M4 7.5v4.5M8 7.5v4.5M12 7.5v4.5" />
          <path d="M2 13.5h12" />
        </>
      )}
      {type === 'INTERNAL_FUND' && (
        <>
          {/* A vault: the organisation's own reserve. */}
          <rect x="2" y="2.5" width="12" height="11" rx="2" />
          <circle cx="7.5" cy="8" r="2.5" />
          <path d="M10 8h1.75M4.5 13.5v1M11.5 13.5v1" />
        </>
      )}
      {type === 'CASH' && (
        <>
          {/* A banknote. */}
          <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
          <circle cx="8" cy="8" r="1.75" />
          <path d="M4.25 8h.01M11.75 8h.01" />
        </>
      )}
    </svg>
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
  counts,
  filters,
}: {
  active: ProofFilter;
  counts: Record<ProofFilter, number>;
  filters: TableFilters;
}) {
  const options: Array<{ value: ProofFilter; label: string }> = [
    ...PAYMENT_PROOF_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    { value: 'ALL', label: 'All' },
    // The treasurer's queue: approved payments with no type yet.
    { value: 'TO_CONFIRM', label: 'To confirm' },
  ];

  return (
    <nav className="pay-filters" aria-label="Payment queues">
      {options.map((option) => (
        <Link
          key={option.value}
          href={paymentsHref(option.value, filters)}
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
  label,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  align?: Align;
  /** The column's name, shown above the value where cards replace the header (tablet). */
  label?: string;
}) {
  return (
    <td className={`px-4 py-3 ${ALIGN_CLASSES[align]} ${className ?? ''}`} style={style} data-label={label}>
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
