import type { Metadata } from 'next';
import { getCompetitionTeams, getGames, getRoundDetail, getRounds } from './aruco-data';
import { GamesPanel } from './games-panel';
import { RoundPicker, RoundView } from './round-view';

export const metadata: Metadata = { title: 'ArUco' };

/** The value, or null (logged) when it could not be read. */
async function attempt<T>(what: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    console.error(`Could not load ${what}`, error);
    return null;
  }
}

export default async function ArucoPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const params = await searchParams;
  const [games, teams, rounds] = await Promise.all([
    attempt('the ArUco games', getGames),
    attempt('the Competition teams', getCompetitionTeams),
    attempt('the ArUco rounds', getRounds),
  ]);

  const live = rounds?.find((r) => r.endedAt === null) ?? null;
  // The round asked for, else the live one, else the latest.
  const selectedId = rounds?.find((r) => r.id === params.round)?.id ?? live?.id ?? rounds?.[0]?.id ?? null;
  const detail = selectedId ? await attempt('the ArUco round', () => getRoundDetail(selectedId)) : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">ArUco</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {live
            ? `Live: ${live.title}, for ${live.teamCount} team${live.teamCount === 1 ? '' : 's'}`
            : 'No game running: /aruco is closed'}
        </p>
      </div>

      {games && teams ? (
        <GamesPanel games={games} teams={teams} live={live} />
      ) : (
        <LoadError>
          The games could not be loaded. If the backend hasn&apos;t been deployed since the games were added, its
          migrations (20261018020000_aruco_rounds, 20261018030000_aruco_mine_games) haven&apos;t run yet.
        </LoadError>
      )}

      {rounds && rounds.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="admin-heading text-sm text-white">Rounds</h3>
          <RoundPicker rounds={rounds} selected={selectedId} />
          {detail ? <RoundView round={detail} /> : <LoadError>This round could not be loaded.</LoadError>}
        </div>
      )}
    </div>
  );
}

function LoadError({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-card p-6">
      <p className="pay-error">{children}</p>
    </div>
  );
}
