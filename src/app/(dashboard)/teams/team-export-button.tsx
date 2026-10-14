'use client';

import type { TeamActivity } from '@prisma/client';
import { downloadXlsx } from '@/lib/xlsx';
import { buildTeamXlsx, teamXlsxFilename, type TeamParticipantRow } from './export-team';

/** Sits in the teams toolbar, beside the search. */
export function TeamExportButton({
  activity,
  participants,
}: {
  activity: TeamActivity;
  participants: TeamParticipantRow[];
}) {
  async function handleExport() {
    downloadXlsx(await buildTeamXlsx(activity, participants), teamXlsxFilename(activity));
  }

  return (
    <button
      type="button"
      className="admin-btn-secondary shrink-0 px-4 py-2 text-sm"
      onClick={handleExport}
      disabled={participants.length === 0}
    >
      Export Excel
    </button>
  );
}
