'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getAdminId } from '@/lib/require-admin';

export type ArucoActionResult = { ok: true; roundId?: string } | { ok: false; message: string };

const NOT_ADMIN = { ok: false, message: 'Only admins can run the ArUco games.' } as const;

/**
 * Starts a round of one game for the chosen Competition teams, and makes it
 * the live one on /aruco. Ends whatever round was live and deletes every
 * team's tries, field log and word attempts first, so no team ever sees an
 * earlier game's markers. The activity log is kept for the admin page.
 */
export async function startRound(game: unknown, teamIds: unknown): Promise<ArucoActionResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  const adminId = await getAdminId();
  if (!adminId) return NOT_ADMIN;

  if (!Number.isInteger(game)) return { ok: false, message: 'Unknown game.' };
  if (!Array.isArray(teamIds) || !teamIds.every((id) => typeof id === 'string')) {
    return { ok: false, message: 'Choose the teams that play.' };
  }
  const chosen = [...new Set(teamIds as string[])];
  if (chosen.length === 0) return { ok: false, message: 'Choose at least one team.' };

  try {
    const [found, teams] = await Promise.all([
      prisma.arucoGame.findUnique({ where: { number: game as number }, select: { number: true } }),
      prisma.team.count({ where: { id: { in: chosen }, activity: 'COMPETITION' } }),
    ]);
    if (!found) return { ok: false, message: 'Unknown game.' };
    if (teams !== chosen.length) return { ok: false, message: 'A chosen team is not a Competition team any more. Reload the page.' };

    const roundId = randomUUID();
    await prisma.$transaction([
      prisma.arucoRound.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } }),
      prisma.arucoScan.deleteMany({}),
      prisma.arucoWordProgress.deleteMany({}),
      prisma.arucoRound.create({ data: { id: roundId, game: game as number, startedBy: adminId } }),
      prisma.arucoRoundTeam.createMany({ data: chosen.map((teamId) => ({ roundId, teamId })) }),
    ]);

    revalidatePath('/teams/aruco');
    return { ok: true, roundId };
  } catch (error) {
    console.error('Could not start the ArUco round', error);
    return { ok: false, message: 'The game could not be started. Try again.' };
  }
}

/**
 * Ends the live round: /aruco closes, and every team's tries, field log and
 * word attempts are deleted. The activity log is kept.
 */
export async function stopRound(): Promise<ArucoActionResult> {
  if (!(await getAdminId())) return NOT_ADMIN;
  try {
    await prisma.$transaction([
      prisma.arucoRound.updateMany({ where: { endedAt: null }, data: { endedAt: new Date() } }),
      prisma.arucoScan.deleteMany({}),
      prisma.arucoWordProgress.deleteMany({}),
    ]);
    revalidatePath('/teams/aruco');
    return { ok: true };
  } catch (error) {
    console.error('Could not stop the ArUco round', error);
    return { ok: false, message: 'The game could not be stopped. Try again.' };
  }
}

/**
 * Gives one team of the live round a fresh start: its tries, field log and
 * word attempts are deleted, and the reset is written to its timeline.
 */
export async function resetTeam(roundId: unknown, teamId: unknown): Promise<ArucoActionResult> {
  if (!(await getAdminId())) return NOT_ADMIN;
  if (typeof roundId !== 'string' || typeof teamId !== 'string') return { ok: false, message: 'Unknown team.' };

  try {
    const round = await prisma.arucoRound.findUnique({ where: { id: roundId }, select: { endedAt: true } });
    if (!round || round.endedAt) return { ok: false, message: 'Only a team in the live game can be reset.' };

    const where = { roundId, teamId };
    await prisma.$transaction([
      prisma.arucoScan.deleteMany({ where }),
      prisma.arucoWordProgress.deleteMany({ where }),
      prisma.arucoEvent.create({ data: { roundId, teamId, action: 'reset', outcome: 'reset' } }),
    ]);
    revalidatePath('/teams/aruco');
    return { ok: true };
  } catch (error) {
    console.error('Could not reset the ArUco team', error);
    return { ok: false, message: 'The team could not be reset. Try again.' };
  }
}
