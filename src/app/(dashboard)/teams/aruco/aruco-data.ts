import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseMarker, type Marker, type TeamProgress } from './aruco-types';

/**
 * A fingerprint of the register as last saved. The editor sends back the one
 * it loaded with, so a save made over another admin's newer save is refused
 * rather than silently undoing it. Every save rewrites every row, so the
 * newest `updated_at` changes on each one.
 */
export function registerVersion(rows: { updatedAt: Date }[]): string {
  const newest = rows.reduce((max, row) => Math.max(max, row.updatedAt.getTime()), 0);
  return `${rows.length}:${newest}`;
}

export async function getRegister(db: Prisma.TransactionClient = prisma) {
  const rows = await db.arucoMarker.findMany({ orderBy: { markerId: 'asc' } });
  // The table's CHECK constraints keep rows well formed; parseMarker only narrows the types.
  const markers = rows.map(parseMarker).filter((m): m is Marker => m !== null);
  return { markers, version: registerVersion(rows) };
}

/** Every team that has tried a marker or a collector, by team name. */
export async function getTeamProgress(): Promise<TeamProgress[]> {
  const [scans, collectors] = await Promise.all([
    prisma.arucoScan.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.arucoCollectorProgress.findMany({ orderBy: { collector: 'asc' } }),
  ]);

  const teamIds = [...new Set([...scans, ...collectors].map((row) => row.teamId))];
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } });
  const names = new Map(teams.map((team) => [team.id, team.name]));

  return teamIds
    .map((teamId) => ({
      teamId,
      teamName: names.get(teamId) ?? null,
      scans: scans
        .filter((s) => s.teamId === teamId)
        .map((s) => ({ markerId: s.markerId, at: s.createdAt.toISOString() })),
      collectors: collectors
        .filter((c) => c.teamId === teamId)
        .map((c) => ({
          collector: c.collector,
          attempts: c.attempts,
          solved: c.solved,
          solvedAt: c.solvedAt?.toISOString() ?? null,
        })),
    }))
    .sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''));
}
