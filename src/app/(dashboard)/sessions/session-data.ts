import 'server-only';
import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  PenaltyReason,
  SessionAudience,
  SessionCounts,
  SessionDetail,
  SessionOfficer,
  SessionPenalty,
  SessionPerson,
  SessionRow,
  SessionStatus,
} from './session-types';

/*
 * Attendance, read straight from the check-in app's tables in the `checkin`
 * schema. Raw SQL on purpose: that app owns those tables (it creates them with
 * its own SQL files), so they stay out of this app's Prisma schema, where a
 * `db push` could try to change them. Everything here is a SELECT.
 *
 * Who a session expects is the check-in app's rule, copied from its
 * lib/attendance/expected.ts so the two apps can never disagree on a count:
 *
 *  - Everyone session: every participant who has paid and is not banned.
 *  - Assigned session: whoever is listed in session_participants, plus every
 *    member of the website's selected teams for its team_activity — of them,
 *    those who have paid and are not banned.
 *  - Excused: on the roster of a technical-challenge session that overlaps
 *    this one. A challenge never excuses anyone from itself.
 *  - Must attend: expected and not excused.
 *
 * Timestamps are TIMESTAMP WITHOUT TIME ZONE holding UTC. The pg driver would
 * read them as the server's local time, so they leave the database as ISO
 * strings marked UTC instead.
 */

/** A timestamp column as an ISO string in UTC. Only ever given literals. */
function iso(column: string) {
  return Prisma.raw(`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
}

/**
 * The roster of every session, and where each person on it stands. Every
 * session's, because who is excused from one depends on the rosters of the
 * others. At a few hundred participants and a few dozen sessions that is a
 * few thousand rows, all inside one query.
 *
 * `standing` has one row per session and person who is expected, scanned, or
 * both, with flags for each — every count is a FILTER over it.
 */
const ROSTER = Prisma.sql`
  attendees AS (
    SELECT id FROM public.participants WHERE paid AND NOT banned
  ),
  listed AS (
    SELECT session_id, participant_id FROM checkin.session_participants
    UNION
    SELECT s.id, m.participant_id
      FROM checkin.sessions s
      JOIN public.teams t ON t.activity::text = s.team_activity AND t.selected
      JOIN public.team_memberships m ON m.team_id = t.id
  ),
  expected AS (
    SELECT s.id AS session_id, a.id AS participant_id
      FROM checkin.sessions s
     CROSS JOIN attendees a
     WHERE s.audience = 'Everyone'
    UNION
    SELECT l.session_id, l.participant_id
      FROM listed l
      JOIN checkin.sessions s ON s.id = l.session_id AND s.audience = 'Assigned'
      JOIN attendees a ON a.id = l.participant_id
  ),
  excused AS (
    SELECT DISTINCT s.id AS session_id, e.participant_id
      FROM checkin.sessions s
      JOIN checkin.sessions c
        ON c.challenge
       AND c.id <> s.id
       AND c.starts_at < s.ends_at
       AND c.ends_at > s.starts_at
      JOIN expected e ON e.session_id = c.id
     WHERE NOT s.challenge
  ),
  latest AS (
    -- Their latest interval decides whether they are inside now.
    SELECT DISTINCT ON (session_id, participant_id)
           session_id, participant_id, check_out_at IS NULL AS inside
      FROM checkin.presences
     ORDER BY session_id, participant_id, check_in_at DESC
  ),
  standing AS (
    SELECT COALESCE(e.session_id, l.session_id) AS session_id,
           COALESCE(e.participant_id, l.participant_id) AS participant_id,
           e.participant_id IS NOT NULL AS expected,
           x.participant_id IS NOT NULL AS excused,
           l.participant_id IS NOT NULL AS seen,
           COALESCE(l.inside, false) AS inside
      FROM expected e
      FULL JOIN latest l
        ON l.session_id = e.session_id AND l.participant_id = e.participant_id
      LEFT JOIN excused x
        ON x.session_id = COALESCE(e.session_id, l.session_id)
       AND x.participant_id = COALESCE(e.participant_id, l.participant_id)
  ),
  counts AS (
    SELECT session_id,
           count(*) FILTER (WHERE expected)::int                             AS expected,
           count(*) FILTER (WHERE expected AND excused)::int                 AS excused,
           count(*) FILTER (WHERE expected AND NOT excused)::int             AS must_attend,
           count(*) FILTER (WHERE seen)::int                                 AS checked_in,
           count(*) FILTER (WHERE expected AND NOT excused AND seen)::int    AS attended,
           count(*) FILTER (WHERE inside)::int                               AS inside,
           count(*) FILTER (WHERE expected AND NOT excused AND NOT seen)::int AS not_checked_in,
           count(*) FILTER (WHERE seen AND NOT expected)::int                AS walk_ins
      FROM standing
     GROUP BY session_id
  )`;

type SessionSqlRow = {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  opened_at: string | null;
  started_at: string | null;
  status: SessionStatus;
  audience: SessionAudience;
  mandatory: boolean;
  challenge: boolean;
  team_activity: string | null;
  has_roster: boolean;
  officers: string[];
  expected: number;
  excused: number;
  must_attend: number;
  checked_in: number;
  attended: number;
  inside: number;
  not_checked_in: number;
  walk_ins: number;
};

/** Sessions with their counts; all of them, or the one `id` names. */
function sessionsQuery(id?: string) {
  return prisma.$queryRaw<SessionSqlRow[]>`
    WITH ${ROSTER},
    scanned_by AS (
      SELECT p.session_id, sc.display_name, count(*) AS scans
        FROM checkin.presences p
        JOIN checkin.scanners sc
          ON sc.id = p.check_in_scanner_id OR sc.id = p.check_out_scanner_id
       GROUP BY p.session_id, sc.display_name
    )
    SELECT s.id, s.title, s.location,
           ${iso('s.starts_at')} AS starts_at,
           ${iso('s.ends_at')} AS ends_at,
           ${iso('s.opened_at')} AS opened_at,
           ${iso('s.started_at')} AS started_at,
           s.status::text AS status,
           s.audience::text AS audience,
           s.mandatory, s.challenge, s.team_activity,
           s.audience = 'Everyone'
             OR s.team_activity IS NOT NULL
             OR EXISTS (SELECT 1 FROM checkin.session_participants sp WHERE sp.session_id = s.id)
             AS has_roster,
           COALESCE(
             (SELECT array_agg(b.display_name ORDER BY b.scans DESC, b.display_name)
                FROM scanned_by b WHERE b.session_id = s.id),
             '{}'
           ) AS officers,
           COALESCE(c.expected, 0) AS expected,
           COALESCE(c.excused, 0) AS excused,
           COALESCE(c.must_attend, 0) AS must_attend,
           COALESCE(c.checked_in, 0) AS checked_in,
           COALESCE(c.attended, 0) AS attended,
           COALESCE(c.inside, 0) AS inside,
           COALESCE(c.not_checked_in, 0) AS not_checked_in,
           COALESCE(c.walk_ins, 0) AS walk_ins
      FROM checkin.sessions s
      LEFT JOIN counts c ON c.session_id = s.id
     WHERE ${id ?? null}::text IS NULL OR s.id = ${id ?? null}::text
     ORDER BY s.starts_at, s.title`;
}

function toSession(row: SessionSqlRow): SessionRow {
  const counts: SessionCounts = {
    expected: row.expected,
    excused: row.excused,
    mustAttend: row.must_attend,
    checkedIn: row.checked_in,
    attended: row.attended,
    inside: row.inside,
    notCheckedIn: row.not_checked_in,
    walkIns: row.walk_ins,
  };
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    openedAt: row.opened_at,
    startedAt: row.started_at,
    status: row.status,
    audience: row.audience,
    mandatory: row.mandatory,
    challenge: row.challenge,
    teamActivity: row.team_activity,
    hasRoster: row.has_roster,
    officers: row.officers,
    ...counts,
  };
}

/**
 * Whether the check-in app's tables are here at all — on a database it was
 * never set up against they are not, and that is an empty page, not an error.
 * scanner_assignments came later than the rest, so it is asked after too.
 */
const getCheckinTables = cache(async () => {
  const [row] = await prisma.$queryRaw<{ sessions: boolean; assignments: boolean }[]>`
    SELECT to_regclass('checkin.sessions') IS NOT NULL AS sessions,
           to_regclass('checkin.scanner_assignments') IS NOT NULL AS assignments`;
  return row;
});

/** Every session with its counts, in running order; null with no check-in app. */
export async function getSessions(): Promise<SessionRow[] | null> {
  if (!(await getCheckinTables()).sessions) return null;
  return (await sessionsQuery()).map(toSession);
}

/**
 * One session, everyone it concerns, the officers who scanned it and the
 * penalties it charged. Null with no check-in app; `session: null` when it
 * has no session by that id. Cached per request: the page's title and body
 * both ask.
 */
export const getSessionDetail = cache(
  async (id: string): Promise<{ found: false; reason: 'no-checkin' | 'not-found' } | ({ found: true } & SessionDetail)> => {
    const tables = await getCheckinTables();
    if (!tables.sessions) return { found: false, reason: 'no-checkin' };

    const [sessions, people, officers, unattributed, penalties] = await Promise.all([
      sessionsQuery(id),
      peopleQuery(id),
      officersQuery(id, tables.assignments),
      prisma.$queryRaw<{ n: number }[]>`
        SELECT (count(*) FILTER (WHERE check_in_scanner_id IS NULL)
              + count(*) FILTER (WHERE check_out_at IS NOT NULL AND check_out_scanner_id IS NULL))::int AS n
          FROM checkin.presences
         WHERE session_id = ${id}`,
      penaltiesQuery(id),
    ]);

    if (sessions.length === 0) return { found: false, reason: 'not-found' };

    return {
      found: true,
      session: toSession(sessions[0]),
      people,
      officers,
      unattributedScans: unattributed[0]?.n ?? 0,
      penalties,
    };
  },
);

type PersonSqlRow = {
  participant_id: string;
  name: string | null;
  last_name: string | null;
  email: string | null;
  sb: string | null;
  paid: boolean | null;
  banned: boolean | null;
  team: string | null;
  expected: boolean;
  excused: boolean;
  checked_in: boolean;
  inside: boolean;
  first_check_in: string | null;
  last_check_out: string | null;
  exits: number;
  checked_in_by: string | null;
};

/** Everyone a session concerns, with their scans folded into one row each. */
async function peopleQuery(id: string): Promise<SessionPerson[]> {
  const rows = await prisma.$queryRaw<PersonSqlRow[]>`
    WITH ${ROSTER},
    visits AS (
      SELECT participant_id,
             min(check_in_at) AS first_check_in,
             max(check_out_at) AS last_check_out,
             count(check_out_at)::int AS exits,
             (array_agg(check_in_scanner_id ORDER BY check_in_at))[1] AS first_scanner_id
        FROM checkin.presences
       WHERE session_id = ${id}
       GROUP BY participant_id
    )
    SELECT st.participant_id,
           u.name, u."lastName" AS last_name, u.email,
           p.sb::text AS sb, p.paid, p.banned,
           team.name AS team,
           st.expected, st.excused, st.seen AS checked_in, st.inside,
           ${iso('v.first_check_in')} AS first_check_in,
           ${iso('v.last_check_out')} AS last_check_out,
           COALESCE(v.exits, 0) AS exits,
           sc.display_name AS checked_in_by
      FROM standing st
      JOIN checkin.sessions s ON s.id = st.session_id
      LEFT JOIN public.participants p ON p.id = st.participant_id
      LEFT JOIN public.users u ON u.id = p.user_id
      LEFT JOIN visits v ON v.participant_id = st.participant_id
      LEFT JOIN checkin.scanners sc ON sc.id = v.first_scanner_id
      LEFT JOIN LATERAL (
        SELECT t.name
          FROM public.team_memberships m
          JOIN public.teams t ON t.id = m.team_id
         WHERE m.participant_id = st.participant_id
           AND t.activity::text = s.team_activity
         LIMIT 1
      ) team ON true
     WHERE st.session_id = ${id}
     ORDER BY u."lastName" NULLS LAST, u.name, st.participant_id`;

  return rows.map((r) => ({
    participantId: r.participant_id,
    name: r.name,
    lastName: r.last_name,
    email: r.email,
    sb: r.sb,
    paid: r.paid ?? false,
    banned: r.banned ?? false,
    team: r.team,
    expected: r.expected,
    excused: r.excused,
    checkedIn: r.checked_in,
    inside: r.inside,
    firstCheckIn: r.first_check_in,
    lastCheckOut: r.last_check_out,
    exits: r.exits,
    checkedInBy: r.checked_in_by,
  }));
}

type OfficerSqlRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  role: string | null;
  active: boolean | null;
  assigned: boolean;
  check_ins: number;
  check_outs: number;
  first_scan: string | null;
  last_scan: string | null;
};

/**
 * Officers assigned to the session or who scanned in it. Never the password
 * hash or lockout columns: the dashboard has no use for them.
 */
async function officersQuery(id: string, hasAssignments: boolean): Promise<SessionOfficer[]> {
  const assigned = hasAssignments
    ? Prisma.sql`SELECT scanner_id FROM checkin.scanner_assignments WHERE session_id = ${id}`
    : Prisma.sql`SELECT NULL::text AS scanner_id WHERE false`;

  const rows = await prisma.$queryRaw<OfficerSqlRow[]>`
    WITH scans AS (
      SELECT check_in_scanner_id AS scanner_id, true AS check_in, check_in_at AS at
        FROM checkin.presences
       WHERE session_id = ${id} AND check_in_scanner_id IS NOT NULL
      UNION ALL
      SELECT check_out_scanner_id, false, check_out_at
        FROM checkin.presences
       WHERE session_id = ${id} AND check_out_scanner_id IS NOT NULL AND check_out_at IS NOT NULL
    ),
    by_scanner AS (
      SELECT scanner_id,
             count(*) FILTER (WHERE check_in)::int AS check_ins,
             count(*) FILTER (WHERE NOT check_in)::int AS check_outs,
             min(at) AS first_scan,
             max(at) AS last_scan
        FROM scans
       GROUP BY scanner_id
    ),
    assigned AS (${assigned}),
    officer_ids AS (
      SELECT scanner_id FROM by_scanner
      UNION
      SELECT scanner_id FROM assigned
    )
    SELECT o.scanner_id AS id,
           sc.display_name, sc.username, sc.role::text AS role, sc.active,
           EXISTS (SELECT 1 FROM assigned a WHERE a.scanner_id = o.scanner_id) AS assigned,
           COALESCE(b.check_ins, 0) AS check_ins,
           COALESCE(b.check_outs, 0) AS check_outs,
           ${iso('b.first_scan')} AS first_scan,
           ${iso('b.last_scan')} AS last_scan
      FROM officer_ids o
      LEFT JOIN checkin.scanners sc ON sc.id = o.scanner_id
      LEFT JOIN by_scanner b ON b.scanner_id = o.scanner_id
     ORDER BY COALESCE(b.check_ins, 0) + COALESCE(b.check_outs, 0) DESC, sc.display_name`;

  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    username: r.username,
    role: r.role,
    active: r.active ?? false,
    assigned: r.assigned,
    checkIns: r.check_ins,
    checkOuts: r.check_outs,
    firstScan: r.first_scan,
    lastScan: r.last_scan,
  }));
}

type PenaltySqlRow = {
  id: string;
  participant_id: string;
  name: string | null;
  last_name: string | null;
  sb: string | null;
  reason: PenaltyReason;
  minutes: number;
  points: number;
  created_at: string;
};

/** Points charged in the session. `sb` is the snapshot taken when charged. */
async function penaltiesQuery(id: string): Promise<SessionPenalty[]> {
  const rows = await prisma.$queryRaw<PenaltySqlRow[]>`
    SELECT pe.id, pe.participant_id,
           u.name, u."lastName" AS last_name,
           pe.sb::text AS sb, pe.reason::text AS reason,
           pe.break_minutes AS minutes, pe.points,
           ${iso('pe.created_at')} AS created_at
      FROM checkin.penalties pe
      LEFT JOIN public.participants p ON p.id = pe.participant_id
      LEFT JOIN public.users u ON u.id = p.user_id
     WHERE pe.session_id = ${id}
     ORDER BY pe.created_at, pe.id`;

  return rows.map((r) => ({
    id: r.id,
    participantId: r.participant_id,
    name: r.name,
    lastName: r.last_name,
    sb: r.sb,
    reason: r.reason,
    minutes: r.minutes,
    points: r.points,
    createdAt: r.created_at,
  }));
}
