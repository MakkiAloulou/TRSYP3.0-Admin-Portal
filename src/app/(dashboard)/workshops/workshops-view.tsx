'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { downloadXlsx } from '@/lib/xlsx';
import { Dash, Muted, Td, Th } from '../sessions/session-ui';
import { assignWorkshop, removeWorkshopSeat } from './actions';
import { buildAttendeesXlsx, buildUnseatedXlsx, workshopsXlsxFilename } from './export-workshops';
import {
  WORKSHOP_TABS,
  formatBookedAt,
  personName,
  seatIn,
  seatsLeft,
  sessionTime,
  sessionsOf,
  type ChallengeTeam,
  type Workshop,
  type WorkshopPerson,
  type WorkshopsData,
  type WorkshopsTab,
} from './workshop-types';

type Filters = { query: string; sb: string; missing: 'any' | 'all' | `${number}` };

const NO_FILTERS: Filters = { query: '', sb: 'ALL', missing: 'any' };

/**
 * The workshops page below its counts. Everything is on the page already —
 * a few hundred people — so tabs, search and filters run here; assigning or
 * removing a seat goes to the server and the page refreshes from it.
 */
export function WorkshopsView({ data, initialTab }: { data: WorkshopsData; initialTab: WorkshopsTab }) {
  const { workshops, people, teams } = data;
  const sessions = useMemo(() => sessionsOf(workshops), [workshops]);
  const [tab, setTab] = useState<WorkshopsTab>(initialTab);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  // Eligible and missing a seat in at least one session.
  const unseated = useMemo(
    () => people.filter((p) => p.eligible && sessions.some((s) => !seatIn(p, s))),
    [people, sessions],
  );
  const teamsShort = teams.filter((t) => !t.members.some((m) => m.inWorkshop)).length;

  const counts: Record<WorkshopsTab, number> = {
    workshops: workshops.length,
    unseated: unseated.length,
    teams: teamsShort,
  };

  function open(next: WorkshopsTab, query?: string) {
    setTab(next);
    if (query !== undefined) setFilters({ ...NO_FILTERS, query });
    const url = new URL(window.location.href);
    if (next === 'workshops') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    // replaceState, not the router: no server round trip to switch a tab.
    window.history.replaceState(null, '', url);
  }

  return (
    <div className="space-y-4">
      <nav className="pay-filters" aria-label="Workshop lists">
        {WORKSHOP_TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="pay-filter"
            onClick={() => open(option.value)}
            data-active={option.value === tab ? '' : undefined}
            aria-pressed={option.value === tab}
          >
            {option.label}
            <span className="pay-filter-count">{counts[option.value]}</span>
          </button>
        ))}
      </nav>

      {tab === 'workshops' && <WorkshopList workshops={workshops} people={people} sessions={sessions} />}
      {tab === 'unseated' && (
        <Unseated
          unseated={unseated}
          workshops={workshops}
          sessions={sessions}
          filters={filters}
          setFilters={setFilters}
        />
      )}
      {tab === 'teams' && <TeamsTable teams={teams} onFind={(team) => open('unseated', team)} />}
    </div>
  );
}

/* ── seat changes ───────────────────────────────────────── */

/**
 * One seat change at a time per row, with its error kept on that row. The
 * server action revalidates the page; refresh brings the new counts in.
 */
function useSeatChange() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  async function run(key: string, action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(key);
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
    const result = await action();
    if (result.ok) {
      startTransition(() => router.refresh());
    } else {
      setErrors((e) => ({ ...e, [key]: result.message }));
    }
    setBusy(null);
    return result.ok;
  }

  return { busy, errors, run };
}

/* ── Workshops tab ──────────────────────────────────────── */

function WorkshopList({
  workshops,
  people,
  sessions,
}: {
  workshops: Workshop[];
  people: WorkshopPerson[];
  sessions: number[];
}) {
  return (
    <div className="space-y-6">
      <ParticipantLookup workshops={workshops} people={people} sessions={sessions} />
      {sessions.map((session) => {
        const inSession = workshops.filter((w) => w.session === session);
        return (
          <section key={session} className="space-y-3">
            <h3 className="team-group-title">
              Session {session} · {sessionTime(workshops, session)}
              <span className="team-group-count">{inSession.length}</span>
            </h3>
            {inSession.map((workshop) => (
              <WorkshopCard
                key={workshop.id}
                workshop={workshop}
                workshops={workshops}
                people={people}
                attendees={people.filter((p) => p.seats.some((s) => s.workshopId === workshop.id))}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Who the lookup lists. */
type LookupScope = 'all' | 'seated' | 'missing';

/**
 * Every participant with the workshop they hold in each session — the same
 * scrolling list as "Add participant", but by person rather than by room. A
 * session they have no seat in can be filled from the row.
 */
function ParticipantLookup({
  workshops,
  people,
  sessions,
}: {
  workshops: Workshop[];
  people: WorkshopPerson[];
  sessions: number[];
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<LookupScope>('all');
  const [allowOver, setAllowOver] = useState(false);
  // The seat whose Remove was pressed once and now waits for the second press.
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, errors, run } = useSeatChange();

  // Who may book first, then A to Z: the unpaid can't be given a seat anyway.
  const sorted = useMemo(
    () =>
      [...people].sort(
        (a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || personName(a).localeCompare(personName(b)),
      ),
    [people],
  );

  const shown = sorted.filter((p) => {
    if (scope === 'seated' && p.seats.length === 0) return false;
    if (scope === 'missing' && (p.blocked || sessions.every((s) => seatIn(p, s)))) return false;
    return matchesQuery(p, query);
  });

  const title = (id: string) => workshops.find((w) => w.id === id)?.title ?? id;

  return (
    <section className="admin-card ws-card">
      <div className="font-medium text-white">Find a participant</div>
      <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Their workshop in each session, and a seat to give where they have none
      </div>

      <div className="ws-attendees">
        <div className="ws-add-top">
          <input
            type="search"
            className="admin-input part-search"
            placeholder="Filter by name, email, phone, branch or team"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter participants"
          />
          <select
            className="admin-input part-select part-toolbar-btn"
            value={scope}
            onChange={(e) => setScope(e.target.value as LookupScope)}
            aria-label="Which participants to list"
          >
            <option value="all">Everyone</option>
            <option value="seated">With a workshop</option>
            <option value="missing">Missing a seat</option>
          </select>
        </div>

        <div className="ws-add-foot">
          <span>
            {shown.length} participant{shown.length === 1 ? '' : 's'}
          </span>
          <label className="ws-over">
            <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} />
            Allow seats over capacity
          </label>
        </div>

        <ul className="ws-results" aria-label="Participants and their workshops">
          {shown.length === 0 && <li className="viz-empty">Nobody matches.</li>}
          {shown.map((p) => (
            <li key={p.id} className="ws-result ws-lookup">
              <span className="block min-w-0">
                <Person person={p} />
                {(p.sb || p.challengeTeam) && (
                  <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {[p.sb, p.challengeTeam].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="ws-lookup-seats">
                {sessions.map((session) => {
                  const seat = seatIn(p, session);
                  const key = `${p.id}:${session}`;
                  return (
                    <span key={session} className="ws-lookup-seat">
                      <span className="ws-lookup-label">Session {session}</span>
                      {seat ? (
                        <>
                          <span className="ws-seat ws-seat--held" title={title(seat.workshopId)}>
                            {title(seat.workshopId)}
                          </span>
                          {confirming === key ? (
                            <span className="ws-confirm">
                              <button
                                type="button"
                                className="pay-btn-reject px-3 py-1 text-xs"
                                disabled={busy === key}
                                onClick={async () => {
                                  const ok = await run(key, () =>
                                    removeWorkshopSeat({ participantId: p.id, workshopId: seat.workshopId }),
                                  );
                                  if (ok) setConfirming(null);
                                }}
                              >
                                {busy === key ? 'Removing…' : 'Free the seat'}
                              </button>
                              <button type="button" className="pay-link text-xs" onClick={() => setConfirming(null)}>
                                Keep
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="pay-link ws-remove text-xs"
                              onClick={() => setConfirming(key)}
                              aria-label={`Remove ${personName(p)} from ${title(seat.workshopId)}`}
                            >
                              Remove
                            </button>
                          )}
                          {errors[key] && <span className="ws-error">{errors[key]}</span>}
                        </>
                      ) : p.blocked ? (
                        <span className="admin-badge admin-badge--gray" title="Workshop seats are for paid, unbanned participants">
                          {p.blocked}
                        </span>
                      ) : (
                        <AssignControl
                          workshops={workshops.filter((w) => w.session === session)}
                          allowOver={allowOver}
                          busy={busy === key}
                          error={errors[key]}
                          onAssign={(workshopId) =>
                            run(key, () =>
                              assignWorkshop({ participantId: p.id, workshopId, allowOverCapacity: allowOver }),
                            )
                          }
                        />
                      )}
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WorkshopCard({
  workshop,
  workshops,
  people,
  attendees,
}: {
  workshop: Workshop;
  workshops: Workshop[];
  people: WorkshopPerson[];
  attendees: WorkshopPerson[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const { busy, errors, run } = useSeatChange();

  const shown = attendees.filter((p) => matchesQuery(p, query));

  return (
    <div className="admin-card ws-card">
      <div className="ws-card-head">
        <div className="min-w-0">
          <div className="font-medium text-white">{workshop.title}</div>
          <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {[workshop.speaker, workshop.room, `${workshop.startTime}–${workshop.endTime}`].filter(Boolean).join(' · ')}
          </div>
          {workshop.audience && (
            <span className="sess-badges">
              <span className="admin-badge admin-badge--violet">{workshop.audience}</span>
            </span>
          )}
        </div>
        <SeatMeter workshop={workshop} />
      </div>

      <div className="ws-card-actions">
        <button type="button" className="pay-link text-sm" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          {adding ? 'Done adding' : '+ Add participant'}
        </button>
        <button type="button" className="pay-link text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide attendees' : `Show attendees (${attendees.length})`}
        </button>
        <button
          type="button"
          className="pay-link text-sm"
          disabled={attendees.length === 0}
          onClick={async () =>
            downloadXlsx(await buildAttendeesXlsx(workshop, attendees), workshopsXlsxFilename(workshop.title))
          }
        >
          Export Excel
        </button>
      </div>

      {adding && <AddParticipant workshop={workshop} workshops={workshops} people={people} />}

      {open && (
        <div className="ws-attendees">
          {attendees.length > 8 && (
            <input
              type="search"
              className="admin-input part-search mb-3 w-full"
              placeholder="Search name, email or branch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search the attendees of ${workshop.title}`}
            />
          )}
          <table className="sess-table sess-table--auto text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
                <Th>Participant</Th>
                <Th>Branch</Th>
                <Th>Booked</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="viz-empty">
                    {attendees.length === 0 ? 'Nobody has a seat yet.' : 'Nobody matches.'}
                  </td>
                </tr>
              )}
              {shown.map((p) => {
                const seat = p.seats.find((s) => s.workshopId === workshop.id)!;
                const key = p.id;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Td className="sess-cell-wide">
                      <Person person={p} />
                    </Td>
                    <Td label="Branch">{p.sb ?? <Dash />}</Td>
                    <Td label="Booked" className="tabular-nums">
                      {formatBookedAt(seat.bookedAt)}
                    </Td>
                    <Td className="text-right">
                      {confirming === key ? (
                        <span className="ws-confirm">
                          <button
                            type="button"
                            className="pay-btn-reject px-3 py-1.5 text-xs"
                            disabled={busy === key}
                            onClick={() =>
                              run(key, () => removeWorkshopSeat({ participantId: p.id, workshopId: workshop.id }))
                            }
                          >
                            {busy === key ? 'Removing…' : 'Free the seat'}
                          </button>
                          <button type="button" className="pay-link text-xs" onClick={() => setConfirming(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="pay-link text-xs" onClick={() => setConfirming(key)}>
                          Remove
                        </button>
                      )}
                      {errors[key] && <span className="ws-error">{errors[key]}</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Who the add list shows: by default, only who can be seated here straight away. */
type AddScope = 'free' | 'elsewhere' | 'all';

/**
 * Where someone stands for this workshop, which orders the list: those who
 * can simply be added first, then those who would be moved here, then those
 * already here, then those who may not book.
 */
function standingFor(p: WorkshopPerson, workshop: Workshop) {
  const seat = seatIn(p, workshop.session);
  if (seat?.workshopId === workshop.id) return { rank: 2, seat, here: true };
  if (p.blocked) return { rank: 3, seat, here: false };
  return { rank: seat ? 1 : 0, seat, here: false };
}

/**
 * Everyone, as a list to pick from: open as soon as the picker is, narrowed
 * by typing. Someone who holds another workshop in this session can be
 * moved; someone who may not book is shown with why.
 */
function AddParticipant({
  workshop,
  workshops,
  people,
}: {
  workshop: Workshop;
  workshops: Workshop[];
  people: WorkshopPerson[];
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AddScope>('free');
  const [allowOver, setAllowOver] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const { busy, errors, run } = useSeatChange();

  const full = seatsLeft(workshop) === 0;

  const ranked = useMemo(
    () =>
      people
        .map((p) => ({ p, ...standingFor(p, workshop) }))
        .sort((a, b) => a.rank - b.rank || personName(a.p).localeCompare(personName(b.p))),
    [people, workshop],
  );

  const inScope = ranked.filter(({ rank }) => (scope === 'free' ? rank === 0 : scope === 'elsewhere' ? rank === 1 : true));
  const shown = inScope.filter(({ p }) => matchesQuery(p, query));

  async function assign(p: WorkshopPerson, move: boolean) {
    const ok = await run(p.id, () =>
      assignWorkshop({ participantId: p.id, workshopId: workshop.id, allowOverCapacity: allowOver, move }),
    );
    if (ok) setAdded(`${move ? 'Moved' : 'Added'} ${personName(p)}.`);
  }

  return (
    <div className="ws-attendees">
      <div className="ws-add-top">
        <input
          type="search"
          className="admin-input part-search"
          placeholder="Filter by name, email, phone, branch or team"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAdded(null);
          }}
          aria-label={`Filter the participants to add to ${workshop.title}`}
          autoFocus
        />
        <select
          className="admin-input part-select part-toolbar-btn"
          value={scope}
          onChange={(e) => setScope(e.target.value as AddScope)}
          aria-label="Which participants to list"
        >
          <option value="free">No seat in session {workshop.session}</option>
          <option value="elsewhere">In another session {workshop.session} workshop</option>
          <option value="all">Everyone</option>
        </select>
      </div>

      <div className="ws-add-foot">
        <span>
          {shown.length} participant{shown.length === 1 ? '' : 's'}
        </span>
        {full && (
          <label className="ws-over">
            <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} />
            Full — allow seats over capacity
          </label>
        )}
        {added && (
          <span className="ws-added" aria-live="polite">
            {added}
          </span>
        )}
      </div>

      <ul className="ws-results" aria-label={`Participants to add to ${workshop.title}`}>
        {shown.length === 0 && (
          <li className="viz-empty">
            {inScope.length === 0 && scope === 'free'
              ? `Everyone who can take a workshop has a seat in session ${workshop.session}.`
              : 'Nobody matches.'}
          </li>
        )}
        {shown.map(({ p, seat, here }) => {
          const elsewhere = seat && !here ? workshops.find((w) => w.id === seat.workshopId) : null;
          const blockedByCapacity = full && !allowOver;
          return (
            <li key={p.id} className="ws-result">
              <span className="block min-w-0">
                <Person person={p} />
                {(p.sb || p.challengeTeam) && (
                  <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {[p.sb, p.challengeTeam].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="ws-result-action">
                {here ? (
                  <Muted>Already here</Muted>
                ) : p.blocked ? (
                  <span className="admin-badge admin-badge--gray" title="Workshop seats are for paid, unbanned participants">
                    {p.blocked}
                  </span>
                ) : (
                  <>
                    {elsewhere && (
                      <span className="ws-result-note" title={elsewhere.title}>
                        In {elsewhere.title}
                      </span>
                    )}
                    <button
                      type="button"
                      className="admin-btn-secondary px-3 py-1.5 text-xs"
                      disabled={busy !== null || blockedByCapacity}
                      title={blockedByCapacity ? 'This workshop is full' : undefined}
                      onClick={() => assign(p, Boolean(elsewhere))}
                    >
                      {busy === p.id ? 'Saving…' : elsewhere ? 'Move here' : 'Add'}
                    </button>
                  </>
                )}
              </span>
              {errors[p.id] && <span className="ws-error ws-result-error">{errors[p.id]}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SeatMeter({ workshop }: { workshop: Workshop }) {
  const share = workshop.capacity > 0 ? Math.min(1, workshop.booked / workshop.capacity) : 1;
  const over = workshop.booked - workshop.capacity;
  const status = over > 0 ? `${over} over` : over === 0 ? 'Full' : `${seatsLeft(workshop)} left`;

  return (
    <span className="sess-meter ws-meter" title={`${workshop.booked} of ${workshop.capacity} seats taken`}>
      <span className="sess-meter-figures">
        <span>
          {workshop.booked}
          <span className="sess-meter-of"> / {workshop.capacity}</span>
        </span>
        <span className="sess-meter-rate" style={over >= 0 ? { color: 'var(--color-pink)' } : undefined}>
          {status}
        </span>
      </span>
      <span className="sess-meter-track" aria-hidden>
        <span
          className="sess-meter-fill"
          style={{ width: `${Math.round(share * 100)}%`, background: over >= 0 ? 'var(--color-pink)' : undefined }}
        />
      </span>
    </span>
  );
}

/* ── No seat yet tab ────────────────────────────────────── */

function Unseated({
  unseated,
  workshops,
  sessions,
  filters,
  setFilters,
}: {
  unseated: WorkshopPerson[];
  workshops: Workshop[];
  sessions: number[];
  filters: Filters;
  setFilters: (next: Filters) => void;
}) {
  const [allowOver, setAllowOver] = useState(false);
  const { busy, errors, run } = useSeatChange();

  const branches = useMemo(
    () => [...new Set(unseated.map((p) => p.sb).filter((sb): sb is string => Boolean(sb)))].sort(),
    [unseated],
  );

  const visible = unseated.filter((p) => {
    if (filters.sb === 'NONE' ? p.sb !== null : filters.sb !== 'ALL' && p.sb !== filters.sb) return false;
    if (filters.missing === 'all' && p.seats.length > 0) return false;
    if (filters.missing !== 'any' && filters.missing !== 'all' && seatIn(p, Number(filters.missing))) return false;
    return matchesQuery(p, filters.query);
  });

  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <>
      <div className="admin-card part-toolbar">
        <div className="part-toolbar-top">
          <input
            type="search"
            className="admin-input part-search"
            placeholder="Search name, email, branch or challenge team"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            aria-label="Search participants without a seat"
          />
          <select
            className="admin-input part-select part-toolbar-btn"
            value={filters.missing}
            onChange={(e) => setFilters({ ...filters, missing: e.target.value as Filters['missing'] })}
            aria-label="Missing a seat in"
          >
            <option value="any">Missing any session</option>
            {sessions.map((s) => (
              <option key={s} value={String(s)}>
                Missing session {s}
              </option>
            ))}
            <option value="all">No seat at all</option>
          </select>
          <select
            className="admin-input part-select part-toolbar-btn"
            value={filters.sb}
            onChange={(e) => setFilters({ ...filters, sb: e.target.value })}
            aria-label="Student branch"
          >
            <option value="ALL">Any branch</option>
            {branches.map((sb) => (
              <option key={sb} value={sb}>
                {sb}
              </option>
            ))}
            <option value="NONE">No branch</option>
          </select>
          <button
            type="button"
            className="admin-btn-secondary part-toolbar-btn py-2 text-sm"
            disabled={visible.length === 0}
            title="Download this list, as filtered, as an Excel sheet"
            onClick={async () =>
              downloadXlsx(await buildUnseatedXlsx(visible, workshops, sessions), workshopsXlsxFilename('no-seat-yet'))
            }
          >
            Export Excel
          </button>
        </div>

        <div className="part-toolbar-foot">
          <label className="ws-over">
            <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} />
            Allow seats over capacity
          </label>
          <span>
            {visible.length} of {unseated.length} shown
          </span>
          {filtered && (
            <button type="button" className="pay-link" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="sess-table sess-table--auto text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Participant</Th>
              <Th>Branch</Th>
              {sessions.map((s) => (
                <Th key={s}>
                  Session {s} · {sessionTime(workshops, s)}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={2 + sessions.length} className="viz-empty">
                  {unseated.length === 0 ? 'Everyone who can take a workshop has a seat in every session.' : 'Nobody matches these filters.'}
                </td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Td className="sess-cell-wide">
                  <Person person={p} />
                  <span className="sess-badges">
                    {p.isRas && <span className="admin-badge admin-badge--violet">RAS</span>}
                    {p.challengeTeam && (
                      <span className="admin-badge admin-badge--amber" title="Selected technical challenge team">
                        {p.challengeTeam}
                      </span>
                    )}
                  </span>
                </Td>
                <Td label="Branch">{p.sb ?? <Dash />}</Td>
                {sessions.map((session) => {
                  const seat = seatIn(p, session);
                  const key = `${p.id}:${session}`;
                  return (
                    <Td key={session} label={`Session ${session}`} className="sess-cell-wide">
                      {seat ? (
                        <span className="ws-seat" title={workshops.find((w) => w.id === seat.workshopId)?.title}>
                          {workshops.find((w) => w.id === seat.workshopId)?.title ?? seat.workshopId}
                        </span>
                      ) : (
                        <AssignControl
                          workshops={workshops.filter((w) => w.session === session)}
                          allowOver={allowOver}
                          busy={busy === key}
                          error={errors[key]}
                          onAssign={(workshopId) =>
                            run(key, () =>
                              assignWorkshop({ participantId: p.id, workshopId, allowOverCapacity: allowOver }),
                            )
                          }
                        />
                      )}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AssignControl({
  workshops,
  allowOver,
  busy,
  error,
  onAssign,
}: {
  workshops: Workshop[];
  allowOver: boolean;
  busy: boolean;
  error: string | undefined;
  onAssign: (workshopId: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const chosen = workshops.find((w) => w.id === choice);
  // A workshop that filled up since it was picked can't be assigned without the override.
  const blocked = !chosen || (seatsLeft(chosen) === 0 && !allowOver);

  return (
    <span className="ws-assign">
      <span className="ws-assign-row">
        <select
          className="admin-input part-select ws-assign-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          aria-label="Workshop to assign"
          disabled={busy}
        >
          <option value="">Choose a workshop…</option>
          {workshops.map((w) => {
            const left = seatsLeft(w);
            return (
              <option key={w.id} value={w.id} disabled={left === 0 && !allowOver}>
                {w.title} — {left > 0 ? `${left} left` : 'full'}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="admin-btn-secondary px-3 py-1.5 text-xs"
          disabled={blocked || busy}
          onClick={() => chosen && onAssign(chosen.id)}
        >
          {busy ? 'Assigning…' : 'Assign'}
        </button>
      </span>
      {error && <span className="ws-error">{error}</span>}
    </span>
  );
}

/* ── Challenge teams tab ────────────────────────────────── */

function TeamsTable({ teams, onFind }: { teams: ChallengeTeam[]; onFind: (teamName: string) => void }) {
  // Teams still short first: they are the ones to act on.
  const sorted = [...teams].sort(
    (a, b) =>
      Number(a.members.some((m) => m.inWorkshop)) - Number(b.members.some((m) => m.inWorkshop)) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Each selected technical challenge team needs at least one member in a workshop, in either session, or its
        branch loses points.
      </p>
      <div className="admin-card overflow-x-auto">
        <table className="sess-table sess-table--auto text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Team</Th>
              <Th>Branches</Th>
              <Th align="center">Status</Th>
              <Th>In a workshop</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="viz-empty">
                  No technical challenge team is selected yet.
                </td>
              </tr>
            )}
            {sorted.map((team) => {
              const inWorkshop = team.members.filter((m) => m.inWorkshop);
              const ok = inWorkshop.length > 0;
              const canSeat = team.members.filter((m) => m.eligible && !m.inWorkshop).length;
              return (
                <tr key={team.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <Td className="sess-cell-wide">
                    <span className="block font-medium text-white">{team.name}</span>
                    <span className="block text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {team.code} · {team.members.length} member{team.members.length === 1 ? '' : 's'}
                    </span>
                  </Td>
                  <Td label="Branches">
                    {[...new Set(team.members.map((m) => m.sb).filter(Boolean))].join(', ') || <Dash />}
                  </Td>
                  <Td label="Status" className="text-center">
                    {ok ? (
                      <span className="admin-badge admin-badge--green">Covered</span>
                    ) : (
                      <span className="admin-badge admin-badge--red">Nobody yet</span>
                    )}
                  </Td>
                  <Td label="In a workshop" className="sess-cell-wide">
                    {ok ? inWorkshop.map(personName).join(', ') : <Muted>—</Muted>}
                  </Td>
                  <Td className="text-right">
                    {!ok &&
                      (canSeat > 0 ? (
                        <button type="button" className="pay-link text-xs" onClick={() => onFind(team.name)}>
                          Seat a member &rarr;
                        </button>
                      ) : (
                        <Muted>No member can book</Muted>
                      ))}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── shared ─────────────────────────────────────────────── */

function Person({ person }: { person: WorkshopPerson }) {
  const name = personName(person);
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-white" title={name}>
        {name}
      </span>
      <span className="block truncate text-xs" style={{ color: 'rgba(255,255,255,0.5)' }} title={person.email}>
        {person.email}
      </span>
    </span>
  );
}

function matchesQuery(p: WorkshopPerson, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [personName(p), p.email, p.phone, p.sb, p.challengeTeam].some((field) =>
    field?.toLowerCase().includes(needle),
  );
}
