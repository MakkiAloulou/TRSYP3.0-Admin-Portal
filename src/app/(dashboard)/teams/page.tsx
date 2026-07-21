import { prisma } from '@/lib/prisma';
import { TeamsGrid, type ExistingCodesMap } from './teams-grid';

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      code: true,
      size: true,
      leaderId: true,
      members: {
        select: {
          id: true,
          user: {
            select: {
              name: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  // RiddleCode has no Prisma relation to Team (kept decoupled on purpose),
  // so existing codes are fetched separately and grouped in JS.
  const riddleCodes = await prisma.riddleCode.findMany({
    where: { teamId: { in: teams.map((t) => t.id) } },
    select: { teamId: true, riddleNumber: true, code: true },
  });

  const existingCodes: ExistingCodesMap = {};
  for (const rc of riddleCodes) {
    existingCodes[rc.teamId] = { ...(existingCodes[rc.teamId] ?? {}), [rc.riddleNumber]: rc.code };
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} total
        </p>
      </div>

      <TeamsGrid teams={teams} existingCodes={existingCodes} />
    </div>
  );
}
