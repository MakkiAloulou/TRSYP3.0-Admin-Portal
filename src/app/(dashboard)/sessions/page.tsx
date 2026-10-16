import type { Metadata } from 'next';
import { StatTile } from '../charts';
import { getSessions } from './session-data';
import { attendanceRate, formatRate } from './session-types';
import { CheckinMissing, SessionsTable } from './sessions-table';

export const metadata: Metadata = { title: 'Sessions' };

/** The sessions, or why they could not be read. */
async function loadSessions() {
  try {
    return { ok: true as const, sessions: await getSessions() };
  } catch (error) {
    console.error('Could not load sessions', error);
    return { ok: false as const };
  }
}

/**
 * Every session the check-in app runs, with who it expected and who came.
 * Read-only: sessions are opened, scanned and closed in the check-in app.
 */
export default async function SessionsPage() {
  const result = await loadSessions();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Sessions</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Attendance as the check-in app recorded it. Times are Tunis time.
        </p>
      </div>

      {!result.ok ? (
        <div className="admin-card p-6">
          <p className="pay-error">Sessions could not be loaded. Refresh the page to try again.</p>
        </div>
      ) : result.sessions === null ? (
        <CheckinMissing />
      ) : (
        <>
          <SessionTiles sessions={result.sessions} />
          <SessionsTable sessions={result.sessions} />
        </>
      )}
    </div>
  );
}

function SessionTiles({ sessions }: { sessions: NonNullable<Awaited<ReturnType<typeof getSessions>>> }) {
  const open = sessions.filter((s) => s.status === 'Open');
  const closed = sessions.filter((s) => s.status === 'Closed');
  const sum = (list: typeof sessions, pick: (s: (typeof sessions)[number]) => number) =>
    list.reduce((total, s) => total + pick(s), 0);

  // Over the sessions that have finished: the record, not a count still running.
  const rate = attendanceRate({ attended: sum(closed, (s) => s.attended), mustAttend: sum(closed, (s) => s.mustAttend) });

  return (
    <div className="viz-kpi-row viz-kpi-row--three">
      <StatTile
        label="Sessions"
        value={sessions.length}
        sub={`${open.length} open · ${closed.length} closed`}
      />
      <StatTile
        label="Inside now"
        value={sum(open, (s) => s.inside)}
        sub={open.length === 0 ? 'No session is open' : `Across ${open.length} open session${open.length === 1 ? '' : 's'}`}
      />
      <StatTile
        label="Attendance"
        value={formatRate(rate)}
        sub={closed.length === 0 ? 'Once a session is closed' : `Over ${closed.length} closed session${closed.length === 1 ? '' : 's'}`}
      />
    </div>
  );
}
