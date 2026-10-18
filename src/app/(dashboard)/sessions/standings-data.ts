import 'server-only';
import { prisma } from '@/lib/prisma';
import type { BranchStanding, Standings } from './standings-types';

/*
 * Points each student branch has lost, from the check-in app's penalties
 * (checkin.penalties). Read-only raw SQL, like the rest of this section.
 *
 * A penalty carries the branch it was charged to (a snapshot), and that is
 * what is summed — as the check-in app's own standings do — so a participant
 * changing branch later never moves points between branches.
 */

type StandingSqlRow = {
  sb: string;
  attendees: number;
  points: number;
  penalties: number;
  people: number;
  absent: number;
  late: number;
  over_break: number;
  left_early: number;
  by_session: { sessionId: string; title: string; points: number }[];
};

/**
 * Every branch with paid attendees or penalties, with what it has lost — in
 * one session, or across all of them. Ranking is left to the page, which can
 * order by total or by attendee.
 */
export async function getStandings(sessionId: string | null): Promise<Standings | null> {
  const [exists] = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT to_regclass('checkin.penalties') IS NOT NULL AS ok`;
  if (!exists?.ok) return null;

  const [rows, unbranched, sessions] = await Promise.all([
    prisma.$queryRaw<StandingSqlRow[]>`
      WITH charged AS (
        SELECT pe.*, s.title, s.starts_at
          FROM checkin.penalties pe
          JOIN checkin.sessions s ON s.id = pe.session_id
         WHERE pe.sb IS NOT NULL
           AND (${sessionId}::text IS NULL OR pe.session_id = ${sessionId}::text)
      ),
      lost AS (
        SELECT sb::text AS sb,
               sum(points)::int AS points,
               count(*)::int AS penalties,
               count(DISTINCT participant_id)::int AS people,
               count(*) FILTER (WHERE reason = 'Absent')::int AS absent,
               count(*) FILTER (WHERE reason = 'Late')::int AS late,
               count(*) FILTER (WHERE reason = 'OverBreak')::int AS over_break,
               count(*) FILTER (WHERE reason = 'LeftEarly')::int AS left_early
          FROM charged
         GROUP BY sb
      ),
      per_session AS (
        SELECT sb::text AS sb,
               json_agg(json_build_object('sessionId', session_id, 'title', title, 'points', points)
                        ORDER BY starts_at) AS by_session
          FROM (
            SELECT sb, session_id, title, starts_at, sum(points)::int AS points
              FROM charged
             GROUP BY sb, session_id, title, starts_at
          ) s
         GROUP BY sb
      ),
      branches AS (
        SELECT sb::text AS sb, count(*)::int AS attendees
          FROM public.participants
         WHERE sb IS NOT NULL AND paid AND NOT banned
         GROUP BY sb
      )
      SELECT COALESCE(b.sb, l.sb) AS sb,
             COALESCE(b.attendees, 0) AS attendees,
             COALESCE(l.points, 0) AS points,
             COALESCE(l.penalties, 0) AS penalties,
             COALESCE(l.people, 0) AS people,
             COALESCE(l.absent, 0) AS absent,
             COALESCE(l.late, 0) AS late,
             COALESCE(l.over_break, 0) AS over_break,
             COALESCE(l.left_early, 0) AS left_early,
             COALESCE(ps.by_session, '[]'::json) AS by_session
        FROM branches b
        FULL JOIN lost l ON l.sb = b.sb
        LEFT JOIN per_session ps ON ps.sb = COALESCE(b.sb, l.sb)
       ORDER BY 3 DESC, 1`,

    // Charged to nobody: the participant had no branch. Left out of the
    // ranking, as in the check-in app, but counted so the total adds up.
    prisma.$queryRaw<{ points: number; penalties: number }[]>`
      SELECT COALESCE(sum(points), 0)::int AS points, count(*)::int AS penalties
        FROM checkin.penalties
       WHERE sb IS NULL
         AND (${sessionId}::text IS NULL OR session_id = ${sessionId}::text)`,

    // Sessions that charge penalties, in running order, for the picker.
    prisma.$queryRaw<{ id: string; title: string; status: string; starts_at: string }[]>`
      SELECT id, title, status::text AS status,
             to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS starts_at
        FROM checkin.sessions
       WHERE mandatory
       ORDER BY starts_at, title`,
  ]);

  return {
    branches: rows.map(
      (r): BranchStanding => ({
        sb: r.sb,
        attendees: r.attendees,
        points: r.points,
        penalties: r.penalties,
        people: r.people,
        byReason: { Absent: r.absent, Late: r.late, OverBreak: r.over_break, LeftEarly: r.left_early },
        bySession: r.by_session,
      }),
    ),
    unbranched: unbranched[0] ?? { points: 0, penalties: 0 },
    sessions: sessions.map((s) => ({ id: s.id, title: s.title, status: s.status, startsAt: s.starts_at })),
  };
}
