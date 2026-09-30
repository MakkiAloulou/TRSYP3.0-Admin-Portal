import type { ParticipantRow } from './participants-table';
import { feeFor } from '@/lib/payment';
import { IEEE_CSV_COLUMNS } from './ieee-csv';

/**
 * Flattens a participant into one spreadsheet row. Everything an admin might
 * need to sort, filter or mail-merge on — no ids beyond the room grouping key,
 * which is what lets residents of the same room be grouped in the sheet.
 */
const COLUMNS: { header: string; value: (p: ParticipantRow) => string }[] = [
  { header: 'First name', value: (p) => p.user.name },
  { header: 'Last name', value: (p) => p.user.lastName },
  { header: 'Email', value: (p) => p.user.email },
  { header: 'Phone', value: (p) => p.phone },
  { header: 'Gender', value: (p) => p.gender },
  { header: 'Participant type', value: (p) => p.participantType },
  { header: 'IEEE ID', value: (p) => p.ieeeId?.toString() ?? '' },
  ...IEEE_CSV_COLUMNS,
  { header: 'Student branch', value: (p) => p.sb ?? '' },
  { header: 'Country', value: (p) => p.country },
  { header: 'Fee (TND)', value: (p) => feeFor(p).toString() },
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
  { header: 'Room group', value: (p) => (p.room ? p.room.id.slice(0, 8) : '') },
  { header: 'Room status', value: (p) => p.room?.status ?? '' },
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

export function buildParticipantsCsv(participants: ParticipantRow[]): string {
  const rows = [
    COLUMNS.map((c) => c.header),
    ...participants.map((p) => COLUMNS.map((c) => c.value(p))),
  ];

  // A BOM is what makes Excel read the file as UTF-8 rather than latin-1.
  return '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Triggers a browser download of `csv` as `filename`. */
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function participantsCsvFilename(now = new Date()) {
  return `trsyp-participants-${now.toISOString().slice(0, 10)}.csv`;
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

/**
 * Quotes a cell, and defuses the leading characters spreadsheets treat as the
 * start of a formula — which also stops Excel mangling phone numbers that
 * begin with "+".
 */
function escapeCell(value: string) {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}
