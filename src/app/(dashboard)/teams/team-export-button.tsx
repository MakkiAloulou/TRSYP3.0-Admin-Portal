'use client';

import type { TeamActivity } from '@prisma/client';
import { buildTeamCsv, downloadCsv, teamCsvFilename, type TeamParticipantRow } from './export-team-csv';

/** Sits in the teams toolbar, beside the search. */
export function TeamExportButton({
  activity,
  participants,
}: {
  activity: TeamActivity;
  participants: TeamParticipantRow[];
}) {
  function handleExport() {
    downloadCsv(buildTeamCsv(activity, participants), teamCsvFilename(activity));
  }

  return (
    <button
      type="button"
      className="admin-btn-secondary shrink-0 px-4 py-2 text-sm"
      onClick={handleExport}
      disabled={participants.length === 0}
    >
      Export CSV
    </button>
  );
}
