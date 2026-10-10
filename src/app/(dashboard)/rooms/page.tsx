import type { Metadata } from 'next';
import { ROOMS_TAKE, getRooms } from './room-data';
import { isRoomsFiltered, parseRoomFilters } from './room-types';
import { RoomsTable } from './rooms-table';

export const metadata: Metadata = { title: 'Rooms' };

type SearchParams = {
  search?: string;
  gender?: string;
  status?: string;
  skip?: string;
};

function parseSkip(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** The rooms, or why they could not be read. */
async function loadRooms(...args: Parameters<typeof getRooms>) {
  try {
    return { ok: true as const, ...(await getRooms(...args)) };
  } catch (error) {
    console.error('Could not load rooms', error);
    return { ok: false as const };
  }
}

// The heading, counts and toolbar live in layout.tsx; this is the table they
// sit over, re-rendered for each search, filter and page.
export default async function RoomsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseRoomFilters(params);
  const skip = parseSkip(params.skip);

  const result = await loadRooms(filters, skip);

  if (!result.ok) {
    return (
      <div className="admin-card p-6">
        <p className="pay-error">Rooms could not be loaded. Refresh the page to try again.</p>
      </div>
    );
  }

  return (
    <RoomsTable
      rooms={result.rooms}
      total={result.total}
      skip={skip}
      take={ROOMS_TAKE}
      filters={filters}
      filtered={isRoomsFiltered(filters)}
    />
  );
}
