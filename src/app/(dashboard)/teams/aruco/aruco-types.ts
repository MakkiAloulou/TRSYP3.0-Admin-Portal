/**
 * The ArUco register as the editor and the save action both see it. Shared so
 * the editor can flag a problem before saving and the action can refuse the
 * same problem from a forged POST.
 */

export const MARKER_KINDS = ['beacon', 'indicator', 'collector'] as const;
export const MARKER_GAMES = ['Garden', 'Mine'] as const;
/** Collectors with an ARUCO_COLLECTOR_<n>_ANSWER on the backend. */
export const COLLECTORS = [1, 2] as const;
/** DICT_4X4_50 has IDs 0 to 49. */
export const MAX_MARKER_ID = 49;
/** How many beacons may carry one ID: a sanity cap, not a rule of the game. */
const MAX_QUANTITY = 20;
const MAX_NAME = 80;
const MAX_CLUE = 300;

export type MarkerKind = (typeof MARKER_KINDS)[number];
export type MarkerGame = (typeof MARKER_GAMES)[number];

export const KIND_LABELS: Record<MarkerKind, string> = {
  beacon: 'Red beacon',
  indicator: 'Indicator',
  collector: 'Collector',
};

/** One aruco_markers row. `quantity` is beacons only, `collector` collectors only. */
export type Marker = {
  markerId: number;
  kind: MarkerKind;
  game: MarkerGame;
  name: string;
  clue: string;
  quantity: number | null;
  collector: number | null;
};

/**
 * Changes a marker's kind, giving it the fields that kind needs and dropping
 * the ones it can't have, so a row is never left half one kind.
 */
export function withKind(marker: Marker, kind: MarkerKind): Marker {
  return {
    ...marker,
    kind,
    clue: kind === 'collector' ? '' : marker.clue,
    quantity: kind === 'beacon' ? (marker.quantity ?? 1) : null,
    collector: kind === 'collector' ? (marker.collector ?? 1) : null,
  };
}

/** What is wrong with one marker on its own, or null. */
export function markerProblem(marker: Marker): string | null {
  if (!Number.isInteger(marker.markerId) || marker.markerId < 0 || marker.markerId > MAX_MARKER_ID) {
    return `ID must be a whole number from 0 to ${MAX_MARKER_ID}.`;
  }
  if (!marker.name.trim()) return 'Give it a name.';
  if (marker.name.length > MAX_NAME) return `Name is over ${MAX_NAME} characters.`;
  if (marker.clue.length > MAX_CLUE) return `Clue is over ${MAX_CLUE} characters.`;
  if (marker.kind === 'beacon') {
    const q = marker.quantity;
    if (q === null || !Number.isInteger(q) || q < 1 || q > MAX_QUANTITY) {
      return `Quantity must be from 1 to ${MAX_QUANTITY}.`;
    }
  }
  if (marker.kind === 'collector' && !COLLECTORS.includes(marker.collector as 1 | 2)) {
    return 'Pick collector 1 or 2.';
  }
  return null;
}

/** Each problem in the register, by row index: a row's own, then a shared ID. */
export function registerProblems(markers: Marker[]): Map<number, string> {
  const problems = new Map<number, string>();
  const rowsById = new Map<number, number[]>();
  markers.forEach((marker, i) => {
    const own = markerProblem(marker);
    if (own) problems.set(i, own);
    rowsById.set(marker.markerId, [...(rowsById.get(marker.markerId) ?? []), i]);
  });
  for (const [id, rows] of rowsById) {
    if (rows.length < 2) continue;
    for (const i of rows) if (!problems.has(i)) problems.set(i, `ID ${id} is used by ${rows.length} rows.`);
  }
  return problems;
}

/**
 * Reads one marker from untrusted input (a server action's argument), or null
 * when it isn't shaped like one. Trims text and drops fields the kind can't
 * have; range checks are markerProblem's.
 */
export function parseMarker(raw: unknown): Marker | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = MARKER_KINDS.find((k) => k === r.kind);
  const game = MARKER_GAMES.find((g) => g === r.game);
  if (!kind || !game) return null;
  if (typeof r.markerId !== 'number' || typeof r.name !== 'string') return null;
  const clue = typeof r.clue === 'string' ? r.clue : '';
  const marker: Marker = {
    markerId: r.markerId,
    kind,
    game,
    name: r.name.trim(),
    clue: clue.trim(),
    quantity: typeof r.quantity === 'number' ? r.quantity : null,
    collector: typeof r.collector === 'number' ? r.collector : null,
  };
  return withKind(marker, kind);
}

/** A Competition team's ArUco progress, for the progress table. */
export type TeamProgress = {
  teamId: string;
  /** Null when the team has since been deleted. */
  teamName: string | null;
  /** Marker IDs the team tried, oldest first. */
  scans: { markerId: number; at: string }[];
  collectors: { collector: number; attempts: number; solved: boolean; solvedAt: string | null }[];
};
