import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ChallengeTeam, Workshop, WorkshopPerson, WorkshopSeat, WorkshopsData } from './workshop-types';

/*
 * Day-3 workshops, read from the main website's tables (public.workshops,
 * public.workshop_bookings, public.workshop_payment_waivers). The website's
 * backend owns them and keeps them out of this app's Prisma schema, so they
 * are read with raw SQL, as the check-in tables are.
 *
 * Who may hold a seat is the backend's rule (WorkshopService.mayBook): not
 * banned, and paid or given a workshop payment waiver.
 */

/** The website's booking rule, over `p` and the waiver row `w`. */
const ELIGIBLE = Prisma.raw('NOT p.banned AND (p.paid OR w.participant_id IS NOT NULL)');

type WorkshopSqlRow = {
  id: string;
  title: string;
  speaker: string | null;
  room: string;
  session: number;
  start_time: string;
  end_time: string;
  capacity: number;
  audience: string | null;
  booked: number;
};

type PersonSqlRow = {
  id: string;
  name: string;
  last_name: string;
  email: string;
  phone: string;
  sb: string | null;
  is_ras: boolean;
  eligible: boolean;
  banned: boolean;
  challenge_team: string | null;
  seats: WorkshopSeat[];
};

type TeamSqlRow = {
  id: string;
  name: string;
  code: string;
  members: {
    id: string;
    name: string;
    lastName: string;
    sb: string | null;
    eligible: boolean;
    inWorkshop: boolean;
  }[];
};

/**
 * Every workshop with its seat count; every participant, with their seats and
 * whether they may hold one; and the selected technical challenge teams.
 * Everyone, not only who may book, so a search for someone unpaid says why
 * they can't be added rather than finding nobody.
 */
export async function getWorkshopsData(): Promise<WorkshopsData | null> {
  const [exists] = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT to_regclass('public.workshops') IS NOT NULL
       AND to_regclass('public.workshop_bookings') IS NOT NULL AS ok`;
  if (!exists?.ok) return null;

  const [workshops, people, teams] = await Promise.all([
    prisma.$queryRaw<WorkshopSqlRow[]>`
      SELECT w.id, w.title, w.speaker, w.room, w.session,
             w.start_time, w.end_time, w.capacity, w.audience,
             (SELECT count(*)::int FROM public.workshop_bookings b WHERE b.workshop_id = w.id) AS booked
        FROM public.workshops w
       ORDER BY w.session, w.sort_order, w.title`,

    // Seats leave as ISO strings in UTC: created_at is TIMESTAMP WITHOUT TIME
    // ZONE holding UTC, which the pg driver would read as local time.
    prisma.$queryRaw<PersonSqlRow[]>`
      SELECT p.id, u.name, u."lastName" AS last_name, u.email, p.phone,
             p.sb::text AS sb, p.is_ras,
             (${ELIGIBLE}) AS eligible,
             p.banned,
             team.name AS challenge_team,
             COALESCE(seats.list, '[]'::json) AS seats
        FROM public.participants p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.workshop_payment_waivers w ON w.participant_id = p.id
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object(
                   'workshopId', b.workshop_id,
                   'session', b.session,
                   'bookedAt', to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                 ) ORDER BY b.session) AS list
            FROM public.workshop_bookings b
           WHERE b.participant_id = p.id
        ) seats ON true
        LEFT JOIN LATERAL (
          SELECT t.name
            FROM public.team_memberships m
            JOIN public.teams t ON t.id = m.team_id
           WHERE m.participant_id = p.id AND t.activity = 'CHALLENGE' AND t.selected
           LIMIT 1
        ) team ON true
       ORDER BY u."lastName", u.name, p.id`,

    prisma.$queryRaw<TeamSqlRow[]>`
      SELECT t.id, t.name, t.code,
             json_agg(json_build_object(
               'id', p.id,
               'name', u.name,
               'lastName', u."lastName",
               'sb', p.sb::text,
               'eligible', ${ELIGIBLE},
               'inWorkshop', EXISTS (SELECT 1 FROM public.workshop_bookings b WHERE b.participant_id = p.id)
             ) ORDER BY u."lastName", u.name) AS members
        FROM public.teams t
        JOIN public.team_memberships m ON m.team_id = t.id
        JOIN public.participants p ON p.id = m.participant_id
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.workshop_payment_waivers w ON w.participant_id = p.id
       WHERE t.activity = 'CHALLENGE' AND t.selected
       GROUP BY t.id, t.name, t.code
       ORDER BY t.name`,
  ]);

  return {
    workshops: workshops.map(
      (w): Workshop => ({
        id: w.id,
        title: w.title,
        speaker: w.speaker,
        room: w.room,
        session: w.session,
        startTime: w.start_time,
        endTime: w.end_time,
        capacity: w.capacity,
        audience: w.audience,
        booked: w.booked,
      }),
    ),
    people: people.map(
      (p): WorkshopPerson => ({
        id: p.id,
        name: p.name,
        lastName: p.last_name,
        email: p.email,
        phone: p.phone,
        sb: p.sb,
        isRas: p.is_ras,
        eligible: p.eligible,
        blocked: p.eligible ? null : p.banned ? 'Banned' : 'Not paid',
        challengeTeam: p.challenge_team,
        seats: p.seats,
      }),
    ),
    teams: teams.map((t): ChallengeTeam => ({ id: t.id, name: t.name, code: t.code, members: t.members })),
  };
}
