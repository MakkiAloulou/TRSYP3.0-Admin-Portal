/**
 * The ArUco register as the re-ranking editor and its save action both see
 * it. Shared so the editor can flag a bad ID before saving and the action can
 * refuse the same thing from a forged POST.
 */

export const MARKER_KINDS = ['beacon', 'indicator', 'collector'] as const;
export const MARKER_GAMES = ['Garden', 'Mine'] as const;
/** DICT_4X4_50 has IDs 0 to 49. */
export const MAX_MARKER_ID = 49;

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

/** A marker moving from the ID it has now to another one. */
export type Move = { from: number; to: number };

export function isValidId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id <= MAX_MARKER_ID;
}

/**
 * What is wrong with each new ID, by row index: out of range, or taken by
 * another row. Every row is checked, moved or not, since a move can land on
 * an ID a row that stayed put still holds.
 */
export function idProblems(ids: number[]): Map<number, string> {
  const problems = new Map<number, string>();
  const rowsById = new Map<number, number[]>();
  ids.forEach((id, i) => {
    if (!isValidId(id)) problems.set(i, `ID must be a whole number from 0 to ${MAX_MARKER_ID}.`);
    else rowsById.set(id, [...(rowsById.get(id) ?? []), i]);
  });
  for (const [id, rows] of rowsById) {
    if (rows.length < 2) continue;
    for (const i of rows) problems.set(i, `ID ${id} is given to ${rows.length} markers.`);
  }
  return problems;
}

/**
 * Reads one aruco_markers row as a Marker, or null when it isn't shaped like
 * one. The table's CHECK constraints keep rows well formed; this narrows types.
 */
export function parseMarker(raw: {
  markerId: number;
  kind: string;
  game: string;
  name: string;
  clue: string;
  quantity: number | null;
  collector: number | null;
}): Marker | null {
  const kind = MARKER_KINDS.find((k) => k === raw.kind);
  const game = MARKER_GAMES.find((g) => g === raw.game);
  if (!kind || !game) return null;
  return {
    markerId: raw.markerId,
    kind,
    game,
    name: raw.name,
    clue: raw.clue,
    quantity: raw.quantity,
    collector: raw.collector,
  };
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
