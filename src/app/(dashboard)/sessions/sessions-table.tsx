import Link from 'next/link';
import { dayKey, formatDay, formatRange, type SessionRow } from './session-types';
import { AttendanceMeter, Dash, SessionBadges, Td, Th, audienceLabel } from './session-ui';

/**
 * Every session, a card per congress day in running order. A row opens the
 * session: its lists of who came and who did not, its officers and penalties.
 */
export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <div className="admin-card p-6">
        <p className="viz-empty">No sessions yet. They are created in the check-in app.</p>
      </div>
    );
  }

  const days = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const key = dayKey(session.startsAt);
    days.set(key, [...(days.get(key) ?? []), session]);
  }

  return (
    <div className="space-y-6">
      {[...days.values()].map((day) => (
        <section key={dayKey(day[0].startsAt)} className="space-y-2">
          <h3 className="team-group-title">
            {formatDay(day[0].startsAt)}
            <span className="team-group-count">{day.length}</span>
          </h3>
          <div className="admin-card overflow-x-auto">
            <table className="sess-table text-sm">
              <colgroup>
                <col style={{ width: '31%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '26%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
                  <Th>Session</Th>
                  <Th>Time</Th>
                  <Th align="center">Expected</Th>
                  <Th align="center">Inside</Th>
                  <Th align="center">Missing</Th>
                  <Th>Attendance</Th>
                </tr>
              </thead>
              <tbody>
                {day.map((session) => (
                  <SessionLine key={session.id} session={session} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function SessionLine({ session }: { session: SessionRow }) {
  return (
    <tr className="admin-row sess-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <Td className="sess-cell-title">
        {/* The link covers the row (see .sess-row-link), so any of it opens the session. */}
        <Link href={`/sessions/${session.id}`} className="sess-row-link block min-w-0 font-medium text-white">
          <span className="block truncate" title={session.title}>
            {session.title}
          </span>
        </Link>
        <span className="mt-1 block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {[session.location, audienceLabel(session)].filter(Boolean).join(' · ')}
        </span>
        {session.officers.length > 0 && (
          <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Scanned by {session.officers.join(', ')}
          </span>
        )}
        <SessionBadges session={session} />
      </Td>
      <Td label="Time" className="sess-cell-time" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatRange(session.startsAt, session.endsAt)}
      </Td>
      <Td label="Expected" className="text-center tabular-nums">
        {session.hasRoster ? session.expected : <Dash />}
      </Td>
      <Td label="Inside" className="text-center tabular-nums">
        {session.status === 'Open' ? session.inside : <Dash />}
      </Td>
      <Td label="Missing" className="text-center tabular-nums">
        {session.status === 'Scheduled' || !session.hasRoster ? (
          <Dash />
        ) : (
          <span style={{ color: session.notCheckedIn > 0 ? 'var(--color-pink)' : undefined }}>
            {session.notCheckedIn}
          </span>
        )}
      </Td>
      <Td label="Attendance" className="sess-cell-meter">
        {session.status === 'Scheduled' ? <Dash /> : <AttendanceMeter counts={session} />}
      </Td>
    </tr>
  );
}

/** For a database the check-in app was never set up against. */
export function CheckinMissing() {
  return (
    <div className="admin-card p-6">
      <p className="viz-empty">
        No check-in data in this database yet. Sessions appear here once the check-in app has created its tables.
      </p>
    </div>
  );
}
