import { getRiddleCodes, getTeamsByActivity } from '../team-data';
import { TeamsGrid } from '../teams-grid';

export default async function ChallengeTeamsPage() {
  const teams = await getTeamsByActivity('CHALLENGE');
  const existingCodes = await getRiddleCodes(teams.map((t) => t.id));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Challenge Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} total
        </p>
      </div>

      <TeamsGrid teams={teams} existingCodes={existingCodes} showRiddleCodes />
    </div>
  );
}
