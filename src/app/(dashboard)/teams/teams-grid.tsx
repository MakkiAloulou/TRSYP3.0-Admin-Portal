import { PAYMENT_STATE_COLORS, PAYMENT_STATE_LABELS } from '@/lib/payment';
import { PaymentIcon } from '../payment-icon';
import { Suspense } from 'react';
import { Skeleton } from '../loading-skeletons';
import { withPayments } from './team-data';
import type { TeamRow } from './team-types';

/**
 * The grid straight from the database, then again with every member's payment
 * once the payments service answers — so a slow backend never holds up the
 * cards, only the icons it alone knows.
 */
export function StreamedTeamsGrid({ teams, showFablab = false }: { teams: TeamRow[]; showFablab?: boolean }) {
  return (
    <Suspense fallback={<TeamsGrid teams={teams} showFablab={showFablab} />}>
      <TeamsWithPayments teams={teams} showFablab={showFablab} />
    </Suspense>
  );
}

async function TeamsWithPayments({ teams, showFablab }: { teams: TeamRow[]; showFablab: boolean }) {
  return <TeamsGrid teams={await withPayments(teams)} showFablab={showFablab} />;
}

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
      {teams.map((team) => (
        <TeamCard key={team.id} team={team} showFablab={showFablab} />
      ))}
    </div>
  );
}

function TeamCard({ team, showFablab }: { team: TeamRow; showFablab: boolean }) {
  const emptySlots = Math.max(team.size - team.members.length, 0);
  const full = team.members.length >= team.size;
  const paid = team.members.filter((m) => m.payment === 'PAID').length;
  const allPaid = team.members.length > 0 && paid === team.members.length;

  return (
    <div className="admin-card flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="min-w-0">
          <h3 className="admin-heading truncate text-sm text-white" title={team.name}>
            {team.name}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Code: {team.code} ·{' '}
            <span style={allPaid ? { color: 'var(--color-green)' } : undefined}>
              {paid}/{team.members.length} paid
            </span>
          </p>
        </span>

        {/* Full is the goal, so it reads green; a team still filling is neutral. */}
        <span
          className={`admin-badge admin-badge--${full ? 'green' : 'gray'} shrink-0`}
          title={full ? 'Team is full' : `${emptySlots} spot${emptySlots === 1 ? '' : 's'} left`}
        >
          {team.members.length}/{team.size}
        </span>
      </div>

      <div className="space-y-1.5">
        {team.members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {member.payment ? (
              <span
                className="pay-mark pay-mark--sm shrink-0"
                style={{ '--pay-mark': PAYMENT_STATE_COLORS[member.payment] } as React.CSSProperties}
                title={PAYMENT_STATE_LABELS[member.payment]}
                role="img"
                aria-label={PAYMENT_STATE_LABELS[member.payment]}
              >
                <PaymentIcon state={member.payment} size={12} />
              </span>
            ) : (
              // Their proof's status is still on its way from the payments service.
              <Skeleton className="shrink-0" style={{ width: 22, height: 22, borderRadius: '50%' }} />
            )}
            <span className="min-w-0 flex-1 truncate text-white/80">
              {member.user.name} {member.user.lastName}
            </span>
            {member.id === team.leaderId && (
              <span
                className="shrink-0 text-[10px] font-medium uppercase"
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
            className="rounded-md py-1.5 pr-2 pl-10 text-sm"
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
}

/** The concept submission. The axis isn't repeated here: the hackathon page
 *  already groups teams under their axis. */
function FablabDetails({ team }: { team: TeamRow }) {
  return (
    <div className="mt-4 border-t pt-4 text-xs" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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
