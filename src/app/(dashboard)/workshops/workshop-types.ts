// Kept apart from workshop-data.ts, which is server-only: the page's tabs run
// in the browser and read these shapes and helpers too.

export type Workshop = {
  id: string;
  title: string;
  speaker: string | null;
  room: string;
  /** Workshops in one session run in parallel: one seat per session each. */
  session: number;
  /** 'HH:MM', Tunis time, on the event's last day. */
  startTime: string;
  endTime: string;
  capacity: number;
  /** Who it is meant for, e.g. "For RAS chairs". Shown, never enforced. */
  audience: string | null;
  booked: number;
};

export type WorkshopSeat = {
  workshopId: string;
  session: number;
  /** ISO 8601, UTC. */
  bookedAt: string;
};

/** A participant who can take a workshop, or who already holds a seat. */
export type WorkshopPerson = {
  id: string;
  name: string;
  lastName: string;
  email: string;
  phone: string;
  sb: string | null;
  isRas: boolean;
  /** Not banned, and paid or given a workshop payment waiver: the website's
   *  rule for who may book. */
  eligible: boolean;
  /** Why they may not hold a seat, when they may not. */
  blocked: 'Banned' | 'Not paid' | null;
  /** Their selected technical challenge team, if any. */
  challengeTeam: string | null;
  seats: WorkshopSeat[];
};

/**
 * A selected technical challenge team. At least one member must be in a
 * workshop, in either session, or the team's branch loses points. The
 * website reports this; it does not enforce it.
 */
export type ChallengeTeam = {
  id: string;
  name: string;
  code: string;
  members: {
    id: string;
    name: string;
    lastName: string;
    sb: string | null;
    eligible: boolean;
    inWorkshop: boolean;
  }[];
};

export type WorkshopsData = {
  workshops: Workshop[];
  people: WorkshopPerson[];
  teams: ChallengeTeam[];
};

/** The page's tabs, in order. */
export const WORKSHOP_TABS = [
  { value: 'workshops', label: 'Workshops' },
  { value: 'unseated', label: 'No seat yet' },
  { value: 'teams', label: 'Challenge teams' },
] as const;

export type WorkshopsTab = (typeof WORKSHOP_TABS)[number]['value'];

/** Reads the tab from the URL; anything unrecognised opens the first. */
export function parseWorkshopsTab(value: string | null | undefined): WorkshopsTab {
  return WORKSHOP_TABS.find((t) => t.value === value)?.value ?? 'workshops';
}

export type AssignResult = { ok: true } | { ok: false; message: string };

/** The sessions the workshops run in, in order. */
export function sessionsOf(workshops: Workshop[]) {
  return [...new Set(workshops.map((w) => w.session))].sort((a, b) => a - b);
}

/** "09:00–10:00", from the earliest start to the latest end in the session. */
export function sessionTime(workshops: Workshop[], session: number) {
  const inSession = workshops.filter((w) => w.session === session);
  if (inSession.length === 0) return '';
  const start = inSession.map((w) => w.startTime).sort()[0];
  const end = inSession.map((w) => w.endTime).sort().at(-1);
  return `${start}–${end}`;
}

export function seatsLeft(workshop: Workshop) {
  return Math.max(0, workshop.capacity - workshop.booked);
}

export function seatIn(person: WorkshopPerson, session: number) {
  return person.seats.find((s) => s.session === session) ?? null;
}

export function personName(p: { name: string; lastName: string }) {
  return `${p.name} ${p.lastName}`.trim();
}

const bookedAtFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tunis',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "16 Oct, 14:05", Tunis time. */
export function formatBookedAt(iso: string) {
  return bookedAtFormat.format(new Date(iso));
}
