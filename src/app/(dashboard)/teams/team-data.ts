import 'server-only';
import { prisma } from '@/lib/prisma';
import { withCheckerNames } from '@/lib/ieee-checkers';
import { getAllProofs } from '@/lib/payment-proofs';
import { derivePaymentState, latestProofPerParticipant } from '@/lib/payment';
import type { TeamActivity } from '@prisma/client';
import type { TeamRow } from './team-types';

const memberSelect = {
  id: true,
  paid: true,
  user: { select: { name: true, lastName: true } },
} as const;

/**
 * Loads every team for one activity, flattening `memberships` into the plain
 * member list the grid renders. Teams are scoped by `Team.activity`, so the
 * competition, challenge and hackathon pages never see each other's rows.
 *
 * Database only, so it returns fast: a member's payment is known here only
 * when they are `paid`, and is null (still loading) otherwise. withPayments
 * fills in the rest from the payments service.
 */
export async function getTeamsByActivity(activity: TeamActivity): Promise<TeamRow[]> {
  const teams = await prisma.team.findMany({
      where: { activity },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        size: true,
        leaderId: true,
        axis: true,
        submissionUrl: true,
        submittedAt: true,
        leader: { select: memberSelect },
        memberships: {
          orderBy: { createdAt: 'asc' },
          select: { participant: { select: memberSelect } },
        },
      },
  });

  return teams.map((team) => {
    const people = team.memberships.map((m) => m.participant);

    // Whether the leader also gets a membership row is the registration app's
    // call; listing them first when they don't keeps the card from hiding them.
    if (!people.some((m) => m.id === team.leaderId)) {
      people.unshift(team.leader);
    }

    const members = people.map(({ id, user, paid }) => ({
      id,
      user,
      paid,
      // Paid is final, so it needs no proof to show; the rest wait for one.
      payment: paid ? ('PAID' as const) : null,
    }));

    return {
      id: team.id,
      name: team.name,
      code: team.code,
      size: team.size,
      leaderId: team.leaderId,
      axis: team.axis,
      submissionUrl: team.submissionUrl,
      submittedAt: team.submittedAt?.toISOString() ?? null,
      members,
    };
  });
}

/**
 * Each member's full payment state, built the participants page's way: the
 * `paid` flag plus the status of their newest proof. If the proofs can't be
 * loaded, members fall back to paid / not paid.
 */
export async function withPayments(teams: TeamRow[]): Promise<TeamRow[]> {
  const proofs = await getAllProofs();
  const latestStatus = new Map(
    proofs.ok ? latestProofPerParticipant(proofs.data.data).map((p) => [p.participantId, p.status]) : [],
  );

  return teams.map((team) => ({
    ...team,
    members: team.members.map((m) => ({
      ...m,
      payment: derivePaymentState(m.paid, latestStatus.get(m.id) ?? null),
    })),
  }));
}

/**
 * Loads all participants who are registered in a specific activity (COMPETITION, CHALLENGE or FABLAB),
 * including their team membership information.
 */
export async function getParticipantsByActivity(activity: TeamActivity) {
  const participants = await prisma.participant.findMany({
    where: {
      memberships: {
        some: {
          activity,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
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
      // Latest IEEE check, for the export's IEEE columns.
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
      // One membership per activity (DB-enforced), so this is at most 3 rows.
      memberships: {
        select: {
          activity: true,
          // axis/submission are only set on FABLAB teams — the hackathon export uses them.
          team: {
            select: { name: true, code: true, leaderId: true, axis: true, submissionUrl: true, submittedAt: true },
          },
        },
      },
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
      user: {
        select: {
          name: true,
          lastName: true,
          email: true,
          active: true,
          createdAt: true,
        },
      },
    },
  });

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the export needs for CSV anyway.
  return JSON.parse(JSON.stringify(await withCheckerNames(participants)));
}
