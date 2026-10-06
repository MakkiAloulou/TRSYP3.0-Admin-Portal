import type { Metadata } from 'next';
import { getTeamsByActivity, getParticipantsByActivity } from '../team-data';
import { getAllProofs } from '@/lib/payment-proofs';
import { StreamedTeamsGrid } from '../teams-grid';
import { TeamExportButton } from '../team-export-button';

export const metadata: Metadata = { title: 'Competition teams' };

export default async function CompetitionTeamsPage() {
  // The member icons need the payments service; start it with the database
  // queries so the streamed grid finds it already on its way.
  void getAllProofs();

  const [teams, participants] = await Promise.all([
    getTeamsByActivity('COMPETITION'),
    getParticipantsByActivity('COMPETITION'),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="admin-heading text-lg text-white">Competition Teams</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {teams.length} teams, {participants.length} participants
          </p>
        </div>
        <TeamExportButton activity="COMPETITION" participants={participants} />
      </div>

      <StreamedTeamsGrid teams={teams} />
    </div>
  );
}
