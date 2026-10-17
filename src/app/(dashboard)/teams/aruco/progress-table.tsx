'use client';

import { useState, useTransition } from 'react';
import { resetProgress } from './actions';
import type { Marker, TeamProgress } from './aruco-types';

/**
 * What each Competition team has done on /aruco: the marker IDs it tried
 * (named by the register as it stands now) and its collector attempts. The
 * words typed are never stored, so only the counts show.
 */
export function ProgressTable({ teams, markers }: { teams: TeamProgress[]; markers: Marker[] }) {
  const byId = new Map(markers.map((m) => [m.markerId, m]));
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="admin-card" aria-labelledby="aruco-progress-title">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5">
        <div>
          <h3 id="aruco-progress-title" className="admin-heading text-sm text-white">
            Team progress
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {teams.length === 0
              ? 'No team has scanned a marker or tried a collector yet.'
              : `${teams.length} team${teams.length === 1 ? '' : 's'} with progress. Typed words aren’t stored, only attempts.`}
          </p>
        </div>
        {teams.length > 0 && <ResetButton teamId={null} label="Reset all teams" onError={setError} />}
      </div>

      {error && <p className="pay-error px-4 pb-3 sm:px-5">{error}</p>}

      {teams.map((team) => (
        <div
          key={team.teamId}
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-white">
              {team.teamName ?? <span style={{ color: 'rgba(255,255,255,0.45)' }}>Deleted team</span>}
            </p>

            <div className="flex flex-wrap gap-1.5" aria-label="Marker IDs tried">
              {team.scans.length === 0 && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>No marker tried</span>}
              {team.scans.map((scan) => {
                const marker = byId.get(scan.markerId);
                return (
                  <span
                    key={scan.markerId}
                    className={`aruco-chip${marker ? '' : ' aruco-chip--miss'}`}
                    title={`Tried ${formatWhen(scan.at)}`}
                  >
                    <span className="aruco-chip-id">#{scan.markerId}</span>
                    {marker ? describe(marker) : 'no marker'}
                  </span>
                );
              })}
            </div>

            {team.collectors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {team.collectors.map((c) => (
                  <span
                    key={c.collector}
                    className={`admin-badge ${c.solved ? 'admin-badge--green' : 'admin-badge--gray'}`}
                    title={c.solvedAt ? `Solved ${formatWhen(c.solvedAt)}` : undefined}
                  >
                    Collector {c.collector}: {c.solved ? 'solved' : 'not solved'} · {c.attempts} attempt
                    {c.attempts === 1 ? '' : 's'}
                  </span>
                ))}
              </div>
            )}
          </div>

          <ResetButton teamId={team.teamId} label="Reset" onError={setError} />
        </div>
      ))}
    </section>
  );
}

/**
 * Two presses: the first arms it, the second wipes. Reset can't be undone,
 * and a stray click on a list of teams is easy.
 */
function ResetButton({
  teamId,
  label,
  onError,
}: {
  teamId: string | null;
  label: string;
  onError: (message: string | null) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  function press() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await resetProgress(teamId);
      setArmed(false);
      onError(result.ok ? null : result.message);
    });
  }

  return (
    <button
      type="button"
      className="admin-btn-secondary shrink-0 self-start px-3 py-1.5 text-xs"
      style={armed ? { color: 'var(--color-pink)', borderColor: 'rgba(255,29,120,0.4)' } : undefined}
      onClick={press}
      onBlur={() => setArmed(false)}
      disabled={pending}
    >
      {pending ? 'Resetting…' : armed ? 'Press again to wipe' : label}
    </button>
  );
}

function describe(marker: Marker): string {
  if (marker.kind === 'collector') return `Collector ${marker.collector}`;
  if (marker.kind === 'beacon' && marker.clue) return `“${marker.clue}”`;
  return marker.name;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
