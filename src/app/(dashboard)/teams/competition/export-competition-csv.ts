import type { ParticipantRow } from '../../participants/participants-table';

/**
 * Builds a CSV for competition participants with their team information.
 * Includes all participants registered in competition teams.
 */
const COMPETITION_COLUMNS: { header: string; value: (p: ParticipantRow) => string }[] = [
  { header: 'First name', value: (p) => p.user.name },
  { header: 'Last name', value: (p) => p.user.lastName },
  { header: 'Email', value: (p) => p.user.email },
  { header: 'Phone', value: (p) => p.phone },
  { header: 'Gender', value: (p) => p.gender },
  { header: 'Participant type', value: (p) => p.participantType },
  { header: 'IEEE ID', value: (p) => p.ieeeId?.toString() ?? '' },
  { header: 'Student branch', value: (p) => p.sb ?? '' },
  { header: 'Country', value: (p) => p.country },
  { header: 'Competition team', value: (p) => team(p)?.name ?? '' },
  { header: 'Competition team code', value: (p) => team(p)?.code ?? '' },
  { header: 'Competition role', value: (p) => role(p) },
  { header: 'Paid', value: (p) => yesNo(p.paid) },
  { header: 'Banned', value: (p) => yesNo(p.banned) },
  { header: 'Account verified', value: (p) => yesNo(p.user.active) },
  { header: 'International', value: (p) => yesNo(p.isInternational) },
  { header: 'Registered at', value: (p) => dateTime(p.user.createdAt) },
];

export function buildCompetitionCsv(participants: ParticipantRow[]): string {
  const rows = [
    COMPETITION_COLUMNS.map((c) => c.header),
    ...participants.map((p) => COMPETITION_COLUMNS.map((c) => c.value(p))),
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

export function competitionCsvFilename(now = new Date()) {
  return `trsyp-competition-${now.toISOString().slice(0, 10)}.csv`;
}

/* ── cell helpers ───────────────────────────────────────── */

function team(p: ParticipantRow) {
  return p.memberships.find((m) => m.activity === 'COMPETITION')?.team ?? null;
}

function role(p: ParticipantRow) {
  const found = team(p);
  if (!found) return '';
  return found.leaderId === p.id ? 'Leader' : 'Member';
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
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
  if (value === '' || value === 'undefined') {
    return '';
  }

  if (value[0] === '=' || value[0] === '+' || value[0] === '-' || value[0] === '@') {
    return `"${value.replace(/"/g, '""')}"`;
  }

  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
