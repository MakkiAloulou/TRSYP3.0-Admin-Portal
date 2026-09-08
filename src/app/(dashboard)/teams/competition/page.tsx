import { getTeamsByActivity, getParticipantsByActivity } from '../team-data';
import { TeamsGrid } from '../teams-grid';
import { CompetitionExportButton } from './competition-export-button';

export default async function CompetitionTeamsPage() {
  const teams = await getTeamsByActivity('COMPETITION');
  const participants = await getParticipantsByActivity('COMPETITION');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Competition Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} teams, {participants.length} participants
        </p>
      </div>

      <CompetitionExportButton participants={participants} />

      <TeamsGrid teams={teams} />
    </div>
  );
}
