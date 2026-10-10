import Link from 'next/link';
import {
  ROOM_CAPACITY,
  ROOM_GENDERS,
  roomsHref,
  type RoomFilters,
  type RoomGender,
  type RoomOccupant,
  type RoomRow,
} from './room-types';

/**
 * One page of rooms. Read-only: rooms are formed and left on the main site,
 * so a row has nothing to open.
 */
export function RoomsTable({
  rooms,
  total,
  skip,
  take,
  filters,
  filtered,
}: {
  rooms: RoomRow[];
  total: number;
  skip: number;
  take: number;
  filters: RoomFilters;
  /** Whether a search or filter narrowed the list, for the empty message. */
  filtered: boolean;
}) {
  return (
    <div>
      <div className="admin-card overflow-x-auto">
        {/* Fixed layout, as on the participants table: planned column shares
            rather than whatever the rooms on this page happen to need. */}
        <table className="part-table room-table text-sm">
          <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th align="center">Code</Th>
              <Th align="center">Gender</Th>
              <Th align="center">Occupancy</Th>
              <Th>Owner</Th>
              <Th>Roommate</Th>
              <Th align="center">Created</Th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 && (
              <tr>
                <td colSpan={6} className="viz-empty">
                  {emptyMessage(total, filtered)}
                </td>
              </tr>
            )}
            {rooms.map((room) => (
              <tr key={room.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Td className="room-cell-code text-center">
                  <span className="room-code">{room.code}</span>
                </Td>
                <Td className="room-cell-gender text-center">
                  <GenderChip gender={room.gender} />
                </Td>
                <Td className="room-cell-occupancy text-center">
                  <Occupancy room={room} />
                </Td>
                <Td className="room-cell-owner">
                  <span className="room-cell-label">Owner</span>
                  <Occupant person={room.owner} />
                </Td>
                <Td className="room-cell-mate">
                  <span className="room-cell-label">Roommate</span>
                  {room.roommate ? (
                    <Occupant person={room.roommate} />
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                  )}
                </Td>
                <Td className="room-cell-created text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <time dateTime={room.createdAt}>{formatCreated(room.createdAt)}</time>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={total} skip={skip} take={take} count={rooms.length} filters={filters} />
    </div>
  );
}

function emptyMessage(total: number, filtered: boolean) {
  // Paged past the end, e.g. by a link kept from before rooms were left.
  if (total > 0) return 'No rooms on this page.';
  return filtered ? 'No room matches these filters.' : 'No rooms yet.';
}

function Occupancy({ room }: { room: RoomRow }) {
  const occupants = room.roommate ? 2 : 1;
  const full = occupants >= ROOM_CAPACITY;

  const status = full ? 'Full' : 'Waiting for roommate';

  // One badge, as on the team cards: the count says how full it is, and the
  // colour whether that is done — green when full, neutral while waiting.
  return (
    <span
      className={`admin-badge admin-badge--${full ? 'green' : 'gray'}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
      title={status}
      aria-label={`${occupants} of ${ROOM_CAPACITY}, ${status.toLowerCase()}`}
    >
      {occupants}/{ROOM_CAPACITY}
    </span>
  );
}

function Occupant({ person }: { person: RoomOccupant }) {
  const name = `${person.name} ${person.lastName}`;
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

function Pagination({
  total,
  skip,
  take,
  count,
  filters,
}: {
  total: number;
  skip: number;
  take: number;
  count: number;
  filters: RoomFilters;
}) {
  if (total === 0) return null;

  const from = count === 0 ? 0 : skip + 1;
  const to = skip + count;
  const prev = Math.max(0, skip - take);
  const next = skip + take;

  return (
    <div className="pay-pagination mt-4">
      <span>
        {from}&ndash;{to} of {total}
      </span>
      <span className="flex gap-2">
        {skip > 0 && (
          <Link className="admin-btn-secondary px-3 py-1.5 text-xs" href={roomsHref(filters, prev)} prefetch={false}>
            Previous
          </Link>
        )}
        {next < total && (
          <Link className="admin-btn-secondary px-3 py-1.5 text-xs" href={roomsHref(filters, next)} prefetch={false}>
            Next
          </Link>
        )}
      </span>
    </div>
  );
}

const GENDER_CHIP: Record<RoomGender, string> = {
  male: 'admin-badge--green',
  female: 'admin-badge--pink',
};

function GenderChip({ gender }: { gender: string }) {
  const known = ROOM_GENDERS.find((g) => g.value === gender);
  // Anything the backend should never send stays readable, in neutral grey.
  return (
    <span className={`admin-badge ${known ? GENDER_CHIP[known.value] : 'admin-badge--gray'}`}>
      {known?.label ?? gender}
    </span>
  );
}

function formatCreated(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'center' }) {
  return (
    <th
      className={`px-4 py-3 text-xs uppercase tracking-wide ${align === 'center' ? 'text-center' : 'text-left'}`}
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} style={style}>
      {children}
    </td>
  );
}
