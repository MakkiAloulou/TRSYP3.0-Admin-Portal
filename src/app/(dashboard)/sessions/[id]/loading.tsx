import { LoadingHeading, Skeleton, StatTileSkeleton, TableSkeleton } from '../../loading-skeletons';

export default function SessionLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="skeleton-text" style={{ width: 110 }} />
      <LoadingHeading subtitle="Loading who came and who did not" />
      <div className="viz-kpi-row viz-kpi-row--three">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={8} label="Loading the session" />
    </div>
  );
}
