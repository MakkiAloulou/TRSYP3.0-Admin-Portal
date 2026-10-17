/** The ArUco games and rounds as the admin page shows them. */

/** Word attempts a team gets per round (the backend's MAX_ATTEMPTS). */
export const MAX_ATTEMPTS = 3;
/** Distinct IDs a team may try per round: the backend's default ARUCO_SCAN_LIMIT. */
export const SCAN_LIMIT = 20;

export type MarkerKind = 'letter' | 'hint' | 'collector';

export type GameMarker = {
  markerId: number;
  kind: MarkerKind;
  /** The letter, or the hint's text. */
  content: string;
  hintNumber: number | null;
};

export type Game = {
  number: number;
  name: string;
  word: string;
  markers: GameMarker[];
};

export type CompetitionTeam = { id: string; name: string; members: number };

export type RoundSummary = {
  id: string;
  game: number;
  gameName: string;
  startedAt: string;
  endedAt: string | null;
  teamCount: number;
};

/** One line of a team's timeline, already worded. */
export type TimelineEntry = {
  id: string;
  at: string;
  /** Who did it: a member's name, or null for an organizer's reset. */
  who: string | null;
  action: 'scan' | 'word' | 'reset';
  /** Good (a real marker, a right word), bad (no marker, wrong word) or neutral. */
  tone: 'good' | 'bad' | 'neutral';
  text: string;
};

export type RoundTeam = {
  teamId: string;
  /** Null when the team has since been deleted. */
  teamName: string | null;
  /** Distinct marker IDs tried since the team's last reset. */
  triesUsed: number;
  wordAttempts: number;
  solved: boolean;
  timeline: TimelineEntry[];
};

export type RoundDetail = RoundSummary & { teams: RoundTeam[] };

/** Times are shown as the event runs them, in Tunisia. */
export function formatTime(iso: string, withDate = false): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Tunis',
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    second: withDate ? undefined : '2-digit',
  });
}
