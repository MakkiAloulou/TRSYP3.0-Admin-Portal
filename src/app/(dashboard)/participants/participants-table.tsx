'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEscapeKey } from '@/lib/use-escape-key';
import { ModalPresence } from '../modal-presence';
import { PaymentIcon } from '../payment-icon';
import { Skeleton } from '../loading-skeletons';
import { downloadXlsx } from '@/lib/xlsx';
import { buildParticipantsXlsx, participantsXlsxFilename } from './export-participants';
import {
  PAYMENT_STATES,
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
  derivePaymentState,
  feeFor,
  formatAmount,
  type PaymentProofStatus,
  type PaymentState,
} from '@/lib/payment';
import type { IeeeVerification } from '@/lib/ieee-verification';
import { IeeeSection, useIeeeVerification } from './ieee-verify';
import { getParticipantDetails } from './actions';
import { recordCashPayment, type CashResult } from '../payments/actions';
import { ParticipantAvatar } from './hybrid-avatar';

type InternationalInfo = {
  dateOfBirth: string;
  countryOfResidence: string;
  cityOfResidence: string;
  affiliation: string;
  expectedArrivalDate: string;
  expectedDepartureDate: string;
  requiresVisaLetter: boolean;
  visaApplication: { status: string } | null;
};

type Membership = {
  activity: 'COMPETITION' | 'CHALLENGE' | 'FABLAB';
  team: { name: string; code: string; leaderId: string };
};

export type ParticipantRow = {
  id: string;
  ieeeId: number | null;
  phone: string;
  gender: string;
  paid: boolean;
  isInternational: boolean;
  banned: boolean;
  participantType: string;
  isRas: boolean;
  /** Agreed exception to the fee table, in TND; null when priced normally. */
  feeOverride: number | null;
  /** The participant's own answer; separate from IEEE's verdict. */
  careerStage: string | null;
  sb: string | null;
  country: string;
  memberships: Membership[];
  /** Their double, residents (them included) and all. */
  room: { code: string; residents: { id: string; user: { name: string; lastName: string } }[] } | null;
  internationalInfo: InternationalInfo | null;
  /** This participant's most recent proof, if they have ever submitted one. The
   *  participant record carries only `paid`, so this is what separates awaiting
   *  review from turned down from never sent. Joined in by the page from the
   *  payments API, not a Participant field. */
  latestProof: { id: string; status: PaymentProofStatus } | null;
  /** Latest IEEE membership check, if one has ever run. Whether it still
   *  applies is decided by deriveIeeeState, not by its presence. */
  ieeeVerification: IeeeVerification | null;
  user: {
    name: string;
    lastName: string;
    email: string;
    active: boolean;
    createdAt: string;
    /** The main site's avatar settings (users.avatar), when loaded and set. */
    avatar?: unknown;
  };
};

/**
 * A participant as the table holds them: only what it shows, searches and
 * filters on. The full record (ParticipantRow) is fetched when their details
 * open or the list is exported — see participant-queries.ts.
 */
export type ParticipantListRow = Pick<
  ParticipantRow,
  | 'id'
  | 'ieeeId'
  | 'phone'
  | 'paid'
  | 'banned'
  | 'isInternational'
  | 'participantType'
  | 'isRas'
  | 'feeOverride'
  | 'sb'
  | 'country'
  | 'memberships'
  | 'latestProof'
> & {
  user: Pick<ParticipantRow['user'], 'name' | 'lastName' | 'email' | 'active'>;
  /** Whether IEEE's stored answer still applies to the profile as it stands. */
  ieeeVerified: boolean;
  /** Where they stand on rooming, from their room's resident count. */
  rooming: RoomingState;
  /** Only set by a re-check made during this visit (useIeeeVerification). */
  ieeeVerification?: IeeeVerification | null;
};

/** The payments service's answer for this page, streamed in after the table. */
export type PaymentsInfo =
  | {
      ok: true;
      /** Each participant's newest proof, by participant id. */
      latest: Record<string, { id: string; status: PaymentProofStatus }>;
      /** Set when there were more proofs than one fetch reads. */
      truncatedAt: number | null;
    }
  | { ok: false; message: string };

type ActivityFilter = 'ALL' | 'COMPETITION' | 'CHALLENGE' | 'FABLAB' | 'NONE';

/** In a double with a roommate, alone in one waiting for a roommate, or in none. */
export type RoomingState = 'FULL' | 'WAITING' | 'NONE';
type RoomingFilter = 'ALL' | RoomingState;

type Filters = {
  query: string;
  payment: PaymentState | 'ALL';
  membership: MembershipFilter;
  /** A student branch code, 'ALL', or 'NONE' for participants without one. */
  sb: string;
  activity: ActivityFilter;
  rooming: RoomingFilter;
};

/** The same three things the Membership column shows. IEEE includes RAS
 *  members, since every RAS member is also an IEEE member. */
type MembershipFilter = 'ALL' | 'NON_IEEE' | 'IEEE' | 'RAS';

const NO_FILTERS: Filters = {
  query: '',
  payment: 'ALL',
  membership: 'ALL',
  sb: 'ALL',
  activity: 'ALL',
  rooming: 'ALL',
};

/** URL parameter for each filter, so a filtered view survives a refresh, a
 *  shared link, and the round trip to a proof and back. */
const FILTER_PARAMS: Record<keyof Filters, string> = {
  query: 'q',
  payment: 'payment',
  membership: 'membership',
  sb: 'sb',
  activity: 'activity',
  rooming: 'rooming',
};

const MEMBERSHIP_FILTERS: MembershipFilter[] = ['ALL', 'NON_IEEE', 'IEEE', 'RAS'];
const ACTIVITY_FILTERS: ActivityFilter[] = ['ALL', 'COMPETITION', 'CHALLENGE', 'FABLAB', 'NONE'];
const ROOMING_FILTERS: RoomingFilter[] = ['ALL', 'FULL', 'WAITING', 'NONE'];

/** Filters from the URL, ignoring any value that isn't a real option. */
function filtersFromParams(params: URLSearchParams): Filters {
  const pick = <T extends string>(key: keyof Filters, allowed: readonly T[]) => {
    const value = params.get(FILTER_PARAMS[key]);
    return allowed.includes(value as T) ? (value as T) : (NO_FILTERS[key] as T);
  };

  return {
    query: params.get(FILTER_PARAMS.query) ?? '',
    payment: pick('payment', ['ALL', ...PAYMENT_STATES]),
    membership: pick('membership', MEMBERSHIP_FILTERS),
    sb: params.get(FILTER_PARAMS.sb) || 'ALL',
    activity: pick('activity', ACTIVITY_FILTERS),
    rooming: pick('rooming', ROOMING_FILTERS),
  };
}

/** The current URL with only non-default filters set. */
function urlForFilters(filters: Filters) {
  const params = new URLSearchParams();
  for (const key of Object.keys(FILTER_PARAMS) as (keyof Filters)[]) {
    if (filters[key] !== NO_FILTERS[key]) params.set(FILTER_PARAMS[key], filters[key]);
  }
  const search = params.toString();
  return search ? `?${search}` : window.location.pathname;
}

/** Read from the priced `participantType` / `isRas`, which an IEEE check
 *  writes through — so once a check has run, this is IEEE's answer. */
function isIeee(p: Pick<ParticipantRow, 'participantType'>) {
  return p.participantType !== 'NonIEEE';
}

function isRas(p: Pick<ParticipantRow, 'participantType' | 'isRas'>) {
  return isIeee(p) && p.isRas;
}

/** Everything the search box looks through, lowercased once per participant. */
function searchableText(p: ParticipantListRow) {
  return [
    p.user.name,
    p.user.lastName,
    p.user.email,
    p.phone,
    p.ieeeId?.toString(),
    p.sb,
    p.country,
    ...p.memberships.flatMap((m) => [m.team.name, m.team.code]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matches(p: ParticipantListRow, filters: Filters, haystack: string) {
  const query = filters.query.trim().toLowerCase();
  if (query && !haystack.includes(query)) return false;

  if (filters.payment !== 'ALL') {
    if (derivePaymentState(p.paid, p.latestProof?.status ?? null) !== filters.payment) return false;
  }

  if (filters.membership === 'NON_IEEE' && isIeee(p)) return false;
  if (filters.membership === 'IEEE' && !isIeee(p)) return false;
  if (filters.membership === 'RAS' && !isRas(p)) return false;

  // Non-students and most internationals have no branch at all, so "No branch"
  // is a meaningful thing to filter for rather than an empty case.
  if (filters.sb === 'NONE') {
    if (p.sb) return false;
  } else if (filters.sb !== 'ALL' && p.sb !== filters.sb) {
    return false;
  }

  if (filters.activity === 'NONE') {
    if (p.memberships.length > 0) return false;
  } else if (filters.activity !== 'ALL') {
    if (!p.memberships.some((m) => m.activity === filters.activity)) return false;
  }

  if (filters.rooming !== 'ALL' && p.rooming !== filters.rooming) return false;

  return true;
}

export function ParticipantsTable({
  participants,
  payments,
}: {
  participants: ParticipantListRow[];
  /** Resolves once the payments service answers; the table shows meanwhile. */
  payments: Promise<PaymentsInfo>;
}) {
  const [paymentsInfo, setPaymentsInfo] = useState<PaymentsInfo | null>(null);
  useEffect(() => {
    let live = true;
    void payments.then((info) => {
      if (live) setPaymentsInfo(info);
    });
    return () => {
      live = false;
    };
  }, [payments]);
  const paymentsReady = paymentsInfo !== null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const ieee = useIeeeVerification(participants);

  // Cash payments recorded this visit, participant id -> the new proof's id.
  // Laid over the rows so the row and popup turn Paid before the refresh lands.
  const [cashPaid, setCashPaid] = useState<Record<string, string>>({});
  const router = useRouter();

  // Rows with this session's IEEE results merged in; everything below reads
  // these, so a row updates the moment its batch returns.
  // Each row's newest proof joined in once the payments service has answered.
  const rows = useMemo(() => {
    const joined = paymentsInfo?.ok
      ? ieee.rows.map((p) => ({ ...p, latestProof: paymentsInfo.latest[p.id] ?? null }))
      : ieee.rows;
    return joined.map((p) =>
      cashPaid[p.id] ? { ...p, paid: true, latestProof: { id: cashPaid[p.id], status: 'APPROVED' as const } } : p,
    );
  }, [ieee.rows, paymentsInfo, cashPaid]);

  /** Records a cash payment; resolves to an error to show, or null on success. */
  async function recordCash(id: string): Promise<string | null> {
    let result: CashResult;
    try {
      result = await recordCashPayment(id);
    } catch {
      return 'Could not reach the server.';
    }
    if (!result.ok) return result.message;

    const proofId = result.proof.id;
    setCashPaid((current) => ({ ...current, [id]: proofId }));
    router.refresh();
    return null;
  }

  // Held by id so the open modal follows the row as its IEEE result arrives.
  const selected = selectedId ? (rows.find((p) => p.id === selectedId) ?? null) : null;

  // Full records, fetched the first time each participant's details open and
  // kept for the visit. The row stays the authority for what it carries — its
  // payment, and any IEEE re-check made since — so those are laid over the top.
  const [details, setDetails] = useState<Record<string, ParticipantRow>>({});
  const [detailsError, setDetailsError] = useState<{ id: string; message: string } | null>(null);

  function openDetails(id: string) {
    setSelectedId(id);
    setDetailsError(null);
    if (details[id]) return;
    void getParticipantDetails([id]).then((result) => {
      if (result.ok && result.participants[0]) {
        setDetails((current) => ({ ...current, [id]: result.participants[0] }));
      } else {
        setDetailsError({ id, message: result.ok ? 'This participant no longer exists.' : result.message });
      }
    });
  }

  const selectedFull: ParticipantRow | null =
    selected && details[selected.id]
      ? {
          ...details[selected.id],
          participantType: selected.participantType,
          isRas: selected.isRas,
          latestProof: selected.latestProof,
          ...(selected.ieeeVerification !== undefined ? { ieeeVerification: selected.ieeeVerification } : {}),
        }
      : null;

  // Search text is rebuilt only when the list itself changes, not per keystroke.
  const haystacks = useMemo(
    () => new Map(participants.map((p) => [p.id, searchableText(p)])),
    [participants],
  );

  // A payment filter can't be applied before the proofs arrive — it would
  // show unpaid-looking rows that are really pending — so it waits for them.
  const waitingForPayments = filters.payment !== 'ALL' && !paymentsReady;

  const visible = useMemo(
    () => (waitingForPayments ? [] : rows.filter((p) => matches(p, filters, haystacks.get(p.id) ?? ''))),
    [rows, filters, haystacks, waitingForPayments],
  );

  // Only branches that actually appear. The SB enum has ~55 entries and listing
  // them all would bury the handful in play behind mostly dead options.
  const branches = useMemo(
    () => [...new Set(participants.map((p) => p.sb).filter((sb): sb is string => Boolean(sb)))].sort(),
    [participants],
  );

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  // replaceState rather than the router: the URL keeps up without a server
  // round trip or re-fetching every participant, and Next keeps
  // useSearchParams in sync with it.
  function applyFilters(next: Filters) {
    setFilters(next);
    window.history.replaceState(null, '', urlForFilters(next));
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    applyFilters({ ...filters, [key]: value });
  }

  // What the export button is doing, shown in its own label.
  const [exportLabel, setExportLabel] = useState<string | null>(null);

  async function handleExport() {
    // Exports what is on screen — filtering and then exporting is the point.
    // The table holds only lean rows, so the full records are fetched here.
    setExportLabel('Exporting…');
    const result = await getParticipantDetails(visible.map((p) => p.id));
    if (!result.ok) {
      setExportLabel('Export failed');
      setTimeout(() => setExportLabel(null), 2500);
      return;
    }
    const byId = new Map(result.participants.map((p) => [p.id, p]));
    const ordered = visible.map((p) => byId.get(p.id)).filter((p): p is ParticipantRow => Boolean(p));
    downloadXlsx(await buildParticipantsXlsx(ordered), participantsXlsxFilename());
    setExportLabel(null);
  }

  // What the copy button last did, shown in its own label for a moment.
  const [copied, setCopied] = useState<string | null>(null);

  async function handleCopyEmails() {
    // Comma-separated, ready to paste into an email's To or Bcc field.
    const emails = visible.map((p) => p.user.email).join(', ');
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(`Copied ${visible.length} email${visible.length === 1 ? '' : 's'}`);
    } catch {
      setCopied('Copy failed');
    }
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      {paymentsInfo && !paymentsInfo.ok && (
        <div className="pay-banner">
          <span aria-hidden>!</span>
          <span>
            Payment status could not be loaded ({paymentsInfo.message}) &mdash; rows below show only Paid or Not paid,
            so a pending submission will look unpaid.
          </span>
        </div>
      )}

      {paymentsInfo?.ok && paymentsInfo.truncatedAt !== null && (
        <div className="pay-banner">
          <span aria-hidden>!</span>
          <span>More than {paymentsInfo.truncatedAt} proofs exist; some rows may show as Not paid.</span>
        </div>
      )}

      <div className="admin-card part-toolbar">
        <div className="part-toolbar-top">
          <input
            type="search"
            className="admin-input part-search"
            placeholder="Search name, email, phone, IEEE ID, branch or team"
            value={filters.query}
            onChange={(e) => set('query', e.target.value)}
            aria-label="Search participants"
          />
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            onClick={handleCopyEmails}
            disabled={visible.length === 0}
            title="Copy the emails of everyone shown, comma-separated"
            aria-live="polite"
          >
            {copied ?? 'Copy emails'}
          </button>
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            onClick={handleExport}
            disabled={visible.length === 0 || exportLabel === 'Exporting…'}
            aria-live="polite"
          >
            {exportLabel ?? 'Export Excel'}
          </button>
        </div>

        <div className="part-toolbar-filters">
          <Select
            label="Payment"
            value={filters.payment}
            onChange={(v) => set('payment', v as PaymentState | 'ALL')}
            options={[
              { value: 'ALL', label: 'Any payment' },
              ...PAYMENT_STATES.map((state) => ({ value: state, label: PAYMENT_STATE_LABELS[state] })),
            ]}
          />
          <Select
            label="Membership"
            value={filters.membership}
            onChange={(v) => set('membership', v as MembershipFilter)}
            options={[
              { value: 'ALL', label: 'Any membership' },
              { value: 'NON_IEEE', label: 'Non-IEEE' },
              { value: 'IEEE', label: 'IEEE' },
              { value: 'RAS', label: 'RAS' },
            ]}
          />
          <Select
            label="Student branch"
            value={filters.sb}
            onChange={(v) => set('sb', v)}
            options={[
              { value: 'ALL', label: 'Any branch' },
              ...branches.map((sb) => ({ value: sb, label: sb })),
              { value: 'NONE', label: 'No branch' },
            ]}
          />
          <Select
            label="Activity"
            value={filters.activity}
            onChange={(v) => set('activity', v as ActivityFilter)}
            options={[
              { value: 'ALL', label: 'Any activity' },
              { value: 'COMPETITION', label: 'Competition' },
              { value: 'CHALLENGE', label: 'Challenge' },
              { value: 'FABLAB', label: 'Hackathon' },
              { value: 'NONE', label: 'No team' },
            ]}
          />
          <Select
            label="Rooming"
            value={filters.rooming}
            onChange={(v) => set('rooming', v as RoomingFilter)}
            options={[
              { value: 'ALL', label: 'Any rooming' },
              { value: 'FULL', label: 'Has a roommate' },
              { value: 'WAITING', label: 'Waiting for roommate' },
              { value: 'NONE', label: 'No room' },
            ]}
          />
        </div>

        <div className="part-toolbar-foot">
          <span>
            Showing {visible.length} of {participants.length}
          </span>
          {isFiltered && (
            <button type="button" className="pay-link" onClick={() => applyFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        {/* Fixed layout: every column gets a planned share of the width rather
            than whatever its content happens to need, so rows line up the same
            whichever participants are on screen. */}
        <table className="part-table text-sm">
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '36%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th align="center">Membership</Th>
              <Th align="center">Payment</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="viz-empty">
                  {waitingForPayments ? 'Loading payment status…' : 'No participant matches these filters.'}
                </td>
              </tr>
            )}
            {visible.map((participant) => (
              <tr
                key={participant.id}
                onClick={() => openDetails(participant.id)}
                className="admin-row"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <Td
                  className="part-cell-name truncate font-medium text-white"
                  title={`${participant.user.name} ${participant.user.lastName}`}
                >
                  {participant.user.name} {participant.user.lastName}
                </Td>
                <Td
                  className="part-cell-email truncate"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  title={participant.user.email}
                >
                  {participant.user.email}
                </Td>
                <Td className="part-cell-member text-center">
                  <MembershipBadge participant={participant} />
                </Td>
                {/* Clicking the status opens the row modal, so the link stops
                    propagation and goes straight to the proof instead. */}
                <Td className="part-cell-pay text-center" onClick={(e) => e.stopPropagation()}>
                  <PaymentStatus participant={participant} ready={paymentsReady} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalPresence>
        {selected && (
          <ParticipantDetailModal
            participant={selected}
            details={selectedFull}
            detailsError={detailsError?.id === selected.id ? detailsError.message : null}
            paymentsReady={paymentsReady}
            onRecordCash={() => recordCash(selected.id)}
            onClose={() => setSelectedId(null)}
          >
            {selectedFull && (
              <IeeeSection
                participant={selectedFull}
                activity={ieee.activity[selected.id]}
                failure={ieee.failures[selected.id]}
                busy={ieee.busy}
                onRecheck={() => ieee.recheck(selected.id)}
              />
            )}
          </ParticipantDetailModal>
        )}
      </ModalPresence>
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="admin-input part-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Four states from two sources: `paid` on the participant, plus the status of
 * their most recent proof. Tick, cross and clock are one round mark each; the
 * clock and the rejected button link through to the proof.
 */
function PaymentStatus({ participant, ready }: { participant: ParticipantListRow; ready: boolean }) {
  // Paid comes from the database and is final; anything else depends on the
  // newest proof, which is still on its way from the payments service.
  if (!ready && !participant.paid) {
    return <Skeleton className="inline-block align-middle" style={{ width: 28, height: 28, borderRadius: '50%' }} />;
  }

  const proof = participant.latestProof;
  const state = derivePaymentState(participant.paid, proof?.status ?? null);
  const style = { '--pay-mark': PAYMENT_STATE_COLORS[state] } as React.CSSProperties;
  const href = proof ? `/payments?status=${proof.status}&proof=${proof.id}` : null;

  if (href && state === 'PENDING') {
    return (
      <Link
        href={href}
        className="pay-mark pay-mark--link"
        style={style}
        title="Pending — open the proof to review it"
        aria-label="Pending: open the proof to review it"
      >
        <PaymentIcon state={state} size={16} />
      </Link>
    );
  }

  // Paid needs no link — approving is final, so there is nothing to act on.
  if (href && state === 'REJECTED') {
    return (
      <Link href={href} className="pay-action" style={style} title="Proof rejected — see the reason sent">
        <PaymentIcon state={state} size={16} />
        Rejected
      </Link>
    );
  }

  return (
    <span
      className="pay-mark"
      style={style}
      title={PAYMENT_STATE_LABELS[state]}
      role="img"
      aria-label={PAYMENT_STATE_LABELS[state]}
    >
      <PaymentIcon state={state} size={state === 'PAID' ? 16 : 14} />
    </span>
  );
}

/**
 * What the participant is priced as: Non-IEEE alone, or IEEE with a separate
 * RAS chip beside it for RAS members. The IEEE check behind it lives in the
 * participant's details.
 */
function MembershipBadge({ participant: p }: { participant: ParticipantListRow }) {
  // A re-check made this visit is current by definition; otherwise the server
  // worked out whether the stored answer still applies.
  const verified = p.ieeeVerification ? true : p.ieeeVerified;
  const source = verified ? 'confirmed by IEEE' : 'not verified with IEEE yet';

  if (!isIeee(p)) {
    return (
      <span className="part-member" title={`Non-IEEE — ${source}`}>
        <span className="admin-badge admin-badge--pink">Non-IEEE</span>
      </span>
    );
  }

  return (
    <span className="part-member" title={`${isRas(p) ? 'IEEE member in RAS' : 'IEEE member'} — ${source}`}>
      <span className="admin-badge admin-badge--green">IEEE</span>
      {isRas(p) && <span className="admin-badge admin-badge--violet">RAS</span>}
    </span>
  );
}

function ParticipantDetailModal({
  participant: p,
  details: d,
  detailsError,
  paymentsReady,
  onRecordCash,
  onClose,
  children,
}: {
  /** The table's row: enough for the header, payment and teams at once. */
  participant: ParticipantListRow;
  /** The full record, once fetched; null while it is on its way. */
  details: ParticipantRow | null;
  detailsError: string | null;
  /** False until the payments service answers; see PaymentStrip. */
  paymentsReady: boolean;
  /** Records a cash payment; resolves to an error to show, or null. */
  onRecordCash: () => Promise<string | null>;
  onClose: () => void;
  /** Extra sections rendered after the participant's own details. */
  children?: React.ReactNode;
}) {
  useEscapeKey(onClose);
  const teams = p.memberships;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal pmodal" onClick={(e) => e.stopPropagation()}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="pmodal-head">
          {/* Initials at once; their avatar once the full record lands. */}
          <ParticipantAvatar avatar={d?.user.avatar} name={p.user.name} lastName={p.user.lastName} />
          <div className="pmodal-who">
            <h3 className="admin-heading text-lg text-white">
              {p.user.name} {p.user.lastName}
            </h3>
            <p className="pmodal-email">{p.user.email}</p>
          </div>
          {/* Same chips as the table's Membership column, so the two never disagree. */}
          <MembershipBadge participant={p} />
        </header>

        {(!p.user.active || p.banned || p.isInternational) && (
          <div className="pmodal-tags">
            {!p.user.active && <span className="admin-badge admin-badge--gray">Unverified</span>}
            {p.banned && <span className="admin-badge admin-badge--pink">Banned</span>}
            {p.isInternational && <span className="admin-badge admin-badge--gray">International</span>}
          </div>
        )}

        <PaymentStrip participant={p} ready={paymentsReady} />
        {/* Not for a pending proof — that one is reviewed, not bypassed — and
            not for a banned participant, whom the backend refuses anyway. */}
        {paymentsReady && !p.paid && !p.banned && p.latestProof?.status !== 'PENDING' && (
          <CashPayment participant={p} onRecord={onRecordCash} />
        )}

        <Section title="Profile">
          {d ? (
            <DetailGrid>
              <Detail label="Phone" value={d.phone} />
              <Detail label="Gender" value={d.gender} />
              <Detail label="Country" value={d.country} />
              <Detail label="Student branch" value={d.sb ?? '—'} />
              <Detail label="IEEE ID" value={d.ieeeId?.toString() ?? '—'} />
              <Detail label="Career stage" value={CAREER_STAGE_LABELS[d.careerStage ?? ''] ?? '—'} />
              {d.room && <Detail label="Roommate" value={roommateOf(d)} />}
            </DetailGrid>
          ) : detailsError ? (
            <p className="pay-error">{detailsError}</p>
          ) : (
            <DetailsSkeleton />
          )}
        </Section>

        <Section title="Teams">
          {teams.length === 0 ? (
            <p className="pmodal-muted">Not on a team.</p>
          ) : (
            <ul className="pmodal-teams">
              {ACTIVITY_ORDER.filter((activity) => teams.some((m) => m.activity === activity)).map((activity) => {
                const team = teams.find((m) => m.activity === activity)!.team;
                return (
                  <li key={activity}>
                    <span className="pmodal-team-activity">{ACTIVITY_LABELS[activity]}</span>
                    <span className="pmodal-team-name">{team.name}</span>
                    <span className="pmodal-muted">{team.code}</span>
                    {team.leaderId === p.id && <span className="pmodal-leader">Leader</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {d?.internationalInfo && (
          <Section title="International">
            <DetailGrid>
              <Detail label="Date of birth" value={formatDate(d.internationalInfo.dateOfBirth)} />
              <Detail label="Affiliation" value={d.internationalInfo.affiliation} />
              <Detail
                label="Lives in"
                value={`${d.internationalInfo.cityOfResidence}, ${d.internationalInfo.countryOfResidence}`}
              />
              <Detail
                label="Stay"
                value={`${formatDate(d.internationalInfo.expectedArrivalDate)} – ${formatDate(d.internationalInfo.expectedDepartureDate)}`}
              />
              <Detail label="Visa letter" value={d.internationalInfo.requiresVisaLetter ? 'Needed' : 'Not needed'} />
              <Detail label="Visa status" value={d.internationalInfo.visaApplication?.status ?? '—'} />
            </DetailGrid>
          </Section>
        )}

        {d ? children : !detailsError && <Section title="IEEE membership"><DetailsSkeleton /></Section>}
      </div>
    </div>
  );
}

/** The other resident of their double, or a note that the place is still free. */
function roommateOf(d: ParticipantRow) {
  const roommate = d.room?.residents.find((r) => r.id !== d.id);
  return roommate ? `${roommate.user.name} ${roommate.user.lastName}` : 'Waiting for one';
}

/** Stands in for a details grid while the full record is on its way. */
function DetailsSkeleton() {
  return (
    <div className="pmodal-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="skeleton-text" style={{ width: '40%' }} />
          <Skeleton className="skeleton-text" style={{ width: '70%', marginTop: 6, height: 14 }} />
        </div>
      ))}
    </div>
  );
}

const ACTIVITY_ORDER: Membership['activity'][] = ['COMPETITION', 'CHALLENGE', 'FABLAB'];

const ACTIVITY_LABELS: Record<Membership['activity'], string> = {
  COMPETITION: 'Competition',
  CHALLENGE: 'Challenge',
  FABLAB: 'Hackathon',
};

/** The participant's own answer, as they chose it on registration. */
const CAREER_STAGE_LABELS: Record<string, string> = {
  Student: 'Student',
  YoungProfessional: 'Young Professional',
};

/**
 * Where their payment stands, in one line: the table's icon and state, what
 * they owe, and a link to their newest proof.
 */
function PaymentStrip({ participant: p, ready }: { participant: ParticipantListRow; ready: boolean }) {
  if (!ready && !p.paid) {
    return <Skeleton style={{ height: 50, marginTop: 20, borderRadius: 12 }} />;
  }

  const proof = p.latestProof;
  const state = derivePaymentState(p.paid, proof?.status ?? null);
  const link =
    proof && (proof.status === 'PENDING' ? 'Review proof' : proof.status === 'REJECTED' ? 'See rejection' : 'View proof');

  return (
    <div className="pmodal-pay" style={{ '--pay-mark': PAYMENT_STATE_COLORS[state] } as React.CSSProperties}>
      <span className="pay-mark" aria-hidden>
        <PaymentIcon state={state} size={16} />
      </span>
      <span className="pmodal-pay-state">{PAYMENT_STATE_LABELS[state]}</span>
      <span className="pmodal-pay-fee">{formatAmount(feeFor(p))}</span>
      {proof && link ? (
        <Link href={`/payments?status=${proof.status}&proof=${proof.id}`} className="pay-link pmodal-pay-link">
          {link} &rarr;
        </Link>
      ) : (
        <span className="pmodal-muted pmodal-pay-link">No proof sent</span>
      )}
    </div>
  );
}

/**
 * Marks someone paid who handed over cash in person, so has no receipt. The
 * backend files it as an approved CASH proof, so it still shows on the
 * Payments page. Two-step, like approving a proof: it can't be undone here.
 */
function CashPayment({
  participant: p,
  onRecord,
}: {
  participant: ParticipantListRow;
  onRecord: () => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setBusy(true);
    setError(null);
    // On success the participant turns Paid and this unmounts.
    const failure = await onRecord();
    if (failure) {
      setError(failure);
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <div className="pmodal-cash">
      {confirming ? (
        <>
          <span className="pmodal-cash-text">
            Record <strong className="text-white">{formatAmount(feeFor(p))}</strong> paid in cash by{' '}
            {p.user.name}? This can&apos;t be undone here.
          </span>
          <span className="pmodal-cash-actions">
            <button
              type="button"
              className="admin-btn-secondary px-3 py-1.5 text-xs"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pay-btn-approve"
              onClick={record}
              disabled={busy}
              autoFocus
            >
              {busy ? 'Recording…' : 'Yes, mark paid'}
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="pmodal-cash-text">Paid in person, with no receipt?</span>
          <button type="button" className="pay-btn-approve pmodal-cash-actions" onClick={() => setConfirming(true)}>
            Mark paid (cash)
          </button>
        </>
      )}
      {error && <p className="pay-error pmodal-cash-error">{error}</p>}
    </div>
  );
}

/** A titled block of the details popup. The IEEE section (ieee-verify.tsx)
 *  uses the same pmodal-section markup. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  /** Sits at the right of the title (e.g. a re-check button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="pmodal-section">
      <div className="pmodal-section-head">
        <h4>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <dl className="pmodal-grid">{children}</dl>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th
      className={`px-4 py-3 text-xs uppercase tracking-wide ${align === 'center' ? 'text-center' : 'text-left'}`}
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  style,
  title,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Full text on hover, for cells that truncate. */
  title?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style} title={title} onClick={onClick}>
      {children}
    </td>
  );
}
