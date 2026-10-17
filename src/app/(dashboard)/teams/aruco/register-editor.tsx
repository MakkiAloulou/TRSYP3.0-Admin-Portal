'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { saveRegister } from './actions';
import {
  COLLECTORS,
  KIND_LABELS,
  MARKER_GAMES,
  MARKER_KINDS,
  MAX_MARKER_ID,
  registerProblems,
  withKind,
  type Marker,
  type MarkerGame,
  type MarkerKind,
} from './aruco-types';

/** A row being edited. `key` stays put while its ID is changed. */
type Draft = Marker & { key: string };

const KIND_ORDER: Record<MarkerKind, number> = { beacon: 0, indicator: 1, collector: 2 };

/** Game, then kind, then ID: how the register reads on the field. */
function sorted(markers: Marker[]): Marker[] {
  return [...markers].sort(
    (a, b) =>
      a.game.localeCompare(b.game) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.markerId - b.markerId,
  );
}

let nextKey = 0;
function toDrafts(markers: Marker[]): Draft[] {
  return sorted(markers).map((m) => ({ ...m, key: `m${nextKey++}` }));
}

/** In parseMarker's field order, so a draft and its saved row stringify alike. */
function stripKeys(drafts: Draft[]): Marker[] {
  return drafts.map((d) => ({
    markerId: d.markerId,
    kind: d.kind,
    game: d.game,
    name: d.name,
    clue: d.clue,
    quantity: d.quantity,
    collector: d.collector,
  }));
}

/**
 * The ArUco register: what each marker ID gives on the main site's /aruco
 * page. Edits stay local until saved; a save replaces the whole register, so
 * moving a clue to another ID (or swapping two) is just changing the ID
 * fields and saving once.
 */
export function RegisterEditor({ initial, initialVersion }: { initial: Marker[]; initialVersion: string }) {
  const [saved, setSaved] = useState(() => sorted(initial));
  const [version, setVersion] = useState(initialVersion);
  const [drafts, setDrafts] = useState(() => toDrafts(initial));
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const markers = useMemo(() => stripKeys(drafts), [drafts]);
  const problems = useMemo(() => registerProblems(markers), [markers]);
  const dirty = JSON.stringify(markers) !== JSON.stringify(saved);

  const usedIds = new Set(markers.map((m) => m.markerId));
  const freeIds = Array.from({ length: MAX_MARKER_ID + 1 }, (_, id) => id).filter((id) => !usedIds.has(id));

  // A tab closed mid-edit would lose the edits without a word.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function update(key: string, change: (draft: Draft) => Draft) {
    setStatus(null);
    setDrafts((current) => current.map((d) => (d.key === key ? change(d) : d)));
  }

  function add() {
    setStatus(null);
    const id = freeIds[0];
    if (id === undefined) return;
    setDrafts((current) => [
      ...current,
      { key: `m${nextKey++}`, markerId: id, kind: 'beacon', game: 'Garden', name: 'Red beacon', clue: '', quantity: 1, collector: null },
    ]);
  }

  function remove(key: string) {
    setStatus(null);
    setDrafts((current) => current.filter((d) => d.key !== key));
  }

  function discard() {
    setStatus(null);
    setDrafts(toDrafts(saved));
  }

  function save() {
    startTransition(async () => {
      const result = await saveRegister(markers, version);
      if (!result.ok) {
        setStatus({ ok: false, message: result.message });
        return;
      }
      setSaved(sorted(result.markers));
      setVersion(result.version);
      setDrafts(toDrafts(result.markers));
      setStatus({ ok: true, message: 'Saved. Scans on /aruco use it from now on.' });
    });
  }

  return (
    <section className="admin-card" aria-labelledby="aruco-register-title">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:px-5">
        <div>
          <h3 id="aruco-register-title" className="admin-heading text-sm text-white">
            Marker register
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {markers.length} of {MAX_MARKER_ID + 1} IDs in use (DICT_4X4_50). Change an ID to move what it gives
            to another printed marker.
          </p>
        </div>
        <button type="button" className="admin-btn-secondary px-3 py-2 text-sm" onClick={add} disabled={freeIds.length === 0}>
          Add marker
        </button>
      </div>

      <div className="aruco-row aruco-row--head" aria-hidden>
        <span>ID</span>
        <span>Game</span>
        <span>Kind</span>
        <span>Name</span>
        <span>Gives</span>
        <span />
      </div>

      {drafts.length === 0 && (
        <p className="viz-empty px-5 py-6 text-sm">No markers: every scan will read as “no marker”.</p>
      )}

      {drafts.map((draft, i) => (
        <MarkerRow
          key={draft.key}
          draft={draft}
          problem={problems.get(i)}
          onChange={(change) => update(draft.key, change)}
          onRemove={() => remove(draft.key)}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {freeIds.length > 0 ? `Free IDs: ${freeIds.join(', ')}` : 'Every ID is in use.'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="admin-btn-secondary px-3 py-2 text-sm" onClick={discard} disabled={!dirty || pending}>
            Discard changes
          </button>
          <button
            type="button"
            className="admin-btn-primary px-4 py-2 text-xs"
            onClick={save}
            disabled={!dirty || pending || problems.size > 0}
          >
            {pending ? 'Saving…' : 'Save register'}
          </button>
        </div>
      </div>

      {status && (
        <div className="px-4 pb-4 sm:px-5" role="status">
          <p className={status.ok ? 'pay-banner pay-banner--ok' : 'pay-error'}>{status.message}</p>
        </div>
      )}
    </section>
  );
}

function MarkerRow({
  draft,
  problem,
  onChange,
  onRemove,
}: {
  draft: Draft;
  problem: string | undefined;
  onChange: (change: (draft: Draft) => Draft) => void;
  onRemove: () => void;
}) {
  const label = `marker ${draft.markerId}`;
  return (
    <div className="aruco-row" data-problem={problem ? '' : undefined}>
      <div>
        <span className="aruco-label">ID</span>
        <input
          className="admin-input aruco-field aruco-field--id"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_MARKER_ID}
          value={Number.isNaN(draft.markerId) ? '' : draft.markerId}
          aria-label={`ID of ${label}`}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => {
            const value = e.target.valueAsNumber;
            onChange((d) => ({ ...d, markerId: value }));
          }}
        />
      </div>

      <div>
        <span className="aruco-label">Game</span>
        <select
          className="admin-input part-select aruco-field"
          value={draft.game}
          aria-label={`Game of ${label}`}
          onChange={(e) => {
            const game = e.target.value as MarkerGame;
            onChange((d) => ({ ...d, game }));
          }}
        >
          {MARKER_GAMES.map((game) => (
            <option key={game} value={game}>
              {game}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="aruco-label">Kind</span>
        <select
          className="admin-input part-select aruco-field"
          value={draft.kind}
          aria-label={`Kind of ${label}`}
          onChange={(e) => {
            const kind = e.target.value as MarkerKind;
            onChange((d) => ({ ...withKind(d, kind), key: d.key }));
          }}
        >
          {MARKER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <div className="aruco-cell--name">
        <span className="aruco-label">Name</span>
        <input
          className="admin-input aruco-field"
          value={draft.name}
          maxLength={80}
          aria-label={`Name of ${label}`}
          onChange={(e) => {
            const name = e.target.value;
            onChange((d) => ({ ...d, name }));
          }}
        />
      </div>

      <div className="aruco-cell--gives">
        <span className="aruco-label">Gives</span>
        <Gives draft={draft} label={label} onChange={onChange} />
      </div>

      <div className="aruco-cell--remove">
        <button type="button" className="aruco-remove" onClick={onRemove} aria-label={`Remove ${label}`} title="Remove">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {problem && <p className="aruco-problem">{problem}</p>}
    </div>
  );
}

/** What scanning gives: a clue (and, for a beacon, how many are on the field) or a collector. */
function Gives({
  draft,
  label,
  onChange,
}: {
  draft: Draft;
  label: string;
  onChange: (change: (draft: Draft) => Draft) => void;
}) {
  if (draft.kind === 'collector') {
    return (
      <select
        className="admin-input part-select aruco-field"
        value={draft.collector ?? 1}
        aria-label={`Collector number of ${label}`}
        onChange={(e) => {
          const collector = Number(e.target.value);
          onChange((d) => ({ ...d, collector }));
        }}
      >
        {COLLECTORS.map((n) => (
          <option key={n} value={n}>
            Collector {n} (word from ARUCO_COLLECTOR_{n}_ANSWER)
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="aruco-gives">
      <input
        className="admin-input aruco-field"
        value={draft.clue}
        maxLength={300}
        placeholder={draft.kind === 'beacon' ? 'Letter, e.g. A' : 'Clue text'}
        aria-label={`Clue of ${label}`}
        onChange={(e) => {
          const clue = e.target.value;
          onChange((d) => ({ ...d, clue }));
        }}
      />
      {draft.kind === 'beacon' && (
        <input
          className="admin-input aruco-field aruco-field--qty"
          type="number"
          inputMode="numeric"
          min={1}
          value={draft.quantity === null || Number.isNaN(draft.quantity) ? '' : draft.quantity}
          title="How many beacons with this ID are on the field"
          aria-label={`Quantity of ${label}`}
          onChange={(e) => {
            const quantity = e.target.valueAsNumber;
            onChange((d) => ({ ...d, quantity }));
          }}
        />
      )}
    </div>
  );
}
