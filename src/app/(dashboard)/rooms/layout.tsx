import { Suspense } from 'react';
import { StatTile } from '../charts';
import { StatTileSkeleton } from '../loading-skeletons';
import { getRoomStats } from './room-data';
import type { GenderSplit } from './room-types';
import { RoomsToolbar } from './rooms-toolbar';

// The counts and the toolbar stay put while the table beneath them reloads for
// each search, filter and page — as the teams tabs do — so the search box
// keeps its focus and the counts don't flash. Layouts don't re-render on
// navigation, which is also why the counts are of every room, not the filtered
// ones: the table's pager says how many match.
export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Rooms</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Doubles formed on the main site with a room code
        </p>
      </div>

      <div className="viz-kpi-row viz-kpi-row--three">
        <Suspense
          fallback={
            <>
              <StatTileSkeleton />
              <StatTileSkeleton />
              <StatTileSkeleton />
            </>
          }
        >
          <RoomStatTiles />
        </Suspense>
      </div>

      <RoomsToolbar />
      {children}
    </div>
  );
}

async function RoomStatTiles() {
  // A failed count must not take the table down with it.
  const stats = await getRoomStats().catch((error: unknown) => {
    console.error('Could not count rooms', error);
    return null;
  });

  if (!stats) {
    return (
      <>
        <StatTile label="Rooms" value="—" sub="Could not load the counts" />
        <StatTile label="Full" value="—" />
        <StatTile label="Waiting for roommate" value="—" />
      </>
    );
  }

  return (
    <>
      <StatTile label="Rooms" value={stats.rooms.total} sub={byGender(stats.rooms)} />
      <StatTile label="Full" value={stats.full.total} sub={byGender(stats.full)} />
      <StatTile label="Waiting for roommate" value={stats.waiting.total} sub={byGender(stats.waiting)} />
    </>
  );
}

function byGender(split: GenderSplit) {
  return `${split.male} male · ${split.female} female`;
}
