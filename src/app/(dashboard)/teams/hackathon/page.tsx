import type { Metadata } from 'next';
import { getTeamsByActivity, getParticipantsByActivity } from '../team-data';
import { TeamsGrid } from '../teams-grid';
import { FABLAB_AXES } from '../team-types';
import { TeamExportButton } from '../team-export-button';

export const metadata: Metadata = { title: 'Hackathon teams' };

export default async function HackathonTeamsPage() {
  const [teams, participants] = await Promise.all([
    getTeamsByActivity('FABLAB'),
    getParticipantsByActivity('FABLAB'),
  ]);
  const submitted = teams.filter((t) => t.submissionUrl).length;

  // One section per axis, in the axes' own order; teams yet to choose come last.
  const groups = [
    ...FABLAB_AXES.map((axis, i) => ({
      key: axis.value,
      title: `Axis ${i + 1} · ${axis.label}`,
      teams: teams.filter((t) => t.axis === axis.value),
    })),
    { key: 'NONE', title: 'No axis chosen yet', teams: teams.filter((t) => !t.axis) },
  ].filter((group) => group.key !== 'NONE' || group.teams.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="admin-heading text-lg text-white">Hackathon Teams</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {teams.length} teams, {participants.length} participants · {submitted} submitted
          </p>
        </div>
        <TeamExportButton activity="FABLAB" participants={participants} />
      </div>

      {teams.length === 0 ? (
        <TeamsGrid teams={teams} showFablab />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="team-group">
            <h3 className="team-group-title">
              {group.title}
              <span className="team-group-count">{group.teams.length}</span>
            </h3>
            {group.teams.length === 0 ? (
              <p className="team-group-empty">No team has picked this axis yet.</p>
            ) : (
              <TeamsGrid teams={group.teams} showFablab />
            )}
          </section>
        ))
      )}
    </div>
  );
}
