// Kept apart from room-data.ts, which is server-only: the toolbar runs in the
// browser and reads and writes the same filters through the URL.

/** Every room is a double; the owner takes one of the two places. */
export const ROOM_CAPACITY = 2;

export type RoomGender = 'male' | 'female';

export const ROOM_GENDERS: { value: RoomGender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export type RoomOccupant = {
  id: string;
  name: string;
  lastName: string;
  email: string;
};

export type RoomRow = {
  id: string;
  code: string;
  /** 'male' or 'female', copied from the owner; both occupants share it. */
  gender: string;
  createdAt: string;
  owner: RoomOccupant;
  /** Null while the room waits for someone to join with its code. */
  roommate: RoomOccupant | null;
};

/** A count, and the same count for each gender. */
export type GenderSplit = { total: number } & Record<RoomGender, number>;

export type RoomStats = {
  rooms: GenderSplit;
  full: GenderSplit;
  waiting: GenderSplit;
};

export type RoomFilters = {
  search: string;
  gender: RoomGender | 'all';
  status: 'all' | 'full' | 'waiting';
};

export const NO_ROOM_FILTERS: RoomFilters = { search: '', gender: 'all', status: 'all' };

/** Reads the filters from the URL; anything unrecognised means "all". */
export function parseRoomFilters(raw: {
  search?: string | null;
  gender?: string | null;
  status?: string | null;
}): RoomFilters {
  const gender = ROOM_GENDERS.some((g) => g.value === raw.gender) ? (raw.gender as RoomGender) : 'all';
  const status = raw.status === 'full' || raw.status === 'waiting' ? raw.status : 'all';
  return { search: (raw.search ?? '').trim(), gender, status };
}

/** Whether a search or filter narrows the list. */
export function isRoomsFiltered(filters: RoomFilters) {
  return roomsHref(filters) !== roomsHref(NO_ROOM_FILTERS);
}

/** The page's URL for these filters, leaving defaults out so it stays short. */
export function roomsHref(filters: RoomFilters, skip = 0) {
  const params = new URLSearchParams();
  const search = filters.search.trim();

  if (search) params.set('search', search);
  if (filters.gender !== 'all') params.set('gender', filters.gender);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (skip > 0) params.set('skip', String(skip));

  const query = params.toString();
  return query ? `/rooms?${query}` : '/rooms';
}
