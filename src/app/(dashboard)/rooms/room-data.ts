import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { GenderSplit, RoomFilters, RoomGender, RoomRow, RoomStats } from './room-types';

export const ROOMS_TAKE = 20;

const occupantSelect = {
  id: true,
  user: { select: { name: true, lastName: true, email: true } },
} as const;

/**
 * A room whose second place is taken. The roommate is the resident who owns no
 * room: a participant is in one room at most and an owner is always in the one
 * they own, so within a room that means "not the owner" — a comparison Prisma
 * cannot make across the relation.
 */
const HAS_ROOMMATE = { residents: { some: { ownedRoom: { is: null } } } } satisfies Prisma.RoomWhereInput;

function whereFor({ search, gender, status }: RoomFilters): Prisma.RoomWhereInput {
  const conditions: Prisma.RoomWhereInput[] = [];

  if (gender !== 'all') conditions.push({ gender });
  if (status === 'full') conditions.push(HAS_ROOMMATE);
  if (status === 'waiting') conditions.push({ NOT: HAS_ROOMMATE });

  if (search) {
    const contains = { contains: search, mode: 'insensitive' } as const;
    const person = { user: { OR: [{ name: contains }, { lastName: contains }, { email: contains }] } };
    // The owner is a resident too; asking for them by the owner relation as
    // well keeps search in step with the Owner column whatever `roomId` says.
    conditions.push({ OR: [{ code: contains }, { owner: person }, { residents: { some: person } }] });
  }

  return { AND: conditions };
}

/**
 * One page of rooms matching `filters`, newest first, and how many match in
 * all. Filtering, paging and counting all happen in the database.
 */
export async function getRooms(filters: RoomFilters, skip: number): Promise<{ rooms: RoomRow[]; total: number }> {
  const where = whereFor(filters);

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      // The id breaks ties, so a room never shows on two pages or neither.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take: ROOMS_TAKE,
      select: {
        id: true,
        code: true,
        gender: true,
        ownerId: true,
        createdAt: true,
        owner: { select: occupantSelect },
        residents: { select: occupantSelect },
      },
    }),
    prisma.room.count({ where }),
  ]);

  return {
    total,
    rooms: rooms.map((room) => {
      // The owner comes from their own relation, so they lead the row even if
      // their `roomId` were ever out of step with the room.
      const roommate = room.residents.find((r) => r.id !== room.ownerId);
      return {
        id: room.id,
        code: room.code,
        gender: room.gender,
        createdAt: room.createdAt.toISOString(),
        owner: toOccupant(room.owner),
        roommate: roommate ? toOccupant(roommate) : null,
      };
    }),
  };
}

/** A room as the export lists it: its gender and the two names. */
export type RoomPair = { gender: string; owner: string; roommate: string };

/**
 * Every room matching `filters`, not just a page of them, in the table's
 * order. The roommate's name is empty while the room waits for one.
 */
export async function getRoomPairs(filters: RoomFilters): Promise<RoomPair[]> {
  const rooms = await prisma.room.findMany({
    where: whereFor(filters),
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      gender: true,
      ownerId: true,
      owner: { select: occupantSelect },
      residents: { select: occupantSelect },
    },
  });

  return rooms.map((room) => {
    const roommate = room.residents.find((r) => r.id !== room.ownerId);
    return {
      gender: room.gender,
      owner: fullName(room.owner.user),
      roommate: roommate ? fullName(roommate.user) : '',
    };
  });
}

function fullName(user: { name: string; lastName: string }) {
  return `${user.name} ${user.lastName}`.trim();
}

/**
 * Every room counted by gender, and the full ones likewise; the rest are
 * waiting. Two grouped counts, so the totals never need the rooms themselves.
 */
export async function getRoomStats(): Promise<RoomStats> {
  const [all, full] = await Promise.all([
    prisma.room.groupBy({ by: ['gender'], _count: { _all: true } }),
    prisma.room.groupBy({ by: ['gender'], where: HAS_ROOMMATE, _count: { _all: true } }),
  ]);

  const rooms = splitByGender(all);
  const fullRooms = splitByGender(full);

  return {
    rooms,
    full: fullRooms,
    waiting: {
      total: rooms.total - fullRooms.total,
      male: rooms.male - fullRooms.male,
      female: rooms.female - fullRooms.female,
    },
  };
}

function splitByGender(groups: { gender: string; _count: { _all: number } }[]): GenderSplit {
  const count = (gender: RoomGender) => groups.find((g) => g.gender === gender)?._count._all ?? 0;
  return {
    // Every group, so a room with an unexpected gender still counts once.
    total: groups.reduce((sum, g) => sum + g._count._all, 0),
    male: count('male'),
    female: count('female'),
  };
}

function toOccupant({ id, user }: { id: string; user: { name: string; lastName: string; email: string } }) {
  return { id, name: user.name, lastName: user.lastName, email: user.email };
}
