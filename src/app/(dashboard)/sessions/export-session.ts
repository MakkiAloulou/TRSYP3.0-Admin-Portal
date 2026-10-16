import { buildXlsx, tabulate, type XlsxColumn } from '@/lib/xlsx';
import {
  SESSION_TABS,
  localDateTime,
  walkInReason,
  type SessionPerson,
  type SessionRow,
  type SessionTab,
} from './session-types';

type Column = XlsxColumn<SessionPerson>;

const NAME: Column[] = [
  { header: 'First name', value: (p) => p.name ?? '' },
  { header: 'Last name', value: (p) => p.lastName ?? '' },
  { header: 'Email', value: (p) => p.email ?? '' },
  { header: 'Student branch', value: (p) => p.sb ?? '' },
];

const TEAM: Column = { header: 'Team', value: (p) => p.team ?? '' };

/** Scan times in Tunis time, as the page shows them. Exits is a number so the
 *  column can be summed. */
const SCANS: Column[] = [
  { header: 'First check-in', value: (p) => localDateTime(p.firstCheckIn) },
  { header: 'Last check-out', value: (p) => localDateTime(p.lastCheckOut) },
  { header: 'State', value: (p) => (p.inside ? 'Inside' : 'Out') },
  { header: 'Exits', value: (p) => p.exits },
  { header: 'Checked in by', value: (p) => p.checkedInBy ?? '' },
];

/**
 * The columns for a list: who they are, then what the list is about. The
 * team only on sessions whose list comes from website teams.
 */
function columnsFor(tab: SessionTab, session: SessionRow): Column[] {
  const who = session.teamActivity ? [...NAME, TEAM] : NAME;
  switch (tab) {
    case 'checked-in':
      return [...who, ...SCANS, { header: 'On the list', value: (p) => (p.expected ? 'Yes' : 'No') }];
    case 'walk-ins':
      return [...who, { header: 'Why not on the list', value: (p) => walkInReason(p, session) }, ...SCANS];
    case 'excused':
      return [...who, { header: 'Came anyway', value: (p) => (p.checkedIn ? 'Yes' : 'No') }];
    default:
      return who;
  }
}

export function buildSessionXlsx(people: SessionPerson[], tab: SessionTab, session: SessionRow) {
  const { header, rows } = tabulate(columnsFor(tab, session), people);
  // Excel caps sheet names at 31 characters.
  const sheet = SESSION_TABS.find((t) => t.value === tab)?.label ?? 'Session';
  return buildXlsx(rows, { sheet: sheet.slice(0, 31), header });
}

/** Names the session and the list, so two exports from one day are told apart. */
export function sessionXlsxFilename(session: SessionRow, tab: SessionTab, now = new Date()) {
  const slug = session.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `trsyp-${slug || 'session'}-${tab}-${localDateTime(now.toISOString()).slice(0, 10)}.xlsx`;
}
