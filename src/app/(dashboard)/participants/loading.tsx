import { LoadingHeading, Skeleton, TableSkeleton } from '../loading-skeletons';

// Without this, the overview's skeleton would stand in for the participants
// table. The toolbar is drawn too, so the table doesn't drop when it arrives.
export default function ParticipantsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Participants" subtitle="Loading participants…" />

      <div className="admin-card part-toolbar loading-late">
        <div className="part-toolbar-top">
          <Skeleton style={{ flex: 1, height: 38 }} />
          <Skeleton className="part-toolbar-btn" style={{ height: 38 }} />
          <Skeleton className="part-toolbar-btn" style={{ height: 38 }} />
        </div>
        <div className="part-toolbar-filters">
          {Array.from({ length: 5 }).map((_, select) => (
            <Skeleton key={select} style={{ height: 34 }} />
          ))}
        </div>
        <Skeleton className="skeleton-text" style={{ width: 110 }} />
      </div>

      <TableSkeleton rows={8} label="Loading participants" />
    </div>
  );
}
