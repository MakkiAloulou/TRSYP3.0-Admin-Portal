import 'server-only';
import { prisma } from '@/lib/prisma';
import type { TeamActivity } from '@prisma/client';
import type { ExistingCodesMap, TeamRow } from './teams-grid';

/**
 * Loads every team for one activity, flattening `memberships` into the plain
 * member list the grid renders. Teams are scoped by `Team.activity`, so the
 * competition and challenge pages never see each other's rows.
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

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    code: team.code,
    size: team.size,
    leaderId: team.leaderId,
    members: team.memberships.map((m) => m.participant),
  }));
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
