'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetTeam, startRound, stopRound } from './actions';
import type { CompetitionTeam, Game, RoundSummary } from './aruco-types';

/**
 * The three games: what every marker gives in each, and the button that
 * starts one for chosen teams. Only one game is live at a time; starting one
 * ends the other and wipes every team's progress.
 */
export function GamesPanel({
  games,
  teams,
  live,
}: {
  games: Game[];
  teams: CompetitionTeam[];
  live: RoundSummary | null;
}) {
  const [picking, setPicking] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {games.map((game) => (
        <GameCard
          key={game.number}
          game={game}
          teams={teams}
          live={live}
          picking={picking === game.number}
          onPick={(open) => setPicking(open ? game.number : null)}
        />
      ))}
    </div>
  );
}

function GameCard({
  game,
  teams,
  live,
  picking,
  onPick,
}: {
  game: Game;
  teams: CompetitionTeam[];
  live: RoundSummary | null;
  picking: boolean;
  onPick: (open: boolean) => void;
}) {
  const isLive = live?.game === game.number;
  const letters = game.markers.filter((m) => m.kind === 'letter').sort((a, b) => a.markerId - b.markerId);
  const hints = game.markers.filter((m) => m.kind === 'hint');
  const collectors = game.markers.filter((m) => m.kind === 'collector');

  return (
    <section className="admin-card flex flex-col gap-4 p-5" data-live={isLive ? '' : undefined} aria-labelledby={`aruco-game-${game.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`aruco-game-${game.number}`} className="admin-heading text-sm text-white">
            Game {game.number} · {game.name}
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Word: <span className="aruco-word">{game.word}</span>
          </p>
        </div>
        {isLive && <span className="admin-badge admin-badge--green">Live</span>}
      </div>

      <div>
        <p className="aruco-label">Red beacons</p>
        <ul className="aruco-letters">
          {letters.map((m) => (
            <li key={m.markerId} className="aruco-letter-chip">
              <span className="aruco-letter-id">{m.markerId}</span>
              <span className="aruco-letter-char">{m.content}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="aruco-label">Blue beacons</p>
        <ol className="space-y-1.5">
          {hints.map((m) => (
            <li key={m.markerId} className="aruco-hint">
              <span className="aruco-hint-num">{m.hintNumber}</span>
              <span className="aruco-hint-id">#{m.markerId}</span>
              <span className="aruco-hint-text">{m.content}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Word box: {collectors.map((m) => `#${m.markerId}`).join(' and ')}
      </p>

      <div className="mt-auto">
        {isLive ? (
          <StopButton />
        ) : picking ? (
          <TeamPicker game={game} teams={teams} live={live} onCancel={() => onPick(false)} />
        ) : (
          <button type="button" className="admin-btn-primary w-full px-4 py-2 text-xs" onClick={() => onPick(true)}>
            Start this game
          </button>
        )}
      </div>
    </section>
  );
}

function TeamPicker({
  game,
  teams,
  live,
  onCancel,
}: {
  game: Game;
  teams: CompetitionTeam[];
  live: RoundSummary | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const all = chosen.size === teams.length;

  function toggle(id: string) {
    setError(null);
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    startTransition(async () => {
      const result = await startRound(game.number, [...chosen]);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onCancel();
      router.push('/teams/aruco');
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="aruco-label">Teams playing</p>
        <button
          type="button"
          className="text-xs"
          style={{ color: 'var(--color-green)' }}
          onClick={() => setChosen(all ? new Set() : new Set(teams.map((t) => t.id)))}
        >
          {all ? 'Clear' : 'Select all'}
        </button>
      </div>
      <ul className="aruco-picker">
        {teams.map((team) => (
          <li key={team.id}>
            <label className="aruco-pick">
              <input type="checkbox" checked={chosen.has(team.id)} onChange={() => toggle(team.id)} />
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {team.members}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="pay-banner text-xs">
        {live ? `This ends Game ${live.game} · ${live.gameName}. ` : ''}Every team’s tries, field log and word
        attempts are deleted. The activity log stays here.
      </p>
      {error && <p className="pay-error">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className="admin-btn-secondary px-3 py-2 text-sm" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-btn-primary flex-1 px-3 py-2 text-xs"
          onClick={start}
          disabled={pending || chosen.size === 0}
        >
          {pending ? 'Starting…' : `Start for ${chosen.size} team${chosen.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

/** Ends the live game. Two presses: it closes /aruco and wipes progress. */
function StopButton() {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function press() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await stopRound();
      setArmed(false);
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="admin-btn-secondary w-full px-4 py-2 text-sm"
        style={armed ? { color: 'var(--color-pink)', borderColor: 'rgba(255,29,120,0.4)' } : undefined}
        onClick={press}
        onBlur={() => setArmed(false)}
        disabled={pending}
      >
        {pending ? 'Stopping…' : armed ? 'Press again: close /aruco and wipe progress' : 'Stop this game'}
      </button>
      {error && <p className="pay-error">{error}</p>}
    </div>
  );
}

/** A fresh start for one team of the live game. Two presses, as it can't be undone. */
export function ResetTeamButton({ roundId, teamId }: { roundId: string; teamId: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function press() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await resetTeam(roundId, teamId);
      setArmed(false);
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="admin-btn-secondary shrink-0 px-3 py-1.5 text-xs"
        style={armed ? { color: 'var(--color-pink)', borderColor: 'rgba(255,29,120,0.4)' } : undefined}
        onClick={press}
        onBlur={() => setArmed(false)}
        disabled={pending}
      >
        {pending ? 'Resetting…' : armed ? 'Press again to reset' : 'Reset team'}
      </button>
      {error && <span className="pay-error">{error}</span>}
    </span>
  );
}
