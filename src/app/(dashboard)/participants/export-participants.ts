import type { ParticipantRow } from './participants-table';
import { feeFor } from '@/lib/payment';
import { buildXlsx, tabulate, type XlsxColumn } from '@/lib/xlsx';
import { IEEE_COLUMNS } from './ieee-columns';

/**
 * Flattens a participant into one spreadsheet row. Everything an admin might
 * need to sort, filter or mail-merge on — no ids. The room code is what lets
 * roommates be grouped in the sheet.
 */
const COLUMNS: XlsxColumn<ParticipantRow>[] = [
  { header: 'First name', value: (p) => p.user.name },
  { header: 'Last name', value: (p) => p.user.lastName },
  { header: 'Email', value: (p) => p.user.email },
  { header: 'Phone', value: (p) => p.phone },
  { header: 'Gender', value: (p) => p.gender },
  { header: 'Participant type', value: (p) => p.participantType },
  { header: 'IEEE ID', value: (p) => p.ieeeId?.toString() ?? '' },
  ...IEEE_COLUMNS,
  { header: 'Student branch', value: (p) => p.sb ?? '' },
  { header: 'Country', value: (p) => p.country },
  { header: 'Fee (TND)', value: (p) => feeFor(p) },
  { header: 'Paid', value: (p) => yesNo(p.paid) },
  { header: 'Banned', value: (p) => yesNo(p.banned) },
  { header: 'Account verified', value: (p) => yesNo(p.user.active) },
  { header: 'International', value: (p) => yesNo(p.isInternational) },
  { header: 'Competition team', value: (p) => team(p, 'COMPETITION')?.name ?? '' },
  { header: 'Competition team code', value: (p) => team(p, 'COMPETITION')?.code ?? '' },
  { header: 'Competition role', value: (p) => role(p, 'COMPETITION') },
  { header: 'Challenge team', value: (p) => team(p, 'CHALLENGE')?.name ?? '' },
  { header: 'Challenge team code', value: (p) => team(p, 'CHALLENGE')?.code ?? '' },
  { header: 'Challenge role', value: (p) => role(p, 'CHALLENGE') },
  { header: 'Hackathon team', value: (p) => team(p, 'FABLAB')?.name ?? '' },
  { header: 'Hackathon team code', value: (p) => team(p, 'FABLAB')?.code ?? '' },
  { header: 'Hackathon role', value: (p) => role(p, 'FABLAB') },
  { header: 'Room code', value: (p) => p.room?.code ?? '' },
  { header: 'Registered at', value: (p) => dateTime(p.user.createdAt) },
  { header: 'Date of birth', value: (p) => date(p.internationalInfo?.dateOfBirth) },
  { header: 'City of residence', value: (p) => p.internationalInfo?.cityOfResidence ?? '' },
  { header: 'Country of residence', value: (p) => p.internationalInfo?.countryOfResidence ?? '' },
  { header: 'Affiliation', value: (p) => p.internationalInfo?.affiliation ?? '' },
  { header: 'Expected arrival', value: (p) => date(p.internationalInfo?.expectedArrivalDate) },
  { header: 'Expected departure', value: (p) => date(p.internationalInfo?.expectedDepartureDate) },
  {
    header: 'Requires visa letter',
    value: (p) => (p.internationalInfo ? yesNo(p.internationalInfo.requiresVisaLetter) : ''),
  },
  { header: 'Visa status', value: (p) => p.internationalInfo?.visaApplication?.status ?? '' },
];

export function buildParticipantsXlsx(participants: ParticipantRow[]) {
  const { header, rows } = tabulate(COLUMNS, participants);
  return buildXlsx(rows, { sheet: 'Participants', header });
}

export function participantsXlsxFilename(now = new Date()) {
  return `trsyp-participants-${now.toISOString().slice(0, 10)}.xlsx`;
}

/* ── cell helpers ───────────────────────────────────────── */

function team(p: ParticipantRow, activity: 'COMPETITION' | 'CHALLENGE' | 'FABLAB') {
  return p.memberships.find((m) => m.activity === activity)?.team ?? null;
}

function role(p: ParticipantRow, activity: 'COMPETITION' | 'CHALLENGE' | 'FABLAB') {
  const found = team(p, activity);
  if (!found) return '';
  return found.leaderId === p.id ? 'Leader' : 'Member';
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function date(iso?: string) {
  return iso ? iso.slice(0, 10) : '';
}

function dateTime(iso: string) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
