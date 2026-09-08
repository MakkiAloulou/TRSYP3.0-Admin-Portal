'use client';

import { buildCompetitionCsv, downloadCsv, competitionCsvFilename } from './export-competition-csv';
import type { ParticipantRow } from '../../participants/participants-table';

export function CompetitionExportButton({ participants }: { participants: ParticipantRow[] }) {
  function handleExport() {
    downloadCsv(buildCompetitionCsv(participants), competitionCsvFilename());
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
