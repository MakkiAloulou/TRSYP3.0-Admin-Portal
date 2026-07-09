import { prisma } from '@/lib/prisma';

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      code: true,
      size: true,
      leaderId: true,
      members: {
        select: {
          id: true,
          user: { select: { name: true, lastName: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Teams</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {teams.length} total
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const emptySlots = Math.max(team.size - team.members.length, 0);

          return (
            <div key={team.id} className="admin-card p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="admin-heading text-sm text-white">{team.name}</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Code: {team.code}
                  </p>
                </div>
                <span className="admin-badge admin-badge--green">
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
                    <span className="text-white/80">
                      {member.user.name} {member.user.lastName}
                    </span>
                    {member.id === team.leaderId && (
                      <span
                        className="text-[10px] font-medium uppercase"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
