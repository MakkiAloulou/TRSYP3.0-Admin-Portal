// Kept apart from standings-data.ts, which is server-only: the live table
// runs in the browser and reads these shapes and helpers too.

import type { PenaltyReason } from './session-types';

export type BranchStanding = {
  sb: string;
  /** Paid, unbanned participants of the branch: who could lose it points. */
  attendees: number;
  points: number;
  penalties: number;
  /** Different participants behind those penalties. */
  people: number;
  byReason: Record<PenaltyReason, number>;
  /** Points lost in each session, in running order. */
  bySession: { sessionId: string; title: string; points: number }[];
};

export type Standings = {
  branches: BranchStanding[];
  /** Penalties of participants with no branch: in no branch's total. */
  unbranched: { points: number; penalties: number };
  /** Sessions that charge penalties, for the session picker. */
  sessions: { id: string; title: string; status: string; startsAt: string }[];
};

export type StandingsOrder = 'most' | 'fewest' | 'most-per' | 'fewest-per';

export const STANDINGS_ORDERS: { value: StandingsOrder; label: string }[] = [
  { value: 'most', label: 'Most points lost' },
  { value: 'fewest', label: 'Fewest points lost' },
  { value: 'most-per', label: 'Most lost per attendee' },
  { value: 'fewest-per', label: 'Fewest lost per attendee' },
];

export function parseStandingsOrder(value: string | null | undefined): StandingsOrder {
  return STANDINGS_ORDERS.find((o) => o.value === value)?.value ?? 'most';
}

/** Points lost per attendee; a branch with nobody attending loses none per head. */
export function perAttendee(b: Pick<BranchStanding, 'points' | 'attendees'>) {
  return b.attendees > 0 ? b.points / b.attendees : 0;
}

/**
 * Branches in the chosen order, each with its place. Equal values share a
 * place (1, 2, 2, 4), so a tie never looks like one branch beat another.
 */
export function rank(branches: BranchStanding[], order: StandingsOrder) {
  const value = (b: BranchStanding) => (order === 'most' || order === 'fewest' ? b.points : perAttendee(b));
  const sign = order === 'most' || order === 'most-per' ? -1 : 1;
  const sorted = [...branches].sort((a, b) => sign * (value(a) - value(b)) || a.sb.localeCompare(b.sb));

  let place = 0;
  return sorted.map((b, i) => {
    if (i === 0 || Math.abs(value(b) - value(sorted[i - 1])) > 1e-9) place = i + 1;
    return { ...b, place };
  });
}
