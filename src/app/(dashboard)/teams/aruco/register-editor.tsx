'use client';

import { useEffect, useState, useTransition } from 'react';
import { reassignIds } from './actions';
import { KIND_LABELS, MAX_MARKER_ID, idProblems, type Marker, type MarkerKind } from './aruco-types';

const KIND_ORDER: Record<MarkerKind, number> = { beacon: 0, indicator: 1, collector: 2 };

/** Game, then kind, then ID: how the register reads on the field. */
function sorted(markers: Marker[]): Marker[] {
  return [...markers].sort(
    (a, b) =>
      a.game.localeCompare(b.game) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.markerId - b.markerId,
  );
}

/** Each marker's new ID, by the ID it has now. Starts as every marker where it is. */
function unmoved(markers: Marker[]): Map<number, number> {
  return new Map(markers.map((m) => [m.markerId, m.markerId]));
}

/**
 * Re-ranks the ArUco register: which printed ID carries which action. Each
 * row is the ID, which is the only thing that changes, and the action it
 * gives, which is fixed. Edits stay local until saved, and a save applies
 * them all at once, so swapping two IDs is changing both and saving once.
 */
export function RegisterEditor({ initial, initialVersion }: { initial: Marker[]; initialVersion: string }) {
  const [markers, setMarkers] = useState(() => sorted(initial));
  const [version, setVersion] = useState(initialVersion);
  const [ids, setIds] = useState(() => unmoved(initial));
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const newIds = markers.map((m) => ids.get(m.markerId) ?? m.markerId);
  const problems = idProblems(newIds);
  const moves = markers
    .map((m, i) => ({ from: m.markerId, to: newIds[i] }))
    .filter((move) => move.from !== move.to);
  const dirty = moves.length > 0;

  const taken = new Set(newIds);
  const freeIds = Array.from({ length: MAX_MARKER_ID + 1 }, (_, id) => id).filter((id) => !taken.has(id));

  // A tab closed mid-edit would lose the edits without a word.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setId(current: number, next: number) {
    setStatus(null);
    setIds((prev) => new Map(prev).set(current, next));
  }

  function discard() {
    setStatus(null);
    setIds(unmoved(markers));
  }

  function save() {
    startTransition(async () => {
      const result = await reassignIds(moves, version);
      if (!result.ok) {
        setStatus({ ok: false, message: result.message });
        return;
      }
      setMarkers(sorted(result.markers));
      setVersion(result.version);
      setIds(unmoved(result.markers));
      setStatus({ ok: true, message: 'Saved. Scans on /aruco use the new IDs from now on.' });
    });
  }

  return (
    <section className="admin-card" aria-labelledby="aruco-register-title">
      <div className="p-4 sm:px-5">
        <h3 id="aruco-register-title" className="admin-heading text-sm text-white">
          Marker register
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Change an ID to give its action to another printed marker (DICT_4X4_50, 0–{MAX_MARKER_ID}). To swap two,
          change both, then save once.
        </p>
      </div>

      {markers.length === 0 && (
        <p className="viz-empty px-5 py-6 text-sm">The register is empty: every scan reads as “no marker”.</p>
      )}

      <ol>
        {markers.map((marker, i) => (
          <MarkerRow
            key={marker.markerId}
            marker={marker}
            newId={newIds[i]}
            problem={problems.get(i)}
            onChange={(next) => setId(marker.markerId, next)}
          />
        ))}
      </ol>

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
            {pending ? 'Saving…' : dirty ? `Save ${moves.length} change${moves.length === 1 ? '' : 's'}` : 'Save'}
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

/** Two blocks: the ID (editable) and the action it gives (fixed). */
function MarkerRow({
  marker,
  newId,
  problem,
  onChange,
}: {
  marker: Marker;
  newId: number;
  problem: string | undefined;
  onChange: (next: number) => void;
}) {
  const moved = newId !== marker.markerId;
  return (
    <li className="aruco-row" data-moved={moved ? '' : undefined} data-problem={problem ? '' : undefined}>
      <div className="aruco-id">
        <input
          className="admin-input aruco-id-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_MARKER_ID}
          value={Number.isNaN(newId) ? '' : newId}
          aria-label={`ID of ${marker.name}`}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
        {moved && <span className="aruco-id-was">was {marker.markerId}</span>}
      </div>

      <div className="aruco-action">
        <p className="aruco-action-head">
          <span className="admin-badge admin-badge--gray">{marker.game}</span>
          <span className="aruco-action-name">{marker.name}</span>
          {marker.kind !== 'beacon' && <span className="aruco-action-kind">{KIND_LABELS[marker.kind]}</span>}
        </p>
        <p className="aruco-action-gives">{gives(marker)}</p>
        {problem && <p className="aruco-problem">{problem}</p>}
      </div>
    </li>
  );
}

function gives(marker: Marker): string {
  if (marker.kind === 'collector') return `Opens collector ${marker.collector} (word from ARUCO_COLLECTOR_${marker.collector}_ANSWER)`;
  const clue = marker.clue ? `“${marker.clue}”` : 'No clue set yet';
  if (marker.kind === 'beacon' && marker.quantity && marker.quantity > 1) return `${clue} · ${marker.quantity} on the field`;
  return clue;
}
