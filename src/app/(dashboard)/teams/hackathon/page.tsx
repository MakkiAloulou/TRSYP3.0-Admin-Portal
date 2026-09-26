import { getTeamsByActivity } from '../team-data';
import { FABLAB_AXES, TeamsGrid } from '../teams-grid';

export default async function HackathonTeamsPage() {
  const teams = await getTeamsByActivity('FABLAB');
  const submitted = teams.filter((t) => t.submissionUrl).length;
  const noAxis = teams.filter((t) => !t.axis).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Hackathon Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} total · {submitted} submitted
        </p>
      </div>

      {teams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {FABLAB_AXES.map((axis, i) => (
            <span key={axis.value} className="admin-badge admin-badge--gray">
              Axis {i + 1} · {axis.label}: {teams.filter((t) => t.axis === axis.value).length}
            </span>
          ))}
          {noAxis > 0 && <span className="admin-badge admin-badge--gray">No axis: {noAxis}</span>}
        </div>
      )}

      <TeamsGrid teams={teams} showFablab />
    </div>
  );
}
