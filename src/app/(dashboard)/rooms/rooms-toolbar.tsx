'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  NO_ROOM_FILTERS,
  ROOM_GENDERS,
  isRoomsFiltered,
  parseRoomFilters,
  roomsHref,
  type RoomFilters,
} from './room-types';

/** Long enough that a name typed at speed is one query, not one per letter. */
const SEARCH_DEBOUNCE_MS = 300;

function filtersFromParams(params: { get(name: string): string | null }) {
  return parseRoomFilters({ search: params.get('search'), gender: params.get('gender'), status: params.get('status') });
}

/**
 * Search and filters for the rooms table. Every change goes to the URL and
 * the server pages and filters from there. This sits in the rooms layout, so
 * it stays mounted — and the search box keeps its focus — while the table
 * below reloads.
 */
export function RoomsToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Filters only: paging is the table's business and leaves these alone.
  const urlHref = roomsHref(filtersFromParams(searchParams));

  const [filters, setFilters] = useState<RoomFilters>(() => filtersFromParams(searchParams));
  // The URL last seen here, and the one this toolbar last asked for.
  const [seenHref, setSeenHref] = useState(urlHref);
  const [sentHref, setSentHref] = useState(urlHref);
  const [loading, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL moved without us — back/forward, or the Rooms link in the nav —
  // so the controls follow it. Our own changes arrive as sentHref and are let
  // be, so a search still being typed is never overwritten by the last one.
  if (urlHref !== seenHref) {
    setSeenHref(urlHref);
    if (urlHref !== sentHref) {
      setFilters(filtersFromParams(searchParams));
      setSentHref(urlHref);
    }
  }

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function send(next: RoomFilters) {
    clearTimeout(searchTimer.current);
    const href = roomsHref(next);
    if (href === sentHref) return;
    setSentHref(href);
    // A new search or filter starts again from the first page.
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function set<K extends keyof RoomFilters>(key: K, value: RoomFilters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    send(next);
  }

  function search(value: string) {
    const next = { ...filters, search: value };
    setFilters(next);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => send(next), SEARCH_DEBOUNCE_MS);
  }

  function clear() {
    setFilters(NO_ROOM_FILTERS);
    send(NO_ROOM_FILTERS);
  }

  const typing = roomsHref(filters) !== sentHref;
  const filtered = isRoomsFiltered(filters);

  return (
    <div className="admin-card part-toolbar">
      <div className="part-toolbar-top">
        <input
          type="search"
          className="admin-input part-search"
          placeholder="Search room code, or an occupant's name or email"
          value={filters.search}
          onChange={(e) => search(e.target.value)}
          aria-label="Search rooms"
        />
        <select
          className="admin-input part-select part-toolbar-btn"
          value={filters.gender}
          onChange={(e) => set('gender', e.target.value as RoomFilters['gender'])}
          aria-label="Gender"
        >
          <option value="all">Any gender</option>
          {ROOM_GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <select
          className="admin-input part-select part-toolbar-btn"
          value={filters.status}
          onChange={(e) => set('status', e.target.value as RoomFilters['status'])}
          aria-label="Status"
        >
          <option value="all">Any status</option>
          <option value="full">Full</option>
          <option value="waiting">Waiting for roommate</option>
        </select>
      </div>

      {(filtered || typing || loading) && (
        <div className="part-toolbar-foot" aria-live="polite">
          {(typing || loading) && <span>Searching…</span>}
          {filtered && (
            <button type="button" className="pay-link" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
