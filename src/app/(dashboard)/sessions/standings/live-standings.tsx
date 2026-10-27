'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildXlsx, downloadXlsx } from '@/lib/xlsx';
import { PENALTY_LABELS, formatDayTime, formatTime, type PenaltyReason } from '../session-types';
import {
  STANDINGS_ORDERS,
  perAttendee,
  rank,
  type BranchStanding,
  type Standings,
  type StandingsOrder,
} from '../standings-types';

/** How often the standings are read again while the page is open and visible. */
const REFRESH_MS = 30_000;

const REASONS: PenaltyReason[] = ['Absent', 'Late', 'OverBreak', 'LeftEarly'];

type Ranked = ReturnType<typeof rank>[number];

/** What changed since the standings were last read, for the arrows and highlights. */
type Snapshot = {
  standings: Standings;
  /** The view the snapshot was taken in: arrows compare like with like. */
  view: string;
  places: Map<string, number>;
  points: Map<string, number>;
  /** Places moved up (positive) or down (negative) at the last refresh. */
  moves: Map<string, number>;
  /** Branches whose points changed at the last refresh. */
  changed: Set<string>;
};

function snapshotOf(standings: Standings, view: string, ranked: Ranked[], previous: Snapshot | null): Snapshot {
  const places = new Map(ranked.map((b) => [b.sb, b.place]));
  const points = new Map(ranked.map((b) => [b.sb, b.points]));
  const moves = new Map<string, number>();
  const changed = new Set<string>();

  // Only a refresh of the same view moves anything; a new session or order
  // is a different table, not a change in this one.
  if (previous && previous.view === view) {
    for (const b of ranked) {
      const before = previous.places.get(b.sb);
      if (before !== undefined && before !== b.place) moves.set(b.sb, before - b.place);
      if ((previous.points.get(b.sb) ?? 0) !== b.points) changed.add(b.sb);
    }
  }
  return { standings, view, places, points, moves, changed };
}

/**
 * The branch standings, kept current: the server is asked again every 30
 * seconds while the tab is visible, and the table marks who moved and whose
 * points changed since the last read.
 */
export function LiveStandings({
  standings,
  sessionId,
  initialOrder,
  loadedAt,
}: {
  standings: Standings;
  sessionId: string | null;
  initialOrder: StandingsOrder;
  loadedAt: string;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<StandingsOrder>(initialOrder);
  const [live, setLive] = useState(true);
  const [refreshing, startRefresh] = useTransition();
  const [switching, startSwitch] = useTransition();

  const ranked = rank(standings.branches, order);
  const view = `${sessionId ?? 'all'}:${order}`;

  // Adjusted while rendering, not in an effect: the arrows belong to the same
  // render as the numbers they explain.
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotOf(standings, view, ranked, null));
  if (snapshot.standings !== standings || snapshot.view !== view) {
    setSnapshot(snapshotOf(standings, view, ranked, snapshot));
  }

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // A hidden tab has nobody watching; it catches up when shown again.
      if (document.visibilityState === 'visible') startRefresh(() => router.refresh());
    }, REFRESH_MS);
    const onShow = () => {
      if (document.visibilityState === 'visible') startRefresh(() => router.refresh());
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [live, router]);

  function url(next: { session?: string | null; order?: StandingsOrder }) {
    const params = new URLSearchParams();
    const session = next.session === undefined ? sessionId : next.session;
    const sort = next.order ?? order;
    if (session) params.set('session', session);
    if (sort !== 'most') params.set('order', sort);
    const query = params.toString();
    return query ? `/sessions/standings?${query}` : '/sessions/standings';
  }

  function chooseSession(next: string) {
    // Another session is another query: the server reads it.
    startSwitch(() => router.replace(url({ session: next || null }), { scroll: false }));
  }

  function chooseOrder(next: StandingsOrder) {
    setOrder(next);
    // Ordering is done here; the URL keeps it for a refresh or a shared link.
    window.history.replaceState(null, '', url({ order: next }));
  }

  const perHead = order === 'most-per' || order === 'fewest-per';
  const metric = (b: BranchStanding) => (perHead ? perAttendee(b) : b.points);
  const most = Math.max(1e-9, ...ranked.map(metric));
  const total = standings.branches.reduce((sum, b) => sum + b.points, 0) + standings.unbranched.points;
  const chosen = standings.sessions.find((s) => s.id === sessionId);

  async function exportXlsx() {
    const header = ['Place', 'Student branch', 'Points lost', 'Per attendee', 'Attendees', 'Penalties', ...REASONS.map((r) => PENALTY_LABELS[r])];
    const rows = ranked.map((b) => [
      b.place,
      b.sb,
      b.points,
      Math.round(perAttendee(b) * 100) / 100,
      b.attendees,
      b.penalties,
      ...REASONS.map((r) => b.byReason[r]),
    ]);
    const name = chosen ? chosen.title.replace(/[^\w]+/g, '-').toLowerCase() : 'all-sessions';
    downloadXlsx(await buildXlsx(rows, { sheet: 'Standings', header }), `trsyp-standings-${name}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <div className="admin-card part-toolbar">
        <div className="part-toolbar-top">
          <select
            className="admin-input part-select part-search"
            value={sessionId ?? ''}
            onChange={(e) => chooseSession(e.target.value)}
            aria-label="Session"
            disabled={switching}
          >
            <option value="">All sessions</option>
            {standings.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDayTime(s.startsAt)} — {s.title}
                {s.status === 'Open' ? ' (live)' : s.status === 'Closed' ? ' (closed)' : ''}
              </option>
            ))}
          </select>
          <select
            className="admin-input part-select part-toolbar-btn"
            value={order}
            onChange={(e) => chooseOrder(e.target.value as StandingsOrder)}
            aria-label="Order"
          >
            {STANDINGS_ORDERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            onClick={exportXlsx}
            disabled={ranked.length === 0}
          >
            Export Excel
          </button>
        </div>

        <div className="part-toolbar-foot" aria-live="polite">
          <button
            type="button"
            className={`std-live ${live ? 'std-live--on' : ''}`}
            onClick={() => setLive(!live)}
            aria-pressed={live}
            title={live ? 'Pause the automatic refresh' : 'Refresh every 30 seconds'}
          >
            <span className="std-live-dot" aria-hidden />
            {live ? 'Live' : 'Paused'}
          </button>
          <span>
            {refreshing || switching ? 'Updating…' : `Updated ${formatTime(loadedAt)}`}
          </span>
          <button
            type="button"
            className="pay-link"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
          >
            Refresh now
          </button>
        </div>
      </div>

      <div className="admin-card ws-card">
        <div className="font-medium text-white">
          {total} point{total === 1 ? '' : 's'} lost {chosen ? `in ${chosen.title}` : 'across all sessions'}
        </div>
        <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {perHead
            ? 'Ranked by points lost per paid attendee, so a big branch and a small one compare fairly.'
            : 'Ranked by total points lost.'}{' '}
          Equal scores share a place.
          {standings.unbranched.points > 0 &&
            ` ${standings.unbranched.points} more points (${standings.unbranched.penalties} penalties) belong to participants with no branch and count for none.`}
        </div>

        <ol className="std-list">
          {ranked.length === 0 && <li className="viz-empty">No branch has attendees or penalties yet.</li>}
          {ranked.map((b) => (
            <StandingRow
              key={b.sb}
              branch={b}
              share={metric(b) / most}
              perHead={perHead}
              move={snapshot.view === view ? snapshot.moves.get(b.sb) : undefined}
              changed={snapshot.view === view && snapshot.changed.has(b.sb)}
              showSessions={!sessionId}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function StandingRow({
  branch,
  share,
  perHead,
  move,
  changed,
  showSessions,
}: {
  branch: Ranked;
  share: number;
  perHead: boolean;
  move: number | undefined;
  changed: boolean;
  showSessions: boolean;
}) {
  const [open, setOpen] = useState(false);
  const per = perAttendee(branch);

  return (
    // Keyed by its points, so a change replays the highlight.
    <li className="std-row" data-changed={changed ? '' : undefined} key={`${branch.sb}:${branch.points}`}>
      <div className="std-row-main">
        <span className="std-place">
          {branch.place}
          {move ? (
            <span className={`std-move ${move > 0 ? 'std-move--up' : 'std-move--down'}`} title={`${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'} ${move > 0 ? 'up' : 'down'} since the last update`}>
              {move > 0 ? '▲' : '▼'}
              {Math.abs(move)}
            </span>
          ) : null}
        </span>

        <span className="std-branch">
          <span className="block truncate font-medium text-white">{branch.sb}</span>
          <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {branch.attendees} attendee{branch.attendees === 1 ? '' : 's'}
            {branch.penalties > 0 &&
              ` · ${branch.penalties} penalt${branch.penalties === 1 ? 'y' : 'ies'} on ${branch.people} ${branch.people === 1 ? 'person' : 'people'}`}
          </span>
        </span>

        <span className="sess-meter-track std-track" aria-hidden>
          <span className="sess-meter-fill" style={{ width: `${Math.round(share * 100)}%`, background: 'var(--color-pink)' }} />
        </span>

        <span className="std-score">
          <span className="std-points">{branch.points > 0 ? `−${branch.points}` : '0'}</span>
          <span className="std-per" style={perHead ? { color: '#fff' } : undefined}>
            {per > 0 ? `−${per.toFixed(1)}` : '0'} / attendee
          </span>
        </span>
      </div>

      {branch.penalties > 0 && (
        <div className="std-row-foot">
          {REASONS.filter((r) => branch.byReason[r] > 0).map((r) => (
            <span key={r} className="std-chip">
              {branch.byReason[r]} {PENALTY_LABELS[r].toLowerCase()}
            </span>
          ))}
          {showSessions && branch.bySession.length > 0 && (
            <button type="button" className="pay-link text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Hide sessions' : 'By session'}
            </button>
          )}
        </div>
      )}

      {open && (
        <ul className="std-sessions">
          {branch.bySession.map((s) => (
            <li key={s.sessionId}>
              <Link href={`/sessions/${s.sessionId}?tab=penalties`} className="truncate">
                {s.title}
              </Link>
              <span className="std-points">−{s.points}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
