'use server';

import { prisma } from '@/lib/prisma';
import { encodeRiddleCode } from '@/lib/riddle-code.util';
import { revalidatePath } from 'next/cache';

export interface GeneratedRiddleCode {
  teamId: string;
  teamName: string;
  riddleNumber: number;
  code: string;
}

const RIDDLE_NUMBERS = [1, 2, 3] as const;

/**
 * Generates (or re-generates) all 3 riddle codes for each selected team and
 * persists them in `riddle_codes`. Deterministic: re-running for a team that
 * already has codes produces the same codes and just overwrites the row
 * (no duplicates, no drift from what's already been handed out).
 */
export async function generateRiddleCodes(teamIds: string[]): Promise<GeneratedRiddleCode[]> {
  if (teamIds.length === 0) return [];

  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, code: true },
  });

  const results: GeneratedRiddleCode[] = [];

  for (const team of teams) {
    for (const riddleNumber of RIDDLE_NUMBERS) {
      const code = encodeRiddleCode(team.code, riddleNumber);

      await prisma.riddleCode.upsert({
        where: { teamId_riddleNumber: { teamId: team.id, riddleNumber } },
        create: { teamId: team.id, riddleNumber, code },
        update: { code },
      });

      results.push({ teamId: team.id, teamName: team.name, riddleNumber, code });
    }
  }

  revalidatePath('/teams');
  return results;
}
