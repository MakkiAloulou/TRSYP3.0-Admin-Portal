import { prisma } from '@/lib/prisma';
import { UsersTable } from './users-table';

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      lastName: true,
      email: true,
      active: true,
      createdAt: true,
      participant: {
        select: {
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
        },
      },
    },
  });

  // JSON round-trip keeps Server -> Client Component props simple: Dates
  // become ISO strings, which is all the modal needs for display anyway.
  const serialized = JSON.parse(JSON.stringify(users));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="admin-heading text-lg text-white">Users</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {users.length} total
        </p>
      </div>

      <UsersTable users={serialized} />
    </div>
  );
}
