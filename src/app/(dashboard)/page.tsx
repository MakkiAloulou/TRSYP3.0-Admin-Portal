import { prisma } from '@/lib/prisma';
import { ParticipantsTable } from './participants-table';

export default async function ParticipantsPage() {
  const participants = await prisma.participant.findMany({
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
      sb: true,
      country: true,
      team: { select: { name: true, code: true } },
      ownedTeam: { select: { name: true, code: true } },
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
  // become ISO strings, which is all the modal needs for display anyway.
  const serialized = JSON.parse(JSON.stringify(participants));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Participants</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {participants.length} total
        </p>
      </div>

      <ParticipantsTable participants={serialized} />
    </div>
  );
}