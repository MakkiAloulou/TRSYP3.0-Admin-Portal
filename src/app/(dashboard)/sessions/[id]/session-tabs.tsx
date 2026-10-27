'use client';

import { useMemo, useState } from 'react';
import { downloadXlsx } from '@/lib/xlsx';
import { buildPenaltiesXlsx, buildSessionXlsx, sessionXlsxFilename } from '../export-session';
import {
  PENALTY_LABELS,
  SESSION_TABS,
  describePenalty,
  formatDayTime,
  formatTime,
  fullName,
  walkInReason,
  type PenaltyReason,
  type SessionDetail,
  type SessionInterval,
  type SessionOfficer,
  type SessionPenalty,
  type SessionPerson,
  type SessionRow,
  type SessionTab,
} from '../session-types';
import { Dash, Muted, Td, Th } from '../session-ui';

type PeopleTab = Exclude<SessionTab, 'officers' | 'penalties'>;

/** Which people each list holds, by the same flags the counts use. */
const PEOPLE: Record<PeopleTab, (p: SessionPerson) => boolean> = {
  'checked-in': (p) => p.checkedIn,
  missing: (p) => p.expected && !p.excused && !p.checkedIn,
  excused: (p) => p.expected && p.excused,
  'walk-ins': (p) => p.checkedIn && !p.expected,
};

function isPeopleTab(tab: SessionTab): tab is PeopleTab {
  return tab in PEOPLE;
}

type Filters = { query: string; sb: string };

/**
 * A session's lists as tabs, each searchable by name and filterable by
 * branch. Everything is already on the page — a few hundred people at most —
 * so switching and filtering happen here, with the URL kept in step so a
 * link or a refresh lands on the same view.
 */
export function SessionTabs({ detail, initialTab }: { detail: SessionDetail; initialTab: SessionTab }) {
  const { session, people, officers, penalties } = detail;
  const [tab, setTab] = useState<SessionTab>(initialTab);
  const [filters, setFilters] = useState<Filters>({ query: '', sb: 'ALL' });
  const [reason, setReason] = useState<PenaltyReason | 'ALL'>('ALL');

  const lists = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(PEOPLE) as PeopleTab[]).map((key) => {
          const list = people.filter(PEOPLE[key]);
          // Who came most recently first, as the door sees them.
          if (key === 'checked-in' || key === 'walk-ins') {
            list.sort((a, b) => (b.firstCheckIn ?? '').localeCompare(a.firstCheckIn ?? ''));
          }
          return [key, list];
        }),
      ) as Record<PeopleTab, SessionPerson[]>,
    [people],
  );

  const counts: Record<SessionTab, number> = {
    ...(Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])) as Record<PeopleTab, number>),
    officers: officers.length,
    penalties: penalties.length,
  };

  // Only branches that appear, as on the participants page. A penalty keeps
  // the branch it was charged to, so those count too.
  const branches = useMemo(
    () =>
      [...new Set([...people, ...penalties].map((p) => p.sb).filter((sb): sb is string => Boolean(sb)))].sort(),
    [people, penalties],
  );

  function open(next: SessionTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'checked-in') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    // replaceState, not the router: no server round trip to switch a list.
    window.history.replaceState(null, '', url);
  }

  const visiblePeople = isPeopleTab(tab) ? lists[tab].filter((p) => matches(p, filters)) : [];
  const visiblePenalties = penalties.filter((p) => matches(p, filters));
  const exportedPenalties = reason === 'ALL' ? visiblePenalties : visiblePenalties.filter((p) => p.reason === reason);
  const filtered = filters.query.trim() !== '' || filters.sb !== 'ALL';

  return (
    <div className="space-y-4">
      <div className="pay-toolbar">
        <nav className="pay-filters" aria-label="Session lists">
          {SESSION_TABS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="pay-filter"
              onClick={() => open(option.value)}
              data-active={option.value === tab ? '' : undefined}
              aria-pressed={option.value === tab}
            >
              {option.label}
              <span className="pay-filter-count">{counts[option.value]}</span>
            </button>
          ))}
        </nav>
      </div>

      {tab !== 'officers' && (
        <Toolbar
          filters={filters}
          setFilters={setFilters}
          branches={branches}
          shown={isPeopleTab(tab) ? visiblePeople.length : exportedPenalties.length}
          total={isPeopleTab(tab) ? lists[tab].length : penalties.length}
          filtered={filtered}
          people={isPeopleTab(tab) ? visiblePeople : null}
          onExport={
            isPeopleTab(tab)
              ? async () => downloadXlsx(await buildSessionXlsx(visiblePeople, tab, session), sessionXlsxFilename(session, tab))
              : async () =>
                  downloadXlsx(
                    await buildPenaltiesXlsx(exportedPenalties, detail.intervals),
                    sessionXlsxFilename(session, 'penalties'),
                  )
          }
        />
      )}

      {tab === 'checked-in' && <CheckedInTable people={visiblePeople} session={session} />}
      {tab === 'missing' && <MissingTable people={visiblePeople} session={session} />}
      {tab === 'excused' && <ExcusedTable people={visiblePeople} session={session} />}
      {tab === 'walk-ins' && <WalkInsTable people={visiblePeople} session={session} />}
      {tab === 'officers' && <OfficersTable officers={officers} unattributed={detail.unattributedScans} />}
      {tab === 'penalties' && (
        <PenaltyLog
          session={session}
          penalties={visiblePenalties}
          intervals={detail.intervals}
          reason={reason}
          setReason={setReason}
          total={penalties}
        />
      )}
    </div>
  );
}

function matches(p: { name: string | null; lastName: string | null; email?: string | null; sb: string | null; team?: string | null }, { query, sb }: Filters) {
  if (sb === 'NONE' ? p.sb !== null : sb !== 'ALL' && p.sb !== sb) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [p.name, p.lastName, `${p.name ?? ''} ${p.lastName ?? ''}`, p.email, p.sb, p.team]
    .some((field) => field?.toLowerCase().includes(needle));
}

function Toolbar({
  filters,
  setFilters,
  branches,
  shown,
  total,
  filtered,
  people,
  onExport,
}: {
  filters: Filters;
  setFilters: (next: Filters) => void;
  branches: string[];
  shown: number;
  total: number;
  filtered: boolean;
  /** The people on screen, for copying their emails; null on a list of penalties. */
  people: SessionPerson[] | null;
  onExport: (() => Promise<void>) | null;
}) {
  // What the copy button last did, shown in its own label for a moment.
  const [copied, setCopied] = useState<string | null>(null);

  async function copyEmails() {
    if (!people) return;
    // Comma-separated, ready to paste into an email's To or Bcc field.
    const emails = people.map((p) => p.email).filter(Boolean);
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      setCopied(`Copied ${emails.length} email${emails.length === 1 ? '' : 's'}`);
    } catch {
      setCopied('Copy failed');
    }
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="admin-card part-toolbar">
      <div className="part-toolbar-top">
        <input
          type="search"
          className="admin-input part-search"
          placeholder="Search name, email, branch or team"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          aria-label="Search this list"
        />
        <select
          className="admin-input part-select part-toolbar-btn"
          value={filters.sb}
          onChange={(e) => setFilters({ ...filters, sb: e.target.value })}
          aria-label="Student branch"
        >
          <option value="ALL">Any branch</option>
          {branches.map((sb) => (
            <option key={sb} value={sb}>
              {sb}
            </option>
          ))}
          <option value="NONE">No branch</option>
        </select>
        {people && (
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            onClick={copyEmails}
            disabled={shown === 0}
            title="Copy the emails of everyone shown, comma-separated"
            aria-live="polite"
          >
            {copied ?? 'Copy emails'}
          </button>
        )}
        {onExport && (
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            onClick={onExport}
            disabled={shown === 0}
            title="Download this list, as filtered, as an Excel sheet"
          >
            Export Excel
          </button>
        )}
      </div>

      {filtered && (
        <div className="part-toolbar-foot" aria-live="polite">
          <span>
            {shown} of {total} shown
          </span>
          <button type="button" className="pay-link" onClick={() => setFilters({ query: '', sb: 'ALL' })}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

/* ── the lists ────────────────────────────────────────── */

function Person({ person }: { person: SessionPerson }) {
  const name = fullName(person);
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-white" title={name}>
        {name}
      </span>
      <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }} title={person.email ?? ''}>
        {person.email ?? person.participantId}
      </span>
    </span>
  );
}

function Empty({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="viz-empty">
        {children}
      </td>
    </tr>
  );
}

function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-card overflow-x-auto">
      <table className="sess-table sess-table--auto text-sm">{children}</table>
    </div>
  );
}

function Head({ columns }: { columns: { label: string; align?: 'left' | 'center' | 'right' }[] }) {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
        {columns.map((c) => (
          <Th key={c.label} align={c.align}>
            {c.label}
          </Th>
        ))}
      </tr>
    </thead>
  );
}

const ROW_STYLE = { borderBottom: '1px solid rgba(255,255,255,0.05)' };

function TeamCell({ person, session }: { person: SessionPerson; session: SessionRow }) {
  if (!session.teamActivity) return null;
  return <Td label="Team">{person.team ?? <Dash />}</Td>;
}

function teamColumn(session: SessionRow) {
  return session.teamActivity ? [{ label: 'Team' }] : [];
}

function StateBadge({ person }: { person: SessionPerson }) {
  return person.inside ? (
    <span className="admin-badge admin-badge--green">Inside</span>
  ) : (
    <span className="admin-badge admin-badge--gray">Out</span>
  );
}

function CheckedInTable({ people, session }: { people: SessionPerson[]; session: SessionRow }) {
  const columns = [
    { label: 'Participant' },
    { label: 'Branch' },
    ...teamColumn(session),
    { label: 'First in' },
    { label: 'Last out' },
    { label: 'State', align: 'center' as const },
    { label: 'Exits', align: 'center' as const },
    { label: 'Checked in by' },
  ];
  return (
    <TableCard>
      <Head columns={columns} />
      <tbody>
        {people.length === 0 && <Empty columns={columns.length}>Nobody here yet.</Empty>}
        {people.map((p) => (
          <tr key={p.participantId} style={ROW_STYLE}>
            <Td className="sess-cell-wide">
              <Person person={p} />
              <span className="sess-badges">
                {!p.expected && <span className="admin-badge admin-badge--amber">Not on the list</span>}
                {p.excused && <span className="admin-badge admin-badge--violet">Excused</span>}
              </span>
            </Td>
            <Td label="Branch">{p.sb ?? <Dash />}</Td>
            <TeamCell person={p} session={session} />
            <Td label="First in" className="tabular-nums">
              {formatTime(p.firstCheckIn)}
            </Td>
            <Td label="Last out" className="tabular-nums">
              {p.lastCheckOut ? formatTime(p.lastCheckOut) : <Dash />}
            </Td>
            <Td label="State" className="text-center">
              <StateBadge person={p} />
            </Td>
            <Td label="Exits" className="text-center tabular-nums">
              {p.exits}
            </Td>
            <Td label="Checked in by">{p.checkedInBy ?? <Muted>Unknown</Muted>}</Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function MissingTable({ people, session }: { people: SessionPerson[]; session: SessionRow }) {
  const columns = [{ label: 'Participant' }, { label: 'Branch' }, ...teamColumn(session)];
  const empty =
    session.audience === 'Assigned' && !session.hasRoster
      ? 'This session has no list yet, so nobody can be missing from it.'
      : 'Everyone who had to come checked in.';
  return (
    <TableCard>
      <Head columns={columns} />
      <tbody>
        {people.length === 0 && <Empty columns={columns.length}>{empty}</Empty>}
        {people.map((p) => (
          <tr key={p.participantId} style={ROW_STYLE}>
            <Td className="sess-cell-wide">
              <Person person={p} />
            </Td>
            <Td label="Branch">{p.sb ?? <Dash />}</Td>
            <TeamCell person={p} session={session} />
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function ExcusedTable({ people, session }: { people: SessionPerson[]; session: SessionRow }) {
  const columns = [{ label: 'Participant' }, { label: 'Branch' }, ...teamColumn(session), { label: 'Came anyway', align: 'center' as const }];
  return (
    <TableCard>
      <Head columns={columns} />
      <tbody>
        {people.length === 0 && (
          <Empty columns={columns.length}>
            {session.challenge
              ? 'A technical challenge never excuses anyone from itself.'
              : 'Nobody here has a technical challenge at the same time.'}
          </Empty>
        )}
        {people.map((p) => (
          <tr key={p.participantId} style={ROW_STYLE}>
            <Td className="sess-cell-wide">
              <Person person={p} />
            </Td>
            <Td label="Branch">{p.sb ?? <Dash />}</Td>
            <TeamCell person={p} session={session} />
            <Td label="Came anyway" className="text-center">
              {p.checkedIn ? <StateBadge person={p} /> : <Muted>No</Muted>}
            </Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function WalkInsTable({ people, session }: { people: SessionPerson[]; session: SessionRow }) {
  const columns = [
    { label: 'Participant' },
    { label: 'Branch' },
    ...teamColumn(session),
    { label: 'Why not on the list' },
    { label: 'First in' },
    { label: 'Checked in by' },
  ];
  return (
    <TableCard>
      <Head columns={columns} />
      <tbody>
        {people.length === 0 && <Empty columns={columns.length}>Everyone scanned here was on the list.</Empty>}
        {people.map((p) => (
          <tr key={p.participantId} style={ROW_STYLE}>
            <Td className="sess-cell-wide">
              <Person person={p} />
            </Td>
            <Td label="Branch">{p.sb ?? <Dash />}</Td>
            <TeamCell person={p} session={session} />
            <Td label="Why not on the list">{walkInReason(p, session)}</Td>
            <Td label="First in" className="tabular-nums">
              {formatTime(p.firstCheckIn)}
            </Td>
            <Td label="Checked in by">{p.checkedInBy ?? <Muted>Unknown</Muted>}</Td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

function OfficersTable({ officers, unattributed }: { officers: SessionOfficer[]; unattributed: number }) {
  const columns = [
    { label: 'Officer' },
    { label: 'Role' },
    { label: 'Check-ins', align: 'center' as const },
    { label: 'Check-outs', align: 'center' as const },
    { label: 'First scan' },
    { label: 'Last scan' },
  ];
  return (
    <div className="space-y-2">
      <TableCard>
        <Head columns={columns} />
        <tbody>
          {officers.length === 0 && (
            <Empty columns={columns.length}>No officer is assigned here and nobody has scanned yet.</Empty>
          )}
          {officers.map((o) => (
            <tr key={o.id} style={ROW_STYLE}>
              <Td className="sess-cell-wide">
                <span className="block truncate font-medium text-white">{o.displayName ?? 'Deleted account'}</span>
                <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {o.username ? `@${o.username}` : o.id}
                </span>
                <span className="sess-badges">
                  {o.assigned ? (
                    <span className="admin-badge admin-badge--green">Assigned</span>
                  ) : (
                    <span className="admin-badge admin-badge--gray">Not assigned</span>
                  )}
                  {o.displayName && !o.active && <span className="admin-badge admin-badge--red">Disabled</span>}
                </span>
              </Td>
              <Td label="Role">{o.role ?? <Dash />}</Td>
              <Td label="Check-ins" className="text-center tabular-nums">
                {o.checkIns}
              </Td>
              <Td label="Check-outs" className="text-center tabular-nums">
                {o.checkOuts}
              </Td>
              <Td label="First scan" className="tabular-nums">
                {o.firstScan ? formatDayTime(o.firstScan) : <Dash />}
              </Td>
              <Td label="Last scan" className="tabular-nums">
                {o.lastScan ? formatDayTime(o.lastScan) : <Dash />}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {unattributed > 0 && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {unattributed} scan{unattributed === 1 ? ' was' : 's were'} recorded before officers had accounts, so no
          officer is named for {unattributed === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}

const REASON_ORDER: PenaltyReason[] = ['Absent', 'Late', 'OverBreak', 'LeftEarly'];

const REASON_WORDS: Record<PenaltyReason, [string, string]> = {
  OverBreak: ['over the break allowance', 'over the break allowance'],
  LeftEarly: ['left early', 'left early'],
  Absent: ['absence', 'absences'],
  Late: ['late arrival', 'late arrivals'],
};

/** "32 over the break allowance, 17 left early, 27 absences", as the check-in app says it. */
function penaltySummary(penalties: SessionPenalty[]) {
  return REASON_ORDER.map((reason) => [reason, penalties.filter((p) => p.reason === reason).length] as const)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${n} ${REASON_WORDS[reason][n === 1 ? 0 : 1]}`)
    .join(', ');
}

function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

/** One person's deductions here, with the scans behind them. */
type PenaltyEntry = {
  participantId: string;
  penalties: SessionPenalty[];
  points: number;
  intervals: SessionInterval[];
};

/**
 * The session's penalty log, as the check-in app's standings show it: what
 * it cost each branch, then every penalised participant with what they did —
 * and, here, the in-and-out scans that led to it.
 */
function PenaltyLog({
  session,
  penalties,
  intervals,
  reason,
  setReason,
  total,
}: {
  session: SessionRow;
  /** Already narrowed by the toolbar's search and branch. */
  penalties: SessionPenalty[];
  intervals: SessionInterval[];
  reason: PenaltyReason | 'ALL';
  setReason: (reason: PenaltyReason | 'ALL') => void;
  /** Every penalty in the session, before any filter. */
  total: SessionPenalty[];
}) {
  const shown = reason === 'ALL' ? penalties : penalties.filter((p) => p.reason === reason);
  const points = shown.reduce((sum, p) => sum + p.points, 0);

  const entries = useMemo(() => {
    const byPerson = new Map<string, PenaltyEntry>();
    for (const p of shown) {
      const entry = byPerson.get(p.participantId) ?? {
        participantId: p.participantId,
        penalties: [],
        points: 0,
        intervals: intervals.filter((i) => i.participantId === p.participantId),
      };
      entry.penalties.push(p);
      entry.points += p.points;
      byPerson.set(p.participantId, entry);
    }
    // Most points first; the same, by name.
    return [...byPerson.values()].sort(
      (a, b) => b.points - a.points || fullName(a.penalties[0]).localeCompare(fullName(b.penalties[0])),
    );
  }, [shown, intervals]);

  const branches = useMemo(() => {
    const bySb = new Map<string, number>();
    for (const p of shown) bySb.set(p.sb ?? 'No student branch', (bySb.get(p.sb ?? 'No student branch') ?? 0) + p.points);
    return [...bySb.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [shown]);
  const most = Math.max(1, ...branches.map(([, n]) => n));

  if (total.length === 0) {
    return (
      <div className="admin-card p-6">
        <p className="viz-empty">
          {session.mandatory ? 'No penalties charged here.' : 'This session counts attendance only: it never charges penalties.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="pay-filters" aria-label="Kind of penalty">
        {(['ALL', ...REASON_ORDER] as const).map((r) => {
          const n = r === 'ALL' ? penalties.length : penalties.filter((p) => p.reason === r).length;
          if (r !== 'ALL' && n === 0) return null;
          return (
            <button
              key={r}
              type="button"
              className="pay-filter"
              onClick={() => setReason(r)}
              data-active={reason === r ? '' : undefined}
              aria-pressed={reason === r}
            >
              {r === 'ALL' ? 'All' : PENALTY_LABELS[r]}
              <span className="pay-filter-count">{n}</span>
            </button>
          );
        })}
      </nav>

      <section className="admin-card ws-card">
        <div className="font-medium text-white">
          {points} point{points === 1 ? '' : 's'} lost across {branches.length} branch{branches.length === 1 ? '' : 'es'}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {penaltySummary(shown) || 'Nothing matches.'} · {session.penaltyPoints} points each · breaks may total{' '}
          {session.breakAllowanceMinutes} min
        </div>
        {branches.length > 0 && (
          <ol className="pen-ranks">
            {branches.map(([sb, n], i) => (
              <li key={sb} className="pen-rank">
                <span className="pen-rank-pos">{i + 1}</span>
                <span className="pen-rank-sb">{sb}</span>
                <span className="sess-meter-track pen-rank-track" aria-hidden>
                  <span className="sess-meter-fill" style={{ width: `${(n / most) * 100}%`, background: 'var(--color-pink)' }} />
                </span>
                <span className="pen-rank-points">−{n}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="admin-card ws-card">
        <div className="font-medium text-white">
          Every deduction, by participant ({entries.length})
        </div>
        <ul className="pen-log">
          {entries.length === 0 && <li className="viz-empty">Nobody matches.</li>}
          {entries.map((entry) => (
            <PenaltyLogEntry key={entry.participantId} entry={entry} session={session} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PenaltyLogEntry({ entry, session }: { entry: PenaltyEntry; session: SessionRow }) {
  const [open, setOpen] = useState(false);
  const first = entry.penalties[0];
  const outMinutes = entry.intervals.reduce(
    (sum, interval, i) => {
      // Time out is from each exit to the next entry; an exit with no return
      // counts up to the end of the session.
      if (!interval.checkOut) return sum;
      const next = entry.intervals[i + 1];
      return sum + minutesBetween(interval.checkOut, next ? next.checkIn : session.endsAt);
    },
    0,
  );

  return (
    <li className="pen-entry">
      <div className="pen-entry-head">
        <span className="block min-w-0">
          <span className="block truncate font-medium text-white">{fullName(first)}</span>
          <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {[first.email, first.sb ?? 'No student branch'].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="pen-entry-points">−{entry.points}</span>
      </div>

      <ul className="pen-entry-reasons">
        {entry.penalties.map((p) => (
          <li key={p.id}>
            <span className={`admin-badge ${p.reason === 'Absent' ? 'admin-badge--red' : 'admin-badge--amber'}`}>
              {PENALTY_LABELS[p.reason]}
            </span>
            <span>{describePenalty(p.reason, p.minutes)}</span>
            <Muted>charged {formatDayTime(p.createdAt)}</Muted>
          </li>
        ))}
      </ul>

      {entry.intervals.length === 0 ? (
        <p className="pen-entry-note">Never scanned in.</p>
      ) : (
        <>
          <button type="button" className="pay-link text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open
              ? 'Hide scans'
              : `Show scans (${entry.intervals.length} in · ${entry.intervals.filter((i) => i.checkOut).length} out${
                  outMinutes > 0 ? ` · ${outMinutes} min out` : ''
                })`}
          </button>
          {open && (
            <ol className="pen-scans">
              {entry.intervals.map((interval, i) => {
                const next = entry.intervals[i + 1];
                return (
                  <li key={interval.checkIn}>
                    <span className="tabular-nums">
                      In <strong>{formatTime(interval.checkIn)}</strong>
                      {interval.checkedInBy && <Muted> by {interval.checkedInBy}</Muted>}
                    </span>
                    {interval.checkOut && !interval.checkedOutBy && interval.checkOut === session.endsAt ? (
                      // Closing a session checks out whoever is still in, at its end time.
                      <Muted>still inside when the session closed</Muted>
                    ) : interval.checkOut ? (
                      <span className="tabular-nums">
                        Out <strong>{formatTime(interval.checkOut)}</strong>
                        {interval.checkedOutBy && <Muted> by {interval.checkedOutBy}</Muted>}
                        <Muted>
                          {' '}
                          · {next ? `back after ${minutesBetween(interval.checkOut, next.checkIn)} min` : 'did not come back'}
                        </Muted>
                      </span>
                    ) : (
                      <Muted>still inside</Muted>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </li>
  );
}
