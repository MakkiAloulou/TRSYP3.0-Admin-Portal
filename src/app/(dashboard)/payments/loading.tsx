import { LoadingHeading, Skeleton, StatTileSkeleton, TableSkeleton } from '../loading-skeletons';

// Filtering and paging re-query the backend, which can be slow to wake on a
// cold start. Without this, a client-side navigation leaves the previous page
// on screen with no sign anything is happening. The money tiles, queue tabs
// and toolbar are drawn too, so the table doesn't drop when they arrive.
export default function PaymentsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Payments" subtitle="Loading queue…" />

      <div className="viz-kpi-row viz-kpi-row--four loading-late">
        {Array.from({ length: 4 }).map((_, tile) => (
          <StatTileSkeleton key={tile} />
        ))}
      </div>

      <div className="pay-filters loading-late">
        {[118, 128, 118, 74].map((width, tab) => (
          <Skeleton key={tab} style={{ width, height: 33, borderRadius: 999 }} />
        ))}
      </div>

      <div className="admin-card part-toolbar loading-late">
        <div className="part-toolbar-top">
          <Skeleton style={{ flex: 1, height: 38 }} />
          <Skeleton className="part-toolbar-btn" style={{ height: 38 }} />
          <Skeleton className="part-toolbar-btn" style={{ height: 38 }} />
        </div>
      </div>

      <TableSkeleton label="Loading payment queue" />
    </div>
  );
}
