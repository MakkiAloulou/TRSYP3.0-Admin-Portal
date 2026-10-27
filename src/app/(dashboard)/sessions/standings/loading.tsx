import { LoadingHeading, TableSkeleton } from '../../loading-skeletons';
import { SessionsSubtabs } from '../sessions-subtabs';

export default function StandingsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading
        title="Branch standings"
        subtitle="Points each student branch has lost: absences, late arrivals, early exits and breaks over the allowance"
      />
      <SessionsSubtabs />
      <TableSkeleton rows={10} label="Loading the standings" />
    </div>
  );
}
