import type { FablabAxis } from '@prisma/client';

type TeamMemberSummary = {
  id: string;
  user: { name: string; lastName: string };
};

export type TeamRow = {
  id: string;
  name: string;
  code: string;
  size: number;
  leaderId: string;
  /** FABLAB teams only — null everywhere else. */
  axis: FablabAxis | null;
  submissionUrl: string | null;
  submittedAt: string | null;
  members: TeamMemberSummary[];
};

export const FABLAB_AXES: { value: FablabAxis; label: string }[] = [
  { value: 'SAMPLE_PREPARATION', label: 'Automated Sample Preparation' },
  { value: 'WEIGHING_DOSING', label: 'Automated Weighing & Dosing Station' },
];

/**
 * Renders one activity's teams. The hackathon's axis and concept submission
 * belong to FABLAB teams only, so they're opt-in via `showFablab`.
 */
export function TeamsGrid({ teams, showFablab = false }: { teams: TeamRow[]; showFablab?: boolean }) {
  if (teams.length === 0) {
    return (
      <div className="admin-card px-5 py-10 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
        No teams yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => {
        const emptySlots = Math.max(team.size - team.members.length, 0);

        return (
          <div key={team.id} className="admin-card flex flex-col p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <span className="min-w-0">
                <h3 className="admin-heading truncate text-sm text-white">{team.name}</h3>
                <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Code: {team.code}
                </p>
              </span>

              <span
                className={`admin-badge admin-badge--${team.members.length === team.size ? 'pink' : 'green'} shrink-0`}
              >
                {team.members.length}/{team.size}
              </span>
            </div>

            <div className="space-y-1.5">
              {team.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <span className="truncate text-white/80">
                    {member.user.name} {member.user.lastName}
                  </span>
                  {member.id === team.leaderId && (
                    <span
                      className="ml-2 shrink-0 text-[10px] font-medium uppercase"
                      style={{ color: 'var(--color-green)', letterSpacing: '0.08em' }}
                    >
                      Leader
                    </span>
                  )}
                </div>
              ))}

              {Array.from({ length: emptySlots }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="rounded-md px-3 py-1.5 text-sm"
                  style={{
                    border: '1px dashed rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  Empty spot
                </div>
              ))}
            </div>

            {showFablab && <FablabDetails team={team} />}
          </div>
        );
      })}
    </div>
  );
}

function FablabDetails({ team }: { team: TeamRow }) {
  const axisIndex = FABLAB_AXES.findIndex((a) => a.value === team.axis);

  return (
    <div className="mt-4 space-y-1.5 border-t pt-4 text-xs" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Axis
        </span>
        {axisIndex >= 0 ? (
          <span className="truncate text-white/80" title={FABLAB_AXES[axisIndex].label}>
            {axisIndex + 1} · {FABLAB_AXES[axisIndex].label}
          </span>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>Not chosen</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Submission
        </span>
        {team.submissionUrl ? (
          <a
            href={team.submissionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:underline"
            style={{ color: 'var(--color-green)' }}
            title={team.submissionUrl}
          >
            Drive folder{team.submittedAt ? ` · ${formatSubmitted(team.submittedAt)}` : ''}
          </a>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>Not submitted</span>
        )}
      </div>
    </div>
  );
}

function formatSubmitted(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
