'use client';

import { useState } from 'react';
import { buildParticipantsCsv, downloadCsv, participantsCsvFilename } from './export-csv';

type InternationalInfo = {
  dateOfBirth: string;
  countryOfResidence: string;
  cityOfResidence: string;
  affiliation: string;
  expectedArrivalDate: string;
  expectedDepartureDate: string;
  requiresVisaLetter: boolean;
  visaApplication: { status: string } | null;
};

type Membership = {
  activity: 'COMPETITION' | 'CHALLENGE';
  team: { name: string; code: string; leaderId: string };
};

export type ParticipantRow = {
  id: string;
  ieeeId: number | null;
  phone: string;
  gender: string;
  paid: boolean;
  isInternational: boolean;
  banned: boolean;
  participantType: string;
  sb: string | null;
  country: string;
  memberships: Membership[];
  room: { id: string; status: string } | null;
  internationalInfo: InternationalInfo | null;
  user: {
    name: string;
    lastName: string;
    email: string;
    active: boolean;
    createdAt: string;
  };
};

export function ParticipantsTable({ participants }: { participants: ParticipantRow[] }) {
  const [selected, setSelected] = useState<ParticipantRow | null>(null);

  function handleExport() {
    downloadCsv(buildParticipantsCsv(participants), participantsCsvFilename());
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          className="admin-btn-secondary px-4 py-2 text-sm"
          onClick={handleExport}
          disabled={participants.length === 0}
        >
          Export CSV
        </button>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,232,122,0.12)' }}>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Type</Th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => (
              <tr
                key={participant.id}
                onClick={() => setSelected(participant)}
                className="admin-row"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <Td className="font-medium text-white">
                  {participant.user.name} {participant.user.lastName}
                </Td>
                <Td style={{ color: 'rgba(255,255,255,0.5)' }}>{participant.user.email}</Td>
                <Td>
                  <TypeBadge participantType={participant.participantType} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <ParticipantDetailModal participant={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function TypeBadge({ participantType }: { participantType: string }) {
  if (participantType === 'NonIEEE') {
    return <span className="admin-badge admin-badge--green">{participantType}</span>;
  }
  if (participantType === 'Student') {
    return <span className="admin-badge admin-badge--pink">{participantType}</span>;
  }
  return <span className="admin-badge admin-badge--gray">{participantType}</span>;
}

function ParticipantDetailModal({ participant: p, onClose }: { participant: ParticipantRow; onClose: () => void }) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="admin-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="mb-5">
          <h3 className="admin-heading text-lg text-white">
            {p.user.name} {p.user.lastName}
          </h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {p.user.email}
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {!p.user.active && <span className="admin-badge admin-badge--gray">Unverified</span>}
          <TypeBadge participantType={p.participantType} />
          {p.paid && <span className="admin-badge admin-badge--green">Paid</span>}
          {p.banned && <span className="admin-badge admin-badge--pink">Banned</span>}
          {p.isInternational && <span className="admin-badge admin-badge--pink">International</span>}
        </div>

        <div className="space-y-4">
          <DetailGrid>
            <Detail label="Phone" value={p.phone} />
            <Detail label="Gender" value={p.gender} />
            <Detail label="Country" value={p.country} />
            <Detail label="Student Branch" value={p.sb ?? '—'} />
            <Detail label="IEEE ID" value={p.ieeeId?.toString() ?? '—'} />
            <Detail label="Competition Team" value={teamLabel(p, 'COMPETITION')} />
            <Detail label="Challenge Team" value={teamLabel(p, 'CHALLENGE')} />
            <Detail label="Room" value={p.room ? p.room.status : '—'} />
          </DetailGrid>

          {p.internationalInfo && (
            <div>
              <h4
                className="admin-heading mb-2 text-xs uppercase"
                style={{ color: 'var(--color-pink)', letterSpacing: '0.1em' }}
              >
                International Info
              </h4>
              <DetailGrid>
                <Detail label="Date of Birth" value={formatDate(p.internationalInfo.dateOfBirth)} />
                <Detail label="Residence" value={p.internationalInfo.cityOfResidence} />
                <Detail label="Country of Residence" value={p.internationalInfo.countryOfResidence} />
                <Detail label="Affiliation" value={p.internationalInfo.affiliation} />
                <Detail label="Arrival" value={formatDate(p.internationalInfo.expectedArrivalDate)} />
                <Detail label="Departure" value={formatDate(p.internationalInfo.expectedDepartureDate)} />
                <Detail label="Visa Letter Needed" value={p.internationalInfo.requiresVisaLetter ? 'Yes' : 'No'} />
                <Detail label="Visa Status" value={p.internationalInfo.visaApplication?.status ?? '—'} />
              </DetailGrid>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Name (CODE) — Leader" for the participant's team in one activity, or "—". */
function teamLabel(p: ParticipantRow, activity: Membership['activity']) {
  const membership = p.memberships.find((m) => m.activity === activity);
  if (!membership) return '—';

  const isLeader = membership.team.leaderId === p.id;
  return `${membership.team.name} (${membership.team.code})${isLeader ? ' — Leader' : ''}`;
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
