import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatTile } from '../../charts';
import { getSessionDetail } from '../session-data';
import {
  attendanceRate,
  formatDay,
  formatRange,
  formatRate,
  formatTime,
  parseTab,
  type SessionDetail,
  type SessionTab,
} from '../session-types';
import { SessionBadges, audienceLabel } from '../session-ui';
import { CheckinMissing } from '../sessions-table';
import { SessionTabs } from './session-tabs';

type Params = Promise<{ id: string }>;

/** The session, or why it could not be read. */
async function loadSession(id: string) {
  try {
    return { ok: true as const, result: await getSessionDetail(id) };
  } catch (error) {
    console.error('Could not load session', id, error);
    return { ok: false as const };
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await loadSession((await params).id);
  return { title: loaded.ok && loaded.result.found ? loaded.result.session.title : 'Session' };
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const loaded = await loadSession(id);

  if (loaded.ok && !loaded.result.found && loaded.result.reason === 'not-found') notFound();

  return (
    <div className="space-y-4">
      <Link href="/sessions" className="pay-link text-sm">
        &larr; All sessions
      </Link>

      {!loaded.ok ? (
        <div className="admin-card p-6">
          <p className="pay-error">This session could not be loaded. Refresh the page to try again.</p>
        </div>
      ) : !loaded.result.found ? (
        <CheckinMissing />
      ) : (
        <SessionBody detail={loaded.result} tab={parseTab(tab)} />
      )}
    </div>
  );
}

function SessionBody({ detail, tab }: { detail: SessionDetail; tab: SessionTab }) {
  const { session, penalties } = detail;
  const points = penalties.reduce((sum, p) => sum + p.points, 0);
  const scheduled = session.status === 'Scheduled';

  return (
    <>
      <div className="space-y-2">
        <h2 className="admin-heading text-lg text-white">{session.title}</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {[
            formatDay(session.startsAt),
            formatRange(session.startsAt, session.endsAt),
            session.location,
            audienceLabel(session),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <SessionBadges session={session} />
        {(session.openedAt || session.startedAt) && (
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {session.openedAt && <>Doors opened {formatTime(session.openedAt)}</>}
            {session.openedAt && session.startedAt && ' · '}
            {session.startedAt && <>Started {formatTime(session.startedAt)}, lateness counts from here</>}
          </p>
        )}
      </div>

      <div className="viz-kpi-row viz-kpi-row--three">
        <StatTile
          label="Expected"
          value={session.hasRoster ? session.expected : '—'}
          sub={
            !session.hasRoster
              ? 'No list loaded yet'
              : session.excused > 0
                ? `${session.excused} excused by a challenge`
                : 'Nobody excused'
          }
        />
        <StatTile
          label="Checked in"
          value={session.checkedIn}
          sub={session.walkIns > 0 ? `Including ${session.walkIns} not on the list` : 'All on the list'}
        />
        <StatTile
          label="Inside now"
          value={session.status === 'Open' ? session.inside : '—'}
          sub={session.status === 'Open' ? `${session.checkedIn - session.inside} out` : `Session ${session.status.toLowerCase()}`}
        />
        <StatTile
          label="Not checked in"
          value={scheduled || !session.hasRoster ? '—' : session.notCheckedIn}
          accent={!scheduled && session.notCheckedIn > 0 ? 'var(--color-pink)' : undefined}
          sub={`Of ${session.mustAttend} who must attend`}
        />
        <StatTile
          label="Attendance"
          value={scheduled ? '—' : formatRate(attendanceRate(session))}
          sub={`${session.attended} of ${session.mustAttend} came`}
        />
        <StatTile
          label="Penalty points"
          value={points}
          sub={`${penalties.length} penalt${penalties.length === 1 ? 'y' : 'ies'} charged`}
        />
      </div>

      <SessionTabs detail={detail} initialTab={tab} />
    </>
  );
}
