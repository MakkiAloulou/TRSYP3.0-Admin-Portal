'use client';

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { reassignIds } from './actions';
import { KIND_LABELS, type Marker } from './aruco-types';

function byId(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.markerId - b.markerId);
}

/** An action card being dragged: where on it it was grabbed, and where the pointer is. */
type Drag = { id: number; pointerId: number; grabOffset: number; pointerY: number };

/**
 * Re-ranks the ArUco register. The IDs on the left are fixed: the printed
 * markers in use. The actions on the right are dragged into a new order, and
 * each takes the ID of the slot it lands beside. Edits stay local until
 * saved; a save applies them all at once.
 */
export function RegisterEditor({ initial, initialVersion }: { initial: Marker[]; initialVersion: string }) {
  const [slots, setSlots] = useState(() => byId(initial).map((m) => m.markerId));
  const [order, setOrder] = useState(() => byId(initial));
  const [version, setVersion] = useState(initialVersion);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const cards = useRef(new Map<number, HTMLElement>());

  const moves = order.map((m, i) => ({ from: m.markerId, to: slots[i] })).filter((m) => m.from !== m.to);
  const dirty = moves.length > 0;

  // A tab closed mid-edit would lose the edits without a word.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function moveTo(id: number, target: number) {
    setStatus(null);
    setOrder((current) => {
      const from = current.findIndex((m) => m.markerId === id);
      if (from === -1 || from === target) return current;
      const next = [...current];
      const [card] = next.splice(from, 1);
      next.splice(target, 0, card);
      return next;
    });
  }

  // ── Pointer drag ─────────────────────────────────────────────────────────

  function startDrag(event: React.PointerEvent<HTMLElement>, id: number) {
    // Mouse drags from anywhere on the card; touch only from the grip, so a
    // finger on a card still scrolls the page.
    const fromGrip = (event.target as HTMLElement).closest('.aruco-grip') !== null;
    if (event.button !== 0 || (event.pointerType !== 'mouse' && !fromGrip) || pending) return;
    const card = cards.current.get(id);
    if (!card) return;
    event.preventDefault();
    card.setPointerCapture(event.pointerId);
    const grabOffset = event.clientY - card.getBoundingClientRect().top;
    setDrag({ id, pointerId: event.pointerId, grabOffset, pointerY: event.clientY });
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    // Its slot is the number of other cards whose middle is above the pointer.
    let target = 0;
    for (const m of order) {
      if (m.markerId === drag.id) continue;
      const rect = cards.current.get(m.markerId)?.getBoundingClientRect();
      if (rect && rect.top + rect.height / 2 < event.clientY) target++;
    }
    moveTo(drag.id, target);
    setDrag({ ...drag, pointerY: event.clientY });
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(null);
  }

  // The lifted card follows the pointer from wherever the layout puts it now:
  // measured after each render, so a reorder under it never makes it jump.
  useLayoutEffect(() => {
    if (!drag) return;
    const card = cards.current.get(drag.id);
    if (!card) return;
    card.style.transform = '';
    const naturalTop = card.getBoundingClientRect().top;
    card.style.transform = `translateY(${drag.pointerY - drag.grabOffset - naturalTop}px)`;
    return () => {
      card.style.transform = '';
    };
  }, [drag, order]);

  // ── Keyboard: arrows on the grip move the card one slot ──────────────────

  function onGripKey(event: React.KeyboardEvent, id: number, index: number) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    const target = index + step;
    if (!step || target < 0 || target >= order.length) return;
    event.preventDefault();
    moveTo(id, target);
    setAnnouncement(`${spoken(order[index])} moved to ID ${slots[target]}.`);
    // The card re-renders in its new slot; keep focus on its grip.
    requestAnimationFrame(() => cards.current.get(id)?.querySelector<HTMLElement>('.aruco-grip')?.focus());
  }

  function discard() {
    setStatus(null);
    setOrder(byId(order));
  }

  function save() {
    startTransition(async () => {
      const result = await reassignIds(moves, version);
      if (!result.ok) {
        setStatus({ ok: false, message: result.message });
        return;
      }
      const saved = byId(result.markers);
      setSlots(saved.map((m) => m.markerId));
      setOrder(saved);
      setVersion(result.version);
      setStatus({ ok: true, message: 'Saved. Scans on /aruco use the new order from now on.' });
    });
  }

  return (
    <section className="admin-card" aria-labelledby="aruco-register-title">
      <div className="p-4 sm:px-5">
        <h3 id="aruco-register-title" className="admin-heading text-sm text-white">
          Marker register
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          The IDs are the printed markers and stay put. Drag an action next to another ID to give it to that marker;
          the others shift to make room. Nothing changes on /aruco until you save.
        </p>
      </div>

      {order.length === 0 && (
        <p className="viz-empty px-5 py-6 text-sm">The register is empty: every scan reads as “no marker”.</p>
      )}

      <ol className="aruco-list" data-dragging={drag ? '' : undefined}>
        {order.map((marker, i) => {
          const moved = marker.markerId !== slots[i];
          return (
            <li key={marker.markerId} className="aruco-row">
              <span className="aruco-slot" aria-hidden>
                {slots[i]}
              </span>
              <div
                ref={(el) => {
                  if (el) cards.current.set(marker.markerId, el);
                  else cards.current.delete(marker.markerId);
                }}
                className="aruco-card"
                data-moved={moved ? '' : undefined}
                data-lifted={drag?.id === marker.markerId ? '' : undefined}
                onPointerDown={(e) => startDrag(e, marker.markerId)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <button
                  type="button"
                  className="aruco-grip"
                  aria-label={`${spoken(marker)}, at ID ${slots[i]}. Arrow up or down to move it.`}
                  onKeyDown={(e) => onGripKey(e, marker.markerId, i)}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </button>
                <div className="aruco-action">
                  <p className="aruco-action-head">
                    <span className="admin-badge admin-badge--gray">{marker.game}</span>
                    <span className="aruco-action-name">{marker.name}</span>
                    {marker.kind !== 'beacon' && <span className="aruco-action-kind">{KIND_LABELS[marker.kind]}</span>}
                  </p>
                  <p className="aruco-action-gives" title={gives(marker)}>
                    {gives(marker)}
                  </p>
                </div>
                {moved && <span className="aruco-was">was {marker.markerId}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2 p-4 sm:px-5">
        <button type="button" className="admin-btn-secondary px-3 py-2 text-sm" onClick={discard} disabled={!dirty || pending}>
          Discard changes
        </button>
        <button type="button" className="admin-btn-primary px-4 py-2 text-xs" onClick={save} disabled={!dirty || pending}>
          {pending ? 'Saving…' : dirty ? `Save ${moves.length} change${moves.length === 1 ? '' : 's'}` : 'Save'}
        </button>
      </div>

      {status && (
        <div className="px-4 pb-4 sm:px-5" role="status">
          <p className={status.ok ? 'pay-banner pay-banner--ok' : 'pay-error'}>{status.message}</p>
        </div>
      )}
    </section>
  );
}

/** A marker named for a screen reader: eight are called "Red beacon", so add the clue. */
function spoken(marker: Marker): string {
  return marker.kind === 'beacon' && marker.clue ? `${marker.name} ${marker.clue}` : marker.name;
}

function gives(marker: Marker): string {
  if (marker.kind === 'collector') return `Opens collector ${marker.collector} (word from ARUCO_COLLECTOR_${marker.collector}_ANSWER)`;
  const clue = marker.clue ? `“${marker.clue}”` : 'No clue set yet';
  if (marker.kind === 'beacon' && marker.quantity && marker.quantity > 1) return `${clue} · ${marker.quantity} on the field`;
  return clue;
}
