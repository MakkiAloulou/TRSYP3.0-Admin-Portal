'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getAdminId } from '@/lib/require-admin';
import { getRegister } from './aruco-data';
import { idProblems, type Marker, type Move } from './aruco-types';

export type SaveRegisterResult =
  | { ok: true; markers: Marker[]; version: string }
  /** `stale`: another admin saved since this editor loaded; reload before saving. */
  | { ok: false; stale: boolean; message: string };

/**
 * Re-ranks the register: moves markers to other IDs, nothing else. What each
 * marker does is read back from the table here, never taken from the client,
 * so a save can't change a clue. The whole register is rewritten in one
 * transaction, so swapping two IDs is one save: no moment where both rows
 * want the same primary key. The main site reads the table on every scan.
 */
export async function reassignIds(raw: unknown, version: string): Promise<SaveRegisterResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  if (!(await getAdminId())) return { ok: false, stale: false, message: 'Only admins can re-rank the ArUco register.' };

  if (!Array.isArray(raw) || !raw.every(isMove)) return { ok: false, stale: false, message: 'Nothing to save.' };
  const moves = new Map((raw as Move[]).map((m) => [m.from, m.to]));
  if (moves.size !== raw.length) return { ok: false, stale: false, message: 'A marker was moved twice.' };

  try {
    type Outcome = { stale: true } | { problem: string } | { saved: Awaited<ReturnType<typeof getRegister>> };
    const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      const current = await getRegister(tx);
      // A marker that no longer has the ID it was moved from: the register changed.
      if (
        current.version !== version ||
        [...moves.keys()].some((from) => !current.markers.some((m) => m.markerId === from))
      ) {
        return { stale: true };
      }
      const next = current.markers.map((m) => ({ ...m, markerId: moves.get(m.markerId) ?? m.markerId }));
      const problems = idProblems(next.map((m) => m.markerId));
      if (problems.size > 0) {
        const [index, problem] = [...problems][0];
        return { problem: `${next[index].name}: ${problem}` };
      }

      await tx.arucoMarker.deleteMany({});
      await tx.arucoMarker.createMany({ data: next });
      return { saved: await getRegister(tx) };
    });

    if ('stale' in outcome) {
      return {
        ok: false,
        stale: true,
        message: 'Someone else saved the register since you opened it. Reload to see their changes, then redo yours.',
      };
    }
    if ('problem' in outcome) return { ok: false, stale: false, message: outcome.problem };

    revalidatePath('/teams/aruco');
    return { ok: true, ...outcome.saved };
  } catch (error) {
    console.error('Could not save the ArUco register', error);
    return { ok: false, stale: false, message: 'The register could not be saved. Try again.' };
  }
}

function isMove(value: unknown): value is Move {
  if (!value || typeof value !== 'object') return false;
  const { from, to } = value as Record<string, unknown>;
  return Number.isInteger(from) && Number.isInteger(to);
}

export type ResetProgressResult = { ok: true } | { ok: false; message: string };

/**
 * Wipes ArUco progress: the marker IDs tried and the collector attempts, for
 * one team or (`teamId` null) every team. Cannot be undone; the UI confirms.
 */
export async function resetProgress(teamId: string | null): Promise<ResetProgressResult> {
  if (!(await getAdminId())) return { ok: false, message: 'Only admins can reset ArUco progress.' };
  if (teamId !== null && typeof teamId !== 'string') return { ok: false, message: 'Unknown team.' };

  const where = teamId === null ? {} : { teamId };
  try {
    await prisma.$transaction([
      prisma.arucoScan.deleteMany({ where }),
      prisma.arucoCollectorProgress.deleteMany({ where }),
    ]);
    revalidatePath('/teams/aruco');
    return { ok: true };
  } catch (error) {
    console.error('Could not reset ArUco progress', error);
    return { ok: false, message: 'Progress could not be reset. Try again.' };
  }
}
