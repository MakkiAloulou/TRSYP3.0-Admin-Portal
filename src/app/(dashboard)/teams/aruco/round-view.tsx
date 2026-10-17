import Link from 'next/link';
import { MAX_ATTEMPTS, SCAN_LIMIT, formatTime, type RoundDetail, type RoundSummary } from './aruco-types';
import { ResetTeamButton } from './games-panel';

/** The rounds played so far, newest first, each a link to its timelines. */
export function RoundPicker({ rounds, selected }: { rounds: RoundSummary[]; selected: string | null }) {
  if (rounds.length === 0) return null;
  return (
    <nav className="aruco-rounds" aria-label="Rounds">
      {rounds.map((round) => (
        <Link
          key={round.id}
          href={`/teams/aruco?round=${round.id}`}
          className="aruco-round"
          data-active={round.id === selected ? '' : undefined}
          aria-current={round.id === selected ? 'page' : undefined}
        >
          <span className="font-medium">
            Game {round.game} · {round.gameName}
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {round.endedAt ? formatTime(round.startedAt, true) : 'Live now'} · {round.teamCount} team
            {round.teamCount === 1 ? '' : 's'}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** One round, team by team: every scan and word, in order, with who did it. */
export function RoundView({ round }: { round: RoundDetail }) {
  const live = round.endedAt === null;
  return (
    <section className="admin-card" aria-labelledby="aruco-round-title">
      <div className="p-4 sm:px-5">
        <h3 id="aruco-round-title" className="admin-heading text-sm text-white">
          Game {round.game} · {round.gameName} {live ? '(live)' : ''}
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Started {formatTime(round.startedAt, true)}
          {round.endedAt && `, ended ${formatTime(round.endedAt, true)}`}. Every scan and word, in order. Times are
          Tunis time.
        </p>
      </div>

      {round.teams.map((team) => (
        <div key={team.teamId} className="aruco-team" aria-label={team.teamName ?? 'Deleted team'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {team.teamName ?? <span style={{ color: 'rgba(255,255,255,0.45)' }}>Deleted team</span>}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="admin-badge admin-badge--gray">
                  {team.triesUsed}/{SCAN_LIMIT} IDs tried
                </span>
                <span className={`admin-badge ${team.solved ? 'admin-badge--green' : team.wordAttempts >= MAX_ATTEMPTS ? 'admin-badge--red' : 'admin-badge--gray'}`}>
                  {team.solved
                    ? 'Word found'
                    : team.wordAttempts >= MAX_ATTEMPTS
                      ? 'Out of word attempts'
                      : `${team.wordAttempts}/${MAX_ATTEMPTS} word attempts`}
                </span>
              </div>
            </div>
            {live && <ResetTeamButton roundId={round.id} teamId={team.teamId} />}
          </div>

          {team.timeline.length === 0 ? (
            <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Nothing yet.
            </p>
          ) : (
            <ol className="aruco-timeline">
              {team.timeline.map((entry) => (
                <li key={entry.id} className="aruco-event" data-tone={entry.tone} data-action={entry.action}>
                  <time className="aruco-event-time" dateTime={entry.at}>
                    {formatTime(entry.at)}
                  </time>
                  <span className="aruco-event-text">{entry.text}</span>
                  <span className="aruco-event-who">{entry.who ?? 'Organizer'}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}
