import { LoadingHeading, Skeleton, TableSkeleton } from '../loading-skeletons';

// Filtering and paging re-query the backend, which can be slow to wake on a
// cold start. Without this, a client-side navigation leaves the previous page
// on screen with no sign anything is happening. The queue tabs are drawn too,
// so the table doesn't drop when they arrive.
export default function PaymentsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Payments" subtitle="Loading queue…" />

      <div className="pay-filters loading-late">
        {[118, 128, 118, 74].map((width, tab) => (
          <Skeleton key={tab} style={{ width, height: 33, borderRadius: 999 }} />
        ))}
      </div>

      <TableSkeleton label="Loading payment queue" />
    </div>
  );
}
