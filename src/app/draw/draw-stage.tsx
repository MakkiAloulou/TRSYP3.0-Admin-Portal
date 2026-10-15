'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import Image from 'next/image';
import { TEAMS, type Team } from './teams';
import { saveDraw } from './actions';

type Corner = 'green' | 'pink';
type Phase = 'lineup' | 'drawing' | 'drawn' | 'leaderboard';

const MATCH_COUNT = TEAMS.length / 2;

/** The draw fills slots in order: match 1 green, match 1 pink, match 2 green… */
const cornerOf = (slot: number): Corner => (slot % 2 === 0 ? 'green' : 'pink');
const matchOf = (slot: number) => Math.floor(slot / 2) + 1;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The light that glides over the pool before a pick: a few unhurried steps
 * that slow to a stop on `target`. Never lands twice in a row on the same
 * team, so every step reads as movement.
 */
function rouletteHops(pool: string[], target: string): { id: string; ms: number }[] {
  if (pool.length === 1) return [{ id: target, ms: 700 }];
  const count = pool.length > 2 ? 6 : 4;
  const hops: { id: string; ms: number }[] = [];
  let previous = '';
  for (let i = 0; i < count - 1; i++) {
    const choices = pool.filter((id) => id !== previous && (i < count - 2 || id !== target));
    previous = choices[Math.floor(Math.random() * choices.length)];
    hops.push({ id: previous, ms: 120 + 220 * Math.pow(i / (count - 1), 2) });
  }
  // The landing hold: long enough for the room to read the name before it locks.
  hops.push({ id: target, ms: 560 });
  return hops;
}

const HEADINGS: Record<Exclude<Phase, 'drawing'>, string> = {
  lineup: 'Eight teams. Four matches.',
  drawn: 'The matches are set',
  leaderboard: 'Leaderboard',
};

type SaveState = { status: 'idle' | 'saving' | 'saved' } | { status: 'failed'; message: string };

/** `savedOrder` is the last stored draw's team keys, or null when there is none. */
export function DrawStage({ savedOrder }: { savedOrder: string[] | null }) {
  // A stored draw opens on its matches; otherwise the lineup waits for one.
  const [phase, setPhase] = useState<Phase>(savedOrder ? 'drawn' : 'lineup');
  // The draw's result: consecutive pairs are the matches, green corner first.
  const [order, setOrder] = useState<Team[]>(() =>
    (savedOrder ?? []).map((key) => TEAMS.find((team) => team.id === key)!),
  );
  // How many slots of `order` are revealed so far.
  const [filled, setFilled] = useState(savedOrder ? TEAMS.length : 0);
  const [save, setSave] = useState<SaveState>({ status: savedOrder ? 'saved' : 'idle' });
  // Only the latest draw's save may report back.
  const saveRun = useRef(0);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const timers = useRef<number[]>([]);
  const reducedMotion = useReducedMotion();

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function cancelTimeline() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  /** Commits a phase change inside a view transition, so tiles glide to their new places. */
  function morph(update: () => void) {
    if (reducedMotion || !document.startViewTransition) {
      update();
      return;
    }
    document.startViewTransition(() => flushSync(update));
  }

  /** Stores a draw in place of the last one. Runs alongside the ceremony. */
  function persist(drawn: Team[]) {
    const run = ++saveRun.current;
    setSave({ status: 'saving' });
    saveDraw(drawn.map((team) => team.id))
      .then((result) => {
        if (run === saveRun.current) {
          setSave(result.ok ? { status: 'saved' } : { status: 'failed', message: result.message });
        }
      })
      .catch(() => {
        if (run === saveRun.current) setSave({ status: 'failed', message: 'The draw could not be saved.' });
      });
  }

  function ignite() {
    cancelTimeline();
    const drawn = shuffle(TEAMS);
    morph(() => {
      setOrder(drawn);
      setFilled(0);
      setSpotlight(null);
      setPhase('drawing');
    });
    // The result is decided now, so it is stored now: a refresh mid-ceremony
    // still finds it.
    persist(drawn);

    // The whole ceremony is scheduled up front; Skip cancels what's left.
    const at = (ms: number, step: () => void) => timers.current.push(window.setTimeout(step, ms));
    let clock = reducedMotion ? 400 : 750;
    drawn.forEach((team, slot) => {
      if (!reducedMotion) {
        for (const hop of rouletteHops(drawn.slice(slot).map((t) => t.id), team.id)) {
          at(clock, () => setSpotlight(hop.id));
          clock += hop.ms;
        }
      }
      at(clock, () => {
        setSpotlight(null);
        setFilled(slot + 1);
        setAnnouncement(`${team.name} drawn into match ${matchOf(slot)}, ${cornerOf(slot)} corner.`);
      });
      // A longer breath once a match is complete, a short one between corners.
      clock += slot % 2 === 1 ? (reducedMotion ? 500 : 800) : reducedMotion ? 300 : 350;
    });
    at(clock, () => morph(() => setPhase('drawn')));
  }

  function skip() {
    cancelTimeline();
    morph(() => {
      setSpotlight(null);
      setFilled(order.length);
      setPhase('drawn');
    });
    setAnnouncement('Draw complete.');
  }

  function drawAgain() {
    cancelTimeline();
    morph(() => {
      setOrder([]);
      setFilled(0);
      setPhase('lineup');
    });
  }

  const currentSlot = Math.min(filled, TEAMS.length - 1);
  const heading =
    phase !== 'drawing'
      ? HEADINGS[phase]
      : filled === TEAMS.length
        ? 'Draw complete'
        : `Drawing match ${matchOf(currentSlot)} of ${MATCH_COUNT}`;

  return (
    <div className="draw-page" data-phase={phase}>
      <TopBar />

      <main className="draw-main">
        <h1 className="draw-title">{heading}</h1>

        {(phase === 'lineup' || phase === 'drawing') && (
          <Pool
            compact={phase === 'drawing'}
            order={order}
            filled={filled}
            spotlight={spotlight}
            spotCorner={cornerOf(currentSlot)}
          />
        )}

        {(phase === 'drawing' || phase === 'drawn') && (
          <Board order={order} filled={filled} drawing={phase === 'drawing'} animate={!reducedMotion} />
        )}

        {phase === 'leaderboard' && <Leaderboard order={order} />}

        <div className="draw-actions">
          {phase === 'lineup' && (
            <button type="button" className="draw-btn draw-btn--ignite" onClick={ignite}>
              <BoltIcon />
              Ignite the draw
            </button>
          )}
          {phase === 'drawing' && (
            <button type="button" className="draw-btn" onClick={skip}>
              Skip to results
            </button>
          )}
          {phase === 'drawn' && (
            <>
              <button
                type="button"
                className="draw-btn"
                onClick={() => morph(() => setPhase('leaderboard'))}
              >
                <PodiumIcon />
                Show leaderboard
              </button>
              <button type="button" className="draw-btn" onClick={drawAgain}>
                Draw again
              </button>
            </>
          )}
          {phase === 'leaderboard' && (
            <>
              <button
                type="button"
                className="draw-btn"
                onClick={() => morph(() => setPhase('drawn'))}
              >
                Back to matches
              </button>
              <button type="button" className="draw-btn" onClick={drawAgain}>
                Draw again
              </button>
            </>
          )}
        </div>
        {save.status === 'failed' && phase !== 'lineup' && (
          <p className="draw-save-error" role="alert">
            {save.message}{' '}
            <button type="button" onClick={() => persist(order)}>
              Try again
            </button>
          </p>
        )}
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function TopBar() {
  const fullscreen = useFullscreen();

  return (
    <div className="draw-top">
      <Image src="/trsyp-logo.png" alt="TRSYP 3.0" width={100} height={40} priority className="draw-logo" />
      {fullscreen.supported && (
        <button
          type="button"
          className="draw-icon-btn"
          onClick={fullscreen.toggle}
          aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
          title={fullscreen.active ? 'Exit full screen (F)' : 'Full screen (F)'}
        >
          <FullscreenIcon exit={fullscreen.active} />
        </button>
      )}
    </div>
  );
}

/* ─── The pool ─────────────────────────────────────── */

function Pool({
  compact,
  order,
  filled,
  spotlight,
  spotCorner,
}: {
  compact: boolean;
  order: Team[];
  filled: number;
  spotlight: string | null;
  spotCorner: Corner;
}) {
  return (
    <ul className="draw-pool" data-compact={compact ? '' : undefined} aria-label="Teams in the draw">
      {TEAMS.map((team, i) => {
        const slot = order.findIndex((t) => t.id === team.id);
        const drawn = slot !== -1 && slot < filled;
        return (
          <li
            key={team.id}
            className="draw-tile"
            style={{ viewTransitionName: `draw-${team.id}`, '--i': i } as React.CSSProperties}
            data-spot={spotlight === team.id ? spotCorner : undefined}
            data-drawn={drawn ? cornerOf(slot) : undefined}
          >
            <span className="draw-tile-led" aria-hidden />
            <BranchLogo team={team} />
            <span className="draw-tile-body">
              <span className="draw-tile-name">{team.name}</span>
              {drawn ? (
                <span className="draw-tile-tag">Match {matchOf(slot)}</span>
              ) : (
                <Branch team={team} logo={false} className="draw-tile-branch" />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── The matches ──────────────────────────────────── */

function Board({
  order,
  filled,
  drawing,
  animate,
}: {
  order: Team[];
  filled: number;
  drawing: boolean;
  animate: boolean;
}) {
  return (
    <ol className="draw-board" aria-label="Matches">
      {Array.from({ length: MATCH_COUNT }, (_, m) => {
        const greenSlot = m * 2;
        const pinkSlot = greenSlot + 1;
        return (
          <li key={m} className="draw-match" data-complete={filled > pinkSlot ? '' : undefined}>
            <span className="draw-match-no">Match {m + 1}</span>
            <Slot
              corner="green"
              team={filled > greenSlot ? order[greenSlot] : null}
              active={drawing && filled === greenSlot}
              animate={animate && drawing}
            />
            <span className="draw-vs" aria-label="versus">
              VS
            </span>
            <Slot
              corner="pink"
              team={filled > pinkSlot ? order[pinkSlot] : null}
              active={drawing && filled === pinkSlot}
              animate={animate && drawing}
            />
          </li>
        );
      })}
    </ol>
  );
}

function Slot({
  corner,
  team,
  active,
  animate,
}: {
  corner: Corner;
  team: Team | null;
  active: boolean;
  animate: boolean;
}) {
  if (!team) {
    return (
      <div className="draw-slot" data-corner={corner} data-active={active ? '' : undefined}>
        <span className="draw-slot-empty" aria-hidden />
        <span className="sr-only">{corner} corner, not drawn yet</span>
      </div>
    );
  }
  return (
    <div className="draw-slot" data-corner={corner} data-filled="">
      <span className="draw-slot-name">
        <Reveal text={team.name} play={animate} />
      </span>
      <Branch team={team} className="draw-slot-branch" />
    </div>
  );
}

/** Each letter settles in after the one before it (the motion lives in CSS).
 *  Letters are grouped by word, so a long name still wraps between words. */
function Reveal({ text, play }: { text: string; play: boolean }) {
  if (!play) return text;
  let index = 0;
  return (
    <>
      {text.split(' ').map((word, w) => (
        <span key={w} aria-hidden>
          {w > 0 && ' '}
          <span className="draw-reveal-word">
            {[...word].map((char, i) => (
              <span key={i} className="draw-reveal-char" style={{ '--c': index++ } as React.CSSProperties}>
                {char}
              </span>
            ))}
          </span>
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </>
  );
}

/** The student branch with its logo, or the logo's reserved place. */
function Branch({ team, logo = true, className }: { team: Team; logo?: boolean; className?: string }) {
  return (
    <span className={`draw-branch ${className ?? ''}`} data-tbd={team.branch ? undefined : ''}>
      {logo && <BranchLogo team={team} />}
      <span className="draw-branch-name">{team.branch ?? 'SB to be confirmed'}</span>
    </span>
  );
}

function BranchLogo({ team }: { team: Team }) {
  return team.branchLogo ? (
    <Image src={team.branchLogo} alt="" sizes="200px" className="draw-branch-logo" />
  ) : (
    <span className="draw-branch-logo" aria-hidden />
  );
}

/* ─── The leaderboard ──────────────────────────────── */

function Leaderboard({ order }: { order: Team[] }) {
  const rows = TEAMS.map((team) => {
    const slot = order.findIndex((t) => t.id === team.id);
    return {
      team,
      corner: cornerOf(slot),
      opponent: order[slot ^ 1],
      opponentCorner: cornerOf(slot ^ 1),
      points: 0,
    };
  }).sort((a, b) => b.points - a.points);

  return (
    <div className="draw-standings">
      <table className="draw-table">
        <thead>
          <tr>
            <th scope="col" className="draw-col-rank">
              <span className="sr-only">Rank</span>#
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="draw-col-sb">
              <abbr title="Student branch">SB</abbr>
            </th>
            <th scope="col" className="draw-col-played">
              Played
            </th>
            <th scope="col" className="draw-col-pts">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.team.id} style={{ '--i': i } as React.CSSProperties}>
              <td className="draw-col-rank">{i + 1}</td>
              <td>
                <span className="draw-lb-team">
                  <span className="draw-lb-led" data-corner={row.corner} aria-hidden />
                  {row.team.name}
                </span>
                <span className="draw-lb-sub">
                  <span className="draw-lb-branch-inline">{row.team.branch ?? 'SB to be confirmed'} · </span>
                  vs{' '}
                  <span className="draw-lb-opp" data-corner={row.opponentCorner}>
                    {row.opponent.name}
                  </span>
                </span>
              </td>
              <td className="draw-col-sb">
                <Branch team={row.team} />
              </td>
              <td className="draw-col-played">
                <CrossIcon />
                <span className="sr-only">Not played</span>
              </td>
              <td className="draw-col-pts">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Browser hooks ────────────────────────────────── */

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

/** Full screen for the venue projector, from the button or the F key. */
function useFullscreen() {
  const active = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const supported = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenEnabled,
    () => false,
  );

  function toggle() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  useEffect(() => {
    if (!supported) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [supported]);

  return { active, supported, toggle };
}

/* ─── Icons: same stroke and corners as the navbar set ── */

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

function BoltIcon() {
  return (
    <Icon className="draw-btn-icon">
      <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />
    </Icon>
  );
}

function PodiumIcon() {
  return (
    <Icon className="draw-btn-icon">
      <path d="M9 20V9.5h6V20" />
      <path d="M3.5 20v-6H9" />
      <path d="M15 12h5.5v8" />
      <path d="M2.5 20h19" />
      <path d="m12 3.5.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 5.6l2-.3z" />
    </Icon>
  );
}

function CrossIcon() {
  return (
    <Icon className="draw-cross">
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </Icon>
  );
}

function FullscreenIcon({ exit }: { exit: boolean }) {
  return exit ? (
    <Icon>
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </Icon>
  ) : (
    <Icon>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </Icon>
  );
}
