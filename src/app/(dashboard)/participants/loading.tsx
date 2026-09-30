import { LoadingHeading, TableSkeleton } from '../loading-skeletons';

// Without this, the overview's skeleton would stand in for the participants table.
export default function ParticipantsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Participants" subtitle="Loading participants…" />
      <TableSkeleton rows={8} label="Loading participants" />
    </div>
  );
}
