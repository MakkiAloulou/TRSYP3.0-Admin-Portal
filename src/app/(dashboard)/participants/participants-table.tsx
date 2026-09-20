'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { buildParticipantsCsv, downloadCsv, participantsCsvFilename } from './export-csv';
import {
  PAYMENT_STATES,
  PAYMENT_STATE_COLORS,
  PAYMENT_STATE_LABELS,
  derivePaymentState,
  type PaymentState,
} from '@/lib/payment';

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
  activity: 'COMPETITION' | 'CHALLENGE';
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
  sb: string | null;
  country: string;
  memberships: Membership[];
  room: { id: string; status: string } | null;
  internationalInfo: InternationalInfo | null;
  /** Id of this participant's PENDING proof, if one is waiting. The participant
   *  record only carries `paid`, so this is what separates "awaiting review"
   *  from "nothing submitted". Joined in by the page, not a Participant field. */
  pendingProofId: string | null;
  user: {
    name: string;
    lastName: string;
    email: string;
    active: boolean;
    createdAt: string;
  };
};

type ActivityFilter = 'ALL' | 'COMPETITION' | 'CHALLENGE' | 'NONE';

type Filters = {
  query: string;
  payment: PaymentState | 'ALL';
  type: string;
  /** A student branch code, 'ALL', or 'NONE' for participants without one. */
  sb: string;
  activity: ActivityFilter;
};

const NO_FILTERS: Filters = {
  query: '',
  payment: 'ALL',
  type: 'ALL',
  sb: 'ALL',
  activity: 'ALL',
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

function matches(p: ParticipantRow, filters: Filters, haystack: string) {
  const query = filters.query.trim().toLowerCase();
  if (query && !haystack.includes(query)) return false;

  if (filters.payment !== 'ALL') {
    if (derivePaymentState(p.paid, p.pendingProofId !== null) !== filters.payment) return false;
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

  return true;
}

export function ParticipantsTable({ participants }: { participants: ParticipantRow[] }) {
  const [selected, setSelected] = useState<ParticipantRow | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  // Search text is rebuilt only when the list itself changes, not per keystroke.
  const haystacks = useMemo(
    () => new Map(participants.map((p) => [p.id, searchableText(p)])),
    [participants],
  );

  const visible = useMemo(
    () => participants.filter((p) => matches(p, filters, haystacks.get(p.id) ?? '')),
    [participants, filters, haystacks],
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
              { value: 'NONE', label: 'No team' },
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

      <div className="admin-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Type</Th>
              <Th>Payment</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="viz-empty">
                  No participant matches these filters.
                </td>
              </tr>
            )}
            {visible.map((participant) => (
              <tr
                key={participant.id}
                onClick={() => setSelected(participant)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <ParticipantDetailModal participant={selected} onClose={() => setSelected(null)} />}
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
  const state = derivePaymentState(participant.paid, participant.pendingProofId !== null);
  const variant =
    state === 'PAID' ? 'admin-badge--green' : state === 'PENDING' ? 'admin-badge--amber' : 'admin-badge--pink';
  return <span className={`admin-badge ${variant}`}>{PAYMENT_STATE_LABELS[state]}</span>;
}

/**
 * Three states from two sources: `paid` on the participant, plus whether a
 * PENDING proof exists. A pending one links through to it in the review queue.
 */
function PaymentStatus({ participant }: { participant: ParticipantRow }) {
  const state = derivePaymentState(participant.paid, participant.pendingProofId !== null);
  const dot = <span className="pay-dot" style={{ background: PAYMENT_STATE_COLORS[state] }} />;

  if (state === 'PENDING' && participant.pendingProofId) {
    return (
      <Link
        href={`/payments?status=PENDING&proof=${participant.pendingProofId}`}
        className="pay-state hover:underline"
        style={{ color: PAYMENT_STATE_COLORS.PENDING }}
        title="Review this proof"
      >
        {dot}
        {PAYMENT_STATE_LABELS.PENDING}
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

function TypeBadge({ participantType }: { participantType: string }) {
  if (participantType === 'NonIEEE') {
    return <span className="admin-badge admin-badge--green">{participantType}</span>;
  }
  if (participantType === 'Student') {
    return <span className="admin-badge admin-badge--pink">{participantType}</span>;
  }
  return <span className="admin-badge admin-badge--gray">{participantType}</span>;
}

function ParticipantDetailModal({ participant: p, onClose }: { participant: ParticipantRow; onClose: () => void }) {
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
