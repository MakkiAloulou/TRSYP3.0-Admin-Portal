'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { buildParticipantsCsv, downloadCsv, participantsCsvFilename } from './export-csv';
import {
  PAYMENT_STATES,
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
  derivePaymentState,
  type PaymentProofStatus,
  type PaymentState,
} from '@/lib/payment';
import { deriveIeeeState, type IeeeVerification } from '@/lib/ieee-verification';
import { IeeeRunPanel, IeeeSection, IeeeStatusCell, useIeeeVerification, type RunOutcome } from './ieee-verify';

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
  sb: string | null;
  country: string;
  memberships: Membership[];
  room: { id: string; status: string } | null;
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
  };
};

type ActivityFilter = 'ALL' | 'COMPETITION' | 'CHALLENGE' | 'FABLAB' | 'NONE';

type Filters = {
  query: string;
  payment: PaymentState | 'ALL';
  type: string;
  /** A student branch code, 'ALL', or 'NONE' for participants without one. */
  sb: string;
  activity: ActivityFilter;
  ieee: IeeeFilter;
};

/** Any single row state, plus two groupings: everything that needs a human
 *  (NEEDS_ACTION), and verified rows carrying notes. FAILED is only
 *  meaningful during a session, since failures are never stored. */
type IeeeFilter = 'ALL' | 'NEEDS_ACTION' | 'NOTES' | 'FAILED' | ReturnType<typeof deriveIeeeState>;

const NO_FILTERS: Filters = {
  query: '',
  payment: 'ALL',
  type: 'ALL',
  sb: 'ALL',
  activity: 'ALL',
  ieee: 'ALL',
};

/** Everything the search box looks through, lowercased once per participant. */
function searchableText(p: ParticipantRow) {
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

function matches(p: ParticipantRow, filters: Filters, haystack: string, failures: Record<string, string>) {
  const query = filters.query.trim().toLowerCase();
  if (query && !haystack.includes(query)) return false;

  if (filters.payment !== 'ALL') {
    if (derivePaymentState(p.paid, p.latestProof?.status ?? null) !== filters.payment) return false;
  }

  if (filters.type !== 'ALL' && p.participantType !== filters.type) return false;

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

  if (filters.ieee !== 'ALL' && !matchesIeee(p, filters.ieee, failures)) return false;

  return true;
}

function matchesIeee(p: ParticipantRow, filter: IeeeFilter, failures: Record<string, string>) {
  const state = deriveIeeeState(p);
  switch (filter) {
    case 'NEEDS_ACTION':
      return (
        state === 'MISMATCH' ||
        state === 'NOT_RAS' ||
        state === 'NOT_YP' ||
        state === 'NOT_MEMBER' ||
        state === 'APPLICANT' ||
        state === 'LAPSED' ||
        state === 'NOT_FOUND'
      );
    case 'NOTES':
      return state === 'VERIFIED' && (p.ieeeVerification?.issues.length ?? 0) > 0;
    case 'FAILED':
      return state === 'UNVERIFIED' && failures[p.id] !== undefined;
    default:
      return state === filter;
  }
}

export function ParticipantsTable({ participants }: { participants: ParticipantRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const ieee = useIeeeVerification(participants);

  // Rows with this session's IEEE results merged in; everything below reads
  // these, so a row updates the moment its batch returns.
  const rows = ieee.rows;

  // Held by id so the open modal follows the row as its IEEE result arrives.
  const selected = selectedId ? (rows.find((p) => p.id === selectedId) ?? null) : null;

  // Search text is rebuilt only when the list itself changes, not per keystroke.
  const haystacks = useMemo(
    () => new Map(participants.map((p) => [p.id, searchableText(p)])),
    [participants],
  );

  const visible = useMemo(
    () => rows.filter((p) => matches(p, filters, haystacks.get(p.id) ?? '', ieee.failures)),
    [rows, filters, haystacks, ieee.failures],
  );

  // Taken from the data rather than the enum, so a new participant type appears
  // in the dropdown without a code change here.
  const types = useMemo(() => [...new Set(participants.map((p) => p.participantType))].sort(), [participants]);

  // Only branches that actually appear. The SB enum has ~55 entries and listing
  // them all would bury the handful in play behind mostly dead options.
  const branches = useMemo(
    () => [...new Set(participants.map((p) => p.sb).filter((sb): sb is string => Boolean(sb)))].sort(),
    [participants],
  );

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function showRunOutcome(outcome: RunOutcome) {
    // Only the IEEE filter changes here; clearing the rest guarantees every
    // participant the chip counted is actually on screen.
    setFilters({ ...NO_FILTERS, ieee: outcome });
  }

  function handleExport() {
    // Exports what is on screen — filtering and then exporting is the point.
    downloadCsv(buildParticipantsCsv(visible), participantsCsvFilename());
  }

  return (
    <>
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
            className="admin-btn-secondary px-4 py-2 text-sm"
            onClick={handleExport}
            disabled={visible.length === 0}
          >
            Export CSV
          </button>
          {/* Every unverified IEEE participant, regardless of the filters: the
              filters decide what is shown, not who needs checking. */}
          <button
            type="button"
            className="admin-btn-primary px-4 py-2 text-sm"
            onClick={() => ieee.verify(ieee.unverifiedIds)}
            disabled={ieee.busy || ieee.unverifiedIds.length === 0}
            title={
              ieee.unverifiedIds.length === 0
                ? 'Every IEEE participant has an up-to-date check'
                : "Check every unverified participant against IEEE's member records"
            }
          >
            {ieee.busy ? 'Verifying…' : `Verify IEEE (${ieee.unverifiedIds.length})`}
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
            label="Type"
            value={filters.type}
            onChange={(v) => set('type', v)}
            options={[{ value: 'ALL', label: 'Any type' }, ...types.map((t) => ({ value: t, label: t }))]}
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
            label="IEEE check"
            value={filters.ieee}
            onChange={(v) => set('ieee', v as IeeeFilter)}
            options={[
              { value: 'ALL', label: 'Any IEEE check' },
              { value: 'NEEDS_ACTION', label: 'Needs action' },
              { value: 'VERIFIED', label: 'Verified' },
              { value: 'NOTES', label: 'Verified with notes' },
              { value: 'MISMATCH', label: 'Mismatch' },
              { value: 'NOT_RAS', label: 'Not RAS' },
              { value: 'NOT_YP', label: 'Not YP' },
              { value: 'APPLICANT', label: 'Pending application' },
              { value: 'NOT_MEMBER', label: 'Not a member' },
              { value: 'LAPSED', label: 'Lapsed' },
              { value: 'NOT_FOUND', label: 'Not found' },
              { value: 'UNVERIFIED', label: 'Unverified' },
              { value: 'FAILED', label: 'Check failed' },
              { value: 'NOT_APPLICABLE', label: 'Not needed (non-IEEE)' },
            ]}
          />
        </div>

        <div className="part-toolbar-foot">
          <span>
            Showing {visible.length} of {participants.length}
          </span>
          {isFiltered && (
            <button type="button" className="pay-link" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {ieee.run && (
        <IeeeRunPanel
          run={ieee.run}
          failedCount={ieee.failedIds.length}
          onStop={ieee.stop}
          onRetryFailed={() => ieee.verify(ieee.failedIds)}
          onDismiss={ieee.dismiss}
          onShow={showRunOutcome}
        />
      )}

      <div className="admin-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Type</Th>
              <Th>Payment</Th>
              <Th>IEEE</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="viz-empty">
                  No participant matches these filters.
                </td>
              </tr>
            )}
            {visible.map((participant) => (
              <tr
                key={participant.id}
                onClick={() => setSelectedId(participant.id)}
                className="admin-row"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <Td className="font-medium text-white">
                  {participant.user.name} {participant.user.lastName}
                </Td>
                <Td style={{ color: 'rgba(255,255,255,0.5)' }}>{participant.user.email}</Td>
                <Td>
                  <TypeBadge participantType={participant.participantType} />
                </Td>
                {/* Clicking the status opens the row modal, so the link stops
                    propagation and goes straight to the proof instead. */}
                <Td onClick={(e) => e.stopPropagation()}>
                  <PaymentStatus participant={participant} />
                </Td>
                <Td>
                  <IeeeStatusCell
                    participant={participant}
                    activity={ieee.activity[participant.id]}
                    failure={ieee.failures[participant.id]}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ParticipantDetailModal participant={selected} onClose={() => setSelectedId(null)}>
          <IeeeSection
            participant={selected}
            activity={ieee.activity[selected.id]}
            failure={ieee.failures[selected.id]}
            busy={ieee.busy}
            onRecheck={() => ieee.recheck(selected.id)}
          />
        </ParticipantDetailModal>
      )}
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

/** Same three states in the detail modal, in the badge language used there. */
function PaymentBadge({ participant }: { participant: ParticipantRow }) {
  const state = derivePaymentState(participant.paid, participant.latestProof?.status ?? null);
  return <span className={`admin-badge ${BADGE_VARIANTS[state]}`}>{PAYMENT_STATE_LABELS[state]}</span>;
}

const BADGE_VARIANTS: Record<PaymentState, string> = {
  PAID: 'admin-badge--green',
  PENDING: 'admin-badge--amber',
  REJECTED: 'admin-badge--red',
  NOT_PAID: 'admin-badge--pink',
};

/**
 * Four states from two sources: `paid` on the participant, plus the status of
 * their most recent proof. Anything still reviewable links through to it.
 */
function PaymentStatus({ participant }: { participant: ParticipantRow }) {
  const proof = participant.latestProof;
  const state = derivePaymentState(participant.paid, proof?.status ?? null);
  const dot = <span className="pay-dot" style={{ background: PAYMENT_STATE_COLORS[state] }} />;

  // Paid needs no link — approving is final, so there is nothing to act on.
  if (proof && (state === 'PENDING' || state === 'REJECTED')) {
    return (
      <Link
        href={`/payments?status=${proof.status}&proof=${proof.id}`}
        className="pay-state hover:underline"
        style={{ color: PAYMENT_STATE_COLORS[state] }}
        title={state === 'PENDING' ? 'Review this proof' : 'See why this was rejected'}
      >
        {dot}
        {PAYMENT_STATE_LABELS[state]}
      </Link>
    );
  }

  return (
    <span className="pay-state" style={{ color: PAYMENT_STATE_COLORS[state] }}>
      {dot}
      {PAYMENT_STATE_LABELS[state]}
    </span>
  );
}

/** Short enough that every type fits the same fixed badge width. */
const TYPE_LABELS: Record<string, string> = {
  YoungProfessional: 'YP',
};

function TypeBadge({ participantType }: { participantType: string }) {
  const variant =
    participantType === 'NonIEEE'
      ? 'admin-badge--green'
      : participantType === 'Student'
        ? 'admin-badge--pink'
        : 'admin-badge--gray';

  return (
    <span className={`admin-badge part-type-badge ${variant}`} title={participantType}>
      {TYPE_LABELS[participantType] ?? participantType}
    </span>
  );
}

function ParticipantDetailModal({
  participant: p,
  onClose,
  children,
}: {
  participant: ParticipantRow;
  onClose: () => void;
  /** Extra sections rendered after the participant's own details. */
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="mb-5">
          <h3 className="admin-heading text-lg text-white">
            {p.user.name} {p.user.lastName}
          </h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {p.user.email}
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {!p.user.active && <span className="admin-badge admin-badge--gray">Unverified</span>}
          <TypeBadge participantType={p.participantType} />
          <PaymentBadge participant={p} />
          {p.banned && <span className="admin-badge admin-badge--pink">Banned</span>}
          {p.isInternational && <span className="admin-badge admin-badge--pink">International</span>}
          {p.isRas && <span className="admin-badge admin-badge--gray">RAS</span>}
        </div>

        <div className="space-y-4">
          <DetailGrid>
            <Detail label="Phone" value={p.phone} />
            <Detail label="Gender" value={p.gender} />
            <Detail label="Country" value={p.country} />
            <Detail label="Student Branch" value={p.sb ?? '—'} />
            <Detail label="IEEE ID" value={p.ieeeId?.toString() ?? '—'} />
            <Detail label="Competition Team" value={teamLabel(p, 'COMPETITION')} />
            <Detail label="Challenge Team" value={teamLabel(p, 'CHALLENGE')} />
            <Detail label="Hackathon Team" value={teamLabel(p, 'FABLAB')} />
            <Detail label="Room" value={p.room ? p.room.status : '—'} />
          </DetailGrid>

          {p.internationalInfo && (
            <div>
              <h4
                className="admin-heading mb-2 text-xs uppercase"
                style={{ color: 'var(--color-pink)', letterSpacing: '0.1em' }}
              >
                International Info
              </h4>
              <DetailGrid>
                <Detail label="Date of Birth" value={formatDate(p.internationalInfo.dateOfBirth)} />
                <Detail label="Residence" value={p.internationalInfo.cityOfResidence} />
                <Detail label="Country of Residence" value={p.internationalInfo.countryOfResidence} />
                <Detail label="Affiliation" value={p.internationalInfo.affiliation} />
                <Detail label="Arrival" value={formatDate(p.internationalInfo.expectedArrivalDate)} />
                <Detail label="Departure" value={formatDate(p.internationalInfo.expectedDepartureDate)} />
                <Detail label="Visa Letter Needed" value={p.internationalInfo.requiresVisaLetter ? 'Yes' : 'No'} />
                <Detail label="Visa Status" value={p.internationalInfo.visaApplication?.status ?? '—'} />
              </DetailGrid>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}

/** "Name (CODE) — Leader" for the participant's team in one activity, or "—". */
function teamLabel(p: ParticipantRow, activity: Membership['activity']) {
  const membership = p.memberships.find((m) => m.activity === activity);
  if (!membership) return '—';

  const isLeader = membership.team.leaderId === p.id;
  return `${membership.team.name} (${membership.team.code})${isLeader ? ' — Leader' : ''}`;
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-sm text-white">{value}</div>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style} onClick={onClick}>
      {children}
    </td>
  );
}
