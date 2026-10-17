'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getAdminId } from '@/lib/require-admin';
import { getRegister } from './aruco-data';
import { parseMarker, registerProblems, type Marker } from './aruco-types';

export type SaveRegisterResult =
  | { ok: true; markers: Marker[]; version: string }
  /** `stale`: another admin saved since this editor loaded; reload before saving. */
  | { ok: false; stale: boolean; message: string };

/**
 * Replaces the whole register in one transaction. Whole, not row by row, so
 * swapping two markers' IDs is one save: there is never a moment where both
 * rows want the same primary key. The main site reads the table on every
 * scan, so the change is live as soon as this returns.
 */
export async function saveRegister(raw: unknown, version: string): Promise<SaveRegisterResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  if (!(await getAdminId())) return { ok: false, stale: false, message: 'Only admins can edit the ArUco register.' };

  if (!Array.isArray(raw)) return { ok: false, stale: false, message: 'Nothing to save.' };
  const markers = raw.map(parseMarker);
  if (markers.some((m) => m === null)) return { ok: false, stale: false, message: 'A row is not a valid marker.' };

  const parsed = markers as Marker[];
  const problems = registerProblems(parsed);
  if (problems.size > 0) {
    const [index, problem] = [...problems][0];
    return { ok: false, stale: false, message: `Row ${index + 1}: ${problem}` };
  }

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const current = await getRegister(tx);
      if (current.version !== version) return null;

      await tx.arucoMarker.deleteMany({});
      await tx.arucoMarker.createMany({ data: parsed });
      return getRegister(tx);
    });

    if (!saved) {
      return {
        ok: false,
        stale: true,
        message: 'Someone else saved the register since you opened it. Reload to see their changes, then redo yours.',
      };
    }

    revalidatePath('/teams/aruco');
    return { ok: true, ...saved };
  } catch (error) {
    console.error('Could not save the ArUco register', error);
    return { ok: false, stale: false, message: 'The register could not be saved. Try again.' };
  }
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
