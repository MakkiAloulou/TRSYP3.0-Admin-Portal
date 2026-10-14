'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { buildXlsx } from '@/lib/xlsx';
import { getRoomPairs } from './room-data';
import { parseRoomFilters } from './room-types';

export type RoomsExportResult = { ok: true; base64: string; count: number } | { ok: false; message: string };

/** Fills for a room's two name cells, by the room's gender (ARGB). */
const GENDER_FILLS: Record<string, string> = {
  female: 'FFFFD1DC', // light pink
  male: 'FFC6EFCE', // light green
};

/**
 * An .xlsx of the rooms matching the toolbar's filters, one room per row: the
 * two roommates' names, both cells coloured by the room's gender. A CSV cannot
 * carry colours, hence a workbook.
 *
 * Returned as base64 so the client can save it; the filters are re-parsed
 * here rather than trusted.
 */
export async function exportRoomsXlsx(raw: {
  search?: string | null;
  gender?: string | null;
  status?: string | null;
}): Promise<RoomsExportResult> {
  // Server actions are reachable by POST from anywhere; the dashboard layout's
  // admin check does not cover them.
  if (!(await isAdmin())) return { ok: false, message: 'Only admins can export rooms.' };

  try {
    const pairs = await getRoomPairs(parseRoomFilters(raw));

    const bytes = await buildXlsx(
      pairs.map((pair) => [pair.owner, pair.roommate]),
      { sheet: 'Rooms', fill: (i) => GENDER_FILLS[pairs[i].gender] },
    );
    return { ok: true, base64: Buffer.from(bytes).toString('base64'), count: pairs.length };
  } catch (error) {
    console.error('Could not export rooms', error);
    return { ok: false, message: 'The rooms could not be exported. Try again.' };
  }
}

async function isAdmin() {
  const supabase = await createClient();
  // Verified locally with asymmetric keys, like the dashboard layout's check.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return false;

  const admin = await prisma.admin.findUnique({ where: { supabaseId: userId }, select: { id: true } });
  return admin !== null;
}
