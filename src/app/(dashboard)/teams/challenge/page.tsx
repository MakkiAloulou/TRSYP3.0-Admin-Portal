import { getTeamsByActivity, getParticipantsByActivity } from '../team-data';
import { TeamsGrid } from '../teams-grid';
import { TeamExportButton } from '../team-export-button';

export default async function ChallengeTeamsPage() {
  const teams = await getTeamsByActivity('CHALLENGE');
  const participants = await getParticipantsByActivity('CHALLENGE');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Challenge Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} teams, {participants.length} participants
        </p>
      </div>

      <TeamExportButton activity="CHALLENGE" participants={participants} />

      <TeamsGrid teams={teams} />
    </div>
  );
}
