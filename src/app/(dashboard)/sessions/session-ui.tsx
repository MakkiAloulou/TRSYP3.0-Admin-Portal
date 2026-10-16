import {
  STATUS_BADGE,
  TEAM_ACTIVITY_LABELS,
  attendanceRate,
  formatRate,
  type SessionCounts,
  type SessionRow,
} from './session-types';

/*
 * Pieces the sessions list and a session's page share. No hooks, so they
 * render on the server for the list and in the browser for the tabs.
 */

/** Status, then what kind of session it is, in the order they matter. */
export function SessionBadges({ session }: { session: SessionRow }) {
  return (
    <span className="sess-badges">
      <span className={`admin-badge ${STATUS_BADGE[session.status]}`}>{session.status}</span>
      {session.challenge && <span className="admin-badge admin-badge--amber">Challenge</span>}
      {!session.mandatory && <span className="admin-badge admin-badge--gray">Optional</span>}
    </span>
  );
}

/** Who the session is for, in words. */
export function audienceLabel(session: SessionRow) {
  if (session.audience === 'Everyone') return 'Everyone who paid';
  if (session.teamActivity) return TEAM_ACTIVITY_LABELS[session.teamActivity] ?? session.teamActivity;
  return session.hasRoster ? 'Assigned list' : 'Assigned, no list yet';
}

/** "12 / 20" over a bar of the same share, and the share itself. */
export function AttendanceMeter({ counts }: { counts: Pick<SessionCounts, 'attended' | 'mustAttend'> }) {
  const rate = attendanceRate(counts);
  if (rate === null) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>;

  return (
    <span className="sess-meter" title={`${counts.attended} of the ${counts.mustAttend} who had to come`}>
      <span className="sess-meter-figures">
        <span>
          {counts.attended}
          <span className="sess-meter-of"> / {counts.mustAttend}</span>
        </span>
        <span className="sess-meter-rate">{formatRate(rate)}</span>
      </span>
      <span className="sess-meter-track" aria-hidden>
        <span className="sess-meter-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
      </span>
    </span>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <th
      className={`px-4 py-3 text-xs uppercase tracking-wide text-${align}`}
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {children}
    </th>
  );
}

/** A cell that names itself on a phone, where the table's header is gone. */
export function Td({
  children,
  label,
  className = '',
  style,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style} data-label={label}>
      {children}
    </td>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'rgba(255,255,255,0.5)' }}>{children}</span>;
}

export function Dash() {
  return <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>;
}
