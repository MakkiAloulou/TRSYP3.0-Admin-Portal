import type { Metadata } from 'next';
import { SessionsSubtabs } from '../sessions-subtabs';
import { CheckinMissing } from '../sessions-table';
import { getStandings } from '../standings-data';
import { parseStandingsOrder } from '../standings-types';
import { LiveStandings } from './live-standings';

export const metadata: Metadata = { title: 'Branch standings' };

/** The standings, or why they could not be read. */
async function loadStandings(sessionId: string | null) {
  try {
    return { ok: true as const, standings: await getStandings(sessionId) };
  } catch (error) {
    console.error('Could not load standings', error);
    return { ok: false as const };
  }
}

/**
 * Points each student branch has lost to check-in penalties, across every
 * session or in one. The table refreshes itself while the page is open.
 */
export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; order?: string }>;
}) {
  const params = await searchParams;
  const sessionId = params.session?.trim() || null;
  const result = await loadStandings(sessionId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Branch standings</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Points each student branch has lost: absences, late arrivals, early exits and breaks over the allowance
        </p>
      </div>

      <SessionsSubtabs />

      {!result.ok ? (
        <div className="admin-card p-6">
          <p className="pay-error">The standings could not be loaded. Refresh the page to try again.</p>
        </div>
      ) : result.standings === null ? (
        <CheckinMissing />
      ) : (
        <LiveStandings
          standings={result.standings}
          sessionId={sessionId}
          initialOrder={parseStandingsOrder(params.order)}
          // When this render read the database: the "updated" time it shows.
          loadedAt={new Date().toISOString()}
        />
      )}
    </div>
  );
}
