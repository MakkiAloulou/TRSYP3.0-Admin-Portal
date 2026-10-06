import type { TeamActivity } from '@prisma/client';
import type { ParticipantRow } from '../participants/participants-table';
import { FABLAB_AXES } from './team-types';
import { IEEE_CSV_COLUMNS } from '../participants/ieee-csv';

/** A participant as loaded by `getParticipantsByActivity`, whose teams also carry the FABLAB fields. */
export type TeamParticipantRow = Omit<ParticipantRow, 'memberships'> & {
  memberships: (ParticipantRow['memberships'][number] & {
    team: { axis: string | null; submissionUrl: string | null; submittedAt: string | null };
  })[];
};

type Column = { header: string; value: (p: TeamParticipantRow) => string };

const ACTIVITY_LABELS: Record<TeamActivity, string> = {
  COMPETITION: 'Competition',
  CHALLENGE: 'Challenge',
  FABLAB: 'Hackathon',
};

/**
 * Builds a CSV of every participant in one activity's teams, with their team
 * in that activity. Hackathon exports also carry the team's axis and concept
 * submission.
 */
function columnsFor(activity: TeamActivity): Column[] {
  const label = ACTIVITY_LABELS[activity];
  const team = (p: TeamParticipantRow) => p.memberships.find((m) => m.activity === activity)?.team ?? null;

  const fablab: Column[] =
    activity === 'FABLAB'
      ? [
          { header: 'Axis', value: (p) => axisLabel(team(p)?.axis) },
          { header: 'Submission URL', value: (p) => team(p)?.submissionUrl ?? '' },
          { header: 'Submitted at', value: (p) => dateTime(team(p)?.submittedAt) },
        ]
      : [];

  return [
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
    { header: `${label} team`, value: (p) => team(p)?.name ?? '' },
    { header: `${label} team code`, value: (p) => team(p)?.code ?? '' },
    { header: `${label} role`, value: (p) => role(p, team(p)) },
    ...fablab,
    { header: 'Paid', value: (p) => yesNo(p.paid) },
    { header: 'Banned', value: (p) => yesNo(p.banned) },
    { header: 'Account verified', value: (p) => yesNo(p.user.active) },
    { header: 'International', value: (p) => yesNo(p.isInternational) },
    { header: 'Registered at', value: (p) => dateTime(p.user.createdAt) },
  ];
}

export function buildTeamCsv(activity: TeamActivity, participants: TeamParticipantRow[]): string {
  const columns = columnsFor(activity);
  const rows = [columns.map((c) => c.header), ...participants.map((p) => columns.map((c) => c.value(p)))];

  // A BOM is what makes Excel read the file as UTF-8 rather than latin-1.
  return '﻿' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
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

export function teamCsvFilename(activity: TeamActivity, now = new Date()) {
  return `trsyp-${ACTIVITY_LABELS[activity].toLowerCase()}-${now.toISOString().slice(0, 10)}.csv`;
}

/* ── cell helpers ───────────────────────────────────────── */

function role(p: TeamParticipantRow, team: { leaderId: string } | null) {
  if (!team) return '';
  return team.leaderId === p.id ? 'Leader' : 'Member';
}

function axisLabel(axis: string | null | undefined) {
  const index = FABLAB_AXES.findIndex((a) => a.value === axis);
  return index >= 0 ? `${index + 1} - ${FABLAB_AXES[index].label}` : '';
}

function yesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function dateTime(iso: string | null | undefined) {
  if (!iso) return '';
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
