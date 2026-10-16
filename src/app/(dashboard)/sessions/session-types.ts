// Kept apart from session-data.ts, which is server-only: the detail page's
// tabs run in the browser and read these shapes and helpers too.

export type SessionStatus = 'Scheduled' | 'Open' | 'Closed';
export type SessionAudience = 'Everyone' | 'Assigned';

/** How many people a session holds to account, and how it went. */
export type SessionCounts = {
  /** On the roster: every paid, unbanned participant for an Everyone
   *  session; the listed and team-linked ones for an Assigned session. */
  expected: number;
  /** Expected, but on the roster of a technical challenge at the same time. */
  excused: number;
  /** Expected and not excused: who is charged as absent if never scanned. */
  mustAttend: number;
  /** Everyone with at least one scan, expected or not. */
  checkedIn: number;
  /** Must attend, and did. What the attendance rate is made of. */
  attended: number;
  /** Their latest interval is still open. */
  inside: number;
  /** Must attend, and never scanned. */
  notCheckedIn: number;
  /** Scanned, but not on the roster. */
  walkIns: number;
};

export type SessionRow = SessionCounts & {
  id: string;
  title: string;
  location: string | null;
  /** ISO 8601 in UTC, as are all the times below. */
  startsAt: string;
  endsAt: string;
  openedAt: string | null;
  startedAt: string | null;
  status: SessionStatus;
  audience: SessionAudience;
  mandatory: boolean;
  challenge: boolean;
  /** FABLAB, COMPETITION or CHALLENGE when the roster is a website activity's
   *  selected teams. */
  teamActivity: string | null;
  /** Whether an Assigned session has a roster yet. Until it does, nobody can
   *  be told apart as a walk-in. Always true for an Everyone session. */
  hasRoster: boolean;
  /** Officers who scanned here, most scans first. */
  officers: string[];
};

/** One person a session concerns: expected, scanned, or both. */
export type SessionPerson = {
  participantId: string;
  /** Null when a scan names a participant that no longer exists. */
  name: string | null;
  lastName: string | null;
  email: string | null;
  sb: string | null;
  paid: boolean;
  banned: boolean;
  /** Their team for the session's activity, on team-linked sessions. */
  team: string | null;
  expected: boolean;
  excused: boolean;
  checkedIn: boolean;
  inside: boolean;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  /** How many times they were scanned out. */
  exits: number;
  /** The officer who recorded their first check-in. */
  checkedInBy: string | null;
};

export type SessionOfficer = {
  id: string;
  /** Null when scans name an account that has since been deleted. */
  displayName: string | null;
  username: string | null;
  role: string | null;
  active: boolean;
  /** Assigned to this session in the check-in app. Managers never are: they
   *  can scan anywhere. */
  assigned: boolean;
  checkIns: number;
  checkOuts: number;
  firstScan: string | null;
  lastScan: string | null;
};

export type SessionPenalty = {
  id: string;
  participantId: string;
  name: string | null;
  lastName: string | null;
  sb: string | null;
  reason: PenaltyReason;
  /** Minutes out (OverBreak, LeftEarly) or late (Late); 0 for Absent. */
  minutes: number;
  points: number;
  createdAt: string;
};

export type PenaltyReason = 'OverBreak' | 'LeftEarly' | 'Absent' | 'Late';

export const PENALTY_LABELS: Record<PenaltyReason, string> = {
  OverBreak: 'Break too long',
  LeftEarly: 'Left early',
  Absent: 'Absent',
  Late: 'Late',
};

export type SessionDetail = {
  session: SessionRow;
  people: SessionPerson[];
  officers: SessionOfficer[];
  /** Scans recorded before officers had accounts, so nobody is named. */
  unattributedScans: number;
  penalties: SessionPenalty[];
};

/** The lists on a session's page, in the order its tabs show them. */
export const SESSION_TABS = [
  { value: 'checked-in', label: 'Checked in' },
  { value: 'missing', label: 'Not checked in' },
  { value: 'excused', label: 'Excused' },
  { value: 'walk-ins', label: 'Not on the list' },
  { value: 'officers', label: 'Officers' },
  { value: 'penalties', label: 'Penalties' },
] as const;

export type SessionTab = (typeof SESSION_TABS)[number]['value'];

/** Reads the tab from the URL; anything unrecognised opens the first. */
export function parseTab(value: string | null | undefined): SessionTab {
  return SESSION_TABS.find((t) => t.value === value)?.value ?? 'checked-in';
}

export const STATUS_BADGE: Record<SessionStatus, string> = {
  Open: 'admin-badge--green',
  Scheduled: 'admin-badge--gray',
  Closed: 'admin-badge--violet',
};

export const TEAM_ACTIVITY_LABELS: Record<string, string> = {
  FABLAB: 'Hackathon teams',
  COMPETITION: 'Competition teams',
  CHALLENGE: 'Challenge teams',
};

/** The share of those who had to come who did, or null when nobody had to. */
export function attendanceRate({ attended, mustAttend }: Pick<SessionCounts, 'attended' | 'mustAttend'>) {
  return mustAttend > 0 ? attended / mustAttend : null;
}

export function formatRate(rate: number | null) {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function fullName(p: { name: string | null; lastName: string | null }) {
  return p.name || p.lastName ? `${p.name ?? ''} ${p.lastName ?? ''}`.trim() : 'Unknown participant';
}

/** Why someone who was scanned here is not on the roster. */
export function walkInReason(person: SessionPerson, session: Pick<SessionRow, 'audience' | 'hasRoster'>) {
  if (person.name === null && person.email === null) return 'Not a participant';
  if (person.banned) return 'Banned';
  if (!person.paid) return 'Not paid';
  if (session.audience === 'Assigned' && !session.hasRoster) return 'No roster loaded yet';
  return 'Not on the roster';
}

/* ── times ─────────────────────────────────────────────
   The check-in app stores UTC; the congress runs on Tunis time, whatever the
   admin's own clock says. */

export const EVENT_TIME_ZONE = 'Africa/Tunis';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: EVENT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: EVENT_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const shortDayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: EVENT_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "14:05" */
export function formatTime(iso: string | null) {
  return iso ? timeFormat.format(new Date(iso)) : '—';
}

/** "Saturday 17 October" */
export function formatDay(iso: string) {
  return dayFormat.format(new Date(iso));
}

/** "Sat 17 Oct, 14:05" */
export function formatDayTime(iso: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${shortDayFormat.format(date)}, ${timeFormat.format(date)}`;
}

/** "14:00–15:30" */
export function formatRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)}–${formatTime(endsAt)}`;
}

/** Groups by Tunis calendar day, so a 00:30 session is not filed the day before. */
export function dayKey(iso: string) {
  return localDateTime(iso).slice(0, 10);
}

/** "2026-10-17 14:05" in Tunis time: sortable, and read as a date by spreadsheets. */
export function localDateTime(iso: string | null) {
  if (!iso) return '';
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
