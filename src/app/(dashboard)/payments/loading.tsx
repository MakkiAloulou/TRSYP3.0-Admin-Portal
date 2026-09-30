import { LoadingHeading, TableSkeleton } from '../loading-skeletons';

// Filtering and paging re-query the backend, which can be slow to wake on a
// cold start. Without this, a client-side navigation leaves the previous page
// on screen with no sign anything is happening.
export default function PaymentsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Payments" subtitle="Loading queue…" />
      <TableSkeleton label="Loading payment queue" />
    </div>
  );
}
