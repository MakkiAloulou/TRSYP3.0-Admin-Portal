import 'server-only';
import { prisma } from '@/lib/prisma';

/** `checked_by` for the main website's automatic checks. */
export const SYSTEM_CHECKER = 'system';

/**
 * Replaces each row's `checked_by` — 'system' or an admin id — with something
 * a person can read: "System" or the admin's name. Rows are the participants
 * as loaded, each with an optional `ieeeVerification`; they are updated in
 * place and returned for chaining.
 */
export async function withCheckerNames<T extends { ieeeVerification: { checkedBy: string } | null }>(
  rows: T[],
): Promise<T[]> {
  const adminIds = [
    ...new Set(
      rows
        .map((row) => row.ieeeVerification?.checkedBy)
        .filter((id): id is string => Boolean(id) && id !== SYSTEM_CHECKER),
    ),
  ];

  const admins = adminIds.length
    ? await prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, lastName: true } })
    : [];
  const names = new Map(admins.map((a) => [a.id, `${a.name} ${a.lastName}`]));

  for (const row of rows) {
    if (row.ieeeVerification) row.ieeeVerification.checkedBy = checkerLabel(row.ieeeVerification.checkedBy, names);
  }
  return rows;
}

export function checkerLabel(checkedBy: string, names: Map<string, string>) {
  if (checkedBy === SYSTEM_CHECKER) return 'System';
  return names.get(checkedBy) ?? 'A removed admin';
}
