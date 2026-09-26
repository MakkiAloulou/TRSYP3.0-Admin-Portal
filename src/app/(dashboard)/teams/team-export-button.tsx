'use client';

import type { TeamActivity } from '@prisma/client';
import { buildTeamCsv, downloadCsv, teamCsvFilename, type TeamParticipantRow } from './export-team-csv';

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
    <div className="flex justify-end">
      <button
        type="button"
        className="admin-btn-secondary px-4 py-2 text-sm"
        onClick={handleExport}
        disabled={participants.length === 0}
      >
        Export CSV
      </button>
    </div>
  );
}
