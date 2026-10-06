import 'server-only';
import { prisma } from '@/lib/prisma';
import { withCheckerNames } from '@/lib/ieee-checkers';
import type { ParticipantListRow, ParticipantRow } from './participants-table';

/*
 * Two shapes of the same participant. The database is far from the app (every
 * byte crosses a WAN link through the pooler), so the list loads only what the
 * table shows, searches and filters on; the full record is fetched for one
 * participant when their details open, and for the visible rows on export.
 */

/** One membership per activity (DB-enforced), so this is at most 3 rows. */
const membershipSelect = {
  select: {
    activity: true,
    team: { select: { name: true, code: true, leaderId: true } },
  },
} as const;

/** What the table needs. */
const LIST_SELECT = {
  id: true,
  ieeeId: true,
  phone: true,
  paid: true,
  banned: true,
  isInternational: true,
  participantType: true,
  isRas: true,
  sb: true,
  country: true,
  memberships: membershipSelect,
  // Only the claimed* snapshot: enough to tell whether IEEE's answer still
  // applies to the profile as it stands, which is all the table shows.
  ieeeVerification: {
    select: { claimedIeeeId: true, claimedType: true, claimedIsRas: true, claimedEmail: true },
  },
  user: { select: { name: true, lastName: true, email: true, active: true } },
} as const;

/** Everything the details popup and the CSV export show. */
const FULL_SELECT = {
  id: true,
  ieeeId: true,
  phone: true,
  gender: true,
  paid: true,
  isInternational: true,
  banned: true,
  participantType: true,
  isRas: true,
  careerStage: true,
  sb: true,
  country: true,
  memberships: membershipSelect,
  room: { select: { id: true, status: true } },
  internationalInfo: {
    select: {
      dateOfBirth: true,
      countryOfResidence: true,
      cityOfResidence: true,
      affiliation: true,
      expectedArrivalDate: true,
      expectedDepartureDate: true,
      requiresVisaLetter: true,
      visaApplication: { select: { status: true } },
    },
  },
  // Latest IEEE membership check. The claimed* snapshot is what lets the
  // details tell a still-valid result from one the participant has since
  // invalidated by editing their profile.
  ieeeVerification: {
    select: {
      status: true,
      memberStatus: true,
      grade: true,
      societies: true,
      firstInitial: true,
      lastInitial: true,
      matchedBy: true,
      issues: true,
      checkedAt: true,
      checkedBy: true,
      claimedIeeeId: true,
      claimedType: true,
      claimedIsRas: true,
      claimedEmail: true,
    },
  },
  // The main site's avatar settings, drawn in the details popup.
  user: { select: { name: true, lastName: true, email: true, active: true, createdAt: true, avatar: true } },
} as const;

/** Every participant, newest first, in the table's shape. */
export async function loadParticipantList(): Promise<ParticipantListRow[]> {
  const participants = await prisma.participant.findMany({ orderBy: { createdAt: 'desc' }, select: LIST_SELECT });

  return participants.map(({ ieeeVerification: v, ...p }) => ({
    ...p,
    // The same test deriveIeeeState applies before reading a result: a row
    // checked against details the participant has since changed no longer counts.
    ieeeVerified:
      v !== null &&
      v.claimedIeeeId === p.ieeeId &&
      v.claimedType === p.participantType &&
      v.claimedIsRas === p.isRas &&
      v.claimedEmail.toLowerCase() === p.user.email.toLowerCase(),
    latestProof: null,
  }));
}

/** Full records for the given participants, in no particular order. */
export async function loadParticipantDetails(ids: string[]): Promise<ParticipantRow[]> {
  const participants = await prisma.participant.findMany({ where: { id: { in: ids } }, select: FULL_SELECT });

  // JSON round-trip keeps Server -> Client hand-off simple: Dates become ISO
  // strings, which is all the popup and the export need. Admin ids in
  // checked_by become names before anything reaches the client.
  const named = JSON.parse(JSON.stringify(await withCheckerNames(participants)));
  return named.map((p: Omit<ParticipantRow, 'latestProof'>) => ({ ...p, latestProof: null }));
}
