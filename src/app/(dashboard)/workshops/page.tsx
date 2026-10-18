import type { Metadata } from 'next';
import { StatTile } from '../charts';
import { getWorkshopsData } from './workshop-data';
import { parseWorkshopsTab, seatIn, sessionsOf, type WorkshopsData } from './workshop-types';
import { WorkshopsView } from './workshops-view';

export const metadata: Metadata = { title: 'Workshops' };

/** The workshops, or why they could not be read. */
async function loadWorkshops() {
  try {
    return { ok: true as const, data: await getWorkshopsData() };
  } catch (error) {
    console.error('Could not load workshops', error);
    return { ok: false as const };
  }
}

/**
 * Day-3 workshops: who holds a seat in each, who can take one and has none
 * yet, and which technical challenge teams still need a member in one.
 */
export default async function WorkshopsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, result] = await Promise.all([searchParams, loadWorkshops()]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Workshops</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Seats booked on the website, and the participants still without one
        </p>
      </div>

      {!result.ok ? (
        <div className="admin-card p-6">
          <p className="pay-error">Workshops could not be loaded. Refresh the page to try again.</p>
        </div>
      ) : result.data === null || result.data.workshops.length === 0 ? (
        <div className="admin-card p-6">
          <p className="viz-empty">No workshops yet. They are set up on the main website.</p>
        </div>
      ) : (
        <>
          <WorkshopTiles data={result.data} />
          <WorkshopsView data={result.data} initialTab={parseWorkshopsTab(tab)} />
        </>
      )}
    </div>
  );
}

function WorkshopTiles({ data }: { data: WorkshopsData }) {
  const eligible = data.people.filter((p) => p.eligible);
  const withNone = eligible.filter((p) => p.seats.length === 0).length;
  const teamsShort = data.teams.filter((t) => !t.members.some((m) => m.inWorkshop)).length;

  return (
    <div className="viz-kpi-row">
      {sessionsOf(data.workshops).map((session) => {
        const inSession = data.workshops.filter((w) => w.session === session);
        const booked = inSession.reduce((sum, w) => sum + w.booked, 0);
        const capacity = inSession.reduce((sum, w) => sum + w.capacity, 0);
        const missing = eligible.filter((p) => !seatIn(p, session)).length;
        return (
          <StatTile
            key={session}
            label={`Session ${session}`}
            value={
              <>
                {booked}
                <span className="viz-tile-unit"> / {capacity}</span>
              </>
            }
            sub={`${Math.max(0, capacity - booked)} seats left · ${missing} without a seat`}
          />
        );
      })}
      <StatTile
        label="No workshop at all"
        value={withNone}
        accent={withNone > 0 ? 'var(--color-pink)' : undefined}
        sub={`Of ${eligible.length} who can take one`}
      />
      <StatTile
        label="Challenge teams short"
        value={teamsShort}
        accent={teamsShort > 0 ? 'var(--color-pink)' : undefined}
        sub={`Of ${data.teams.length} with no member in a workshop`}
      />
    </div>
  );
}
