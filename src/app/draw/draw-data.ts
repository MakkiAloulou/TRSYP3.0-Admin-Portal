import 'server-only';
import { prisma } from '@/lib/prisma';
import { parseDrawOrder } from './teams';

/**
 * The last saved draw as team keys in slot order (match 1 green, match 1
 * pink, match 2 green…), or null when there is none or it no longer matches
 * the team list.
 */
export async function getSavedDraw(): Promise<string[] | null> {
  const matches = await prisma.competitionDrawMatch.findMany({ orderBy: { matchNumber: 'asc' } });
  return parseDrawOrder(matches.flatMap((match) => [match.greenTeam, match.pinkTeam]));
}
