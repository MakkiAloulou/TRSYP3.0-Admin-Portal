import 'server-only';
import { prisma } from '@/lib/prisma';
import { withCheckerNames } from '@/lib/ieee-checkers';
import { apiFetch } from '@/lib/trsyp-api';
import { derivePaymentState, latestProofPerParticipant, type PaymentProofRow } from '@/lib/payment';
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
 * Each member carries a payment state, built the participants page's way: the
 * `paid` flag plus the status of their newest proof. If the proofs can't be
 * loaded, members fall back to paid / not paid.
 */
export async function getTeamsByActivity(activity: TeamActivity): Promise<TeamRow[]> {
  const [teams, proofs] = await Promise.all([
    prisma.team.findMany({
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
    }),
    apiFetch<{ data: PaymentProofRow[] }>('/payment/admin/proofs?take=1000'),
  ]);

  const latestStatus = new Map(
    proofs.ok ? latestProofPerParticipant(proofs.data.data).map((p) => [p.participantId, p.status]) : [],
  );

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
      payment: derivePaymentState(paid, latestStatus.get(id) ?? null),
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
