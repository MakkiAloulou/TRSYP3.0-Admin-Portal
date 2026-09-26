import 'server-only';
import { prisma } from '@/lib/prisma';
import type { TeamActivity } from '@prisma/client';
import type { ExistingCodesMap, TeamRow } from './teams-grid';

/**
 * Loads every team for one activity, flattening `memberships` into the plain
 * member list the grid renders. Teams are scoped by `Team.activity`, so the
 * competition, challenge and hackathon pages never see each other's rows.
 */
export async function getTeamsByActivity(activity: TeamActivity): Promise<TeamRow[]> {
  const teams = await prisma.team.findMany({
    where: { activity },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      code: true,
      size: true,
      leaderId: true,
      axis: true,
      submissionUrl: true,
      submittedAt: true,
      leader: {
        select: {
          id: true,
          user: { select: { name: true, lastName: true } },
        },
      },
      memberships: {
        orderBy: { createdAt: 'asc' },
        select: {
          participant: {
            select: {
              id: true,
              user: { select: { name: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  return teams.map((team) => {
    const members = team.memberships.map((m) => m.participant);

    // Whether the leader also gets a membership row is the registration app's
    // call; listing them first when they don't keeps the card from hiding them.
    if (!members.some((m) => m.id === team.leaderId)) {
      members.unshift(team.leader);
    }

    return {
      id: team.id,
      name: team.name,
      code: team.code,
      size: team.size,
      leaderId: team.leaderId,
      axis: team.axis,
      submissionUrl: team.submissionUrl,
      submittedAt: team.submittedAt?.toISOString() ?? null,
      members,
    };
  });
}

/**
 * RiddleCode has no Prisma relation to Team (kept decoupled on purpose), so
 * existing codes are fetched separately and grouped in JS.
 */
export async function getRiddleCodes(teamIds: string[]): Promise<ExistingCodesMap> {
  if (teamIds.length === 0) return {};

  const riddleCodes = await prisma.riddleCode.findMany({
    where: { teamId: { in: teamIds } },
    select: { teamId: true, riddleNumber: true, code: true },
  });

  const existingCodes: ExistingCodesMap = {};
  for (const rc of riddleCodes) {
    existingCodes[rc.teamId] = { ...(existingCodes[rc.teamId] ?? {}), [rc.riddleNumber]: rc.code };
  }
  return existingCodes;
}

/**
 * Loads all participants who are registered in a specific activity (COMPETITION, CHALLENGE or FABLAB),
 * including their team membership information.
 */
export async function getParticipantsByActivity(activity: TeamActivity) {
  const participants = await prisma.participant.findMany({
    where: {
      memberships: {
        some: {
          activity,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      ieeeId: true,
      phone: true,
      gender: true,
      paid: true,
      isInternational: true,
      banned: true,
      participantType: true,
      sb: true,
      country: true,
      // One membership per activity (DB-enforced), so this is at most 3 rows.
      memberships: {
        select: {
          activity: true,
          team: { select: { name: true, code: true, leaderId: true } },
        },
      },
      room: { select: { id: true, status: true } },
      internationalInfo: {
        select: {
          dateOfBirth: true,
          countryOfResidence: true,
          cityOfResidence: true,
          affiliation: true,
          expectedArrivalDate: true,
          expectedDepartureDate: true,
          requiresVisaLetter: true,
          visaApplication: { select: { status: true } },
        },
      },
      user: {
        select: {
          name: true,
          lastName: true,
          email: true,
          active: true,
          createdAt: true,
        },
      },
    },
  });

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the export needs for CSV anyway.
  return JSON.parse(JSON.stringify(participants));
}
