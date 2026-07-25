import { getTeamsByActivity } from '../team-data';
import { TeamsGrid } from '../teams-grid';

export default async function CompetitionTeamsPage() {
  const teams = await getTeamsByActivity('COMPETITION');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Competition Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} total
        </p>
      </div>

      <TeamsGrid teams={teams} />
    </div>
  );
}
