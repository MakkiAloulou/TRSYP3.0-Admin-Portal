'use server';

import { prisma } from '@/lib/prisma';
import { getAdminId } from '@/lib/require-admin';
import { parseDrawOrder } from './teams';

export type SaveDrawResult = { ok: true } | { ok: false; message: string };

/**
 * Stores a draw, replacing the previous one: the four matches go in together
 * or not at all, so the table never holds half of one draw and half of
 * another. `order` is the team keys in slot order, checked here rather than
 * trusted.
 */
export async function saveDraw(order: string[]): Promise<SaveDrawResult> {
  const adminId = await getAdminId();
  if (!adminId) return { ok: false, message: 'Only admins can save the draw.' };

  const keys = parseDrawOrder(order);
  if (!keys) return { ok: false, message: 'That draw does not match the competition’s teams.' };

  try {
    await prisma.$transaction([
      prisma.competitionDrawMatch.deleteMany(),
      prisma.competitionDrawMatch.createMany({
        data: Array.from({ length: keys.length / 2 }, (_, m) => ({
          matchNumber: m + 1,
          greenTeam: keys[m * 2],
          pinkTeam: keys[m * 2 + 1],
          drawnBy: adminId,
        })),
      }),
    ]);
    return { ok: true };
  } catch (error) {
    console.error('Could not save the draw', error);
    return { ok: false, message: 'The draw could not be saved.' };
  }
}
