import { LoadingHeading, StatTileSkeleton, TableSkeleton } from '../loading-skeletons';

export default function SessionsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Sessions" subtitle="Attendance as the check-in app recorded it. Times are Tunis time." />
      <div className="viz-kpi-row viz-kpi-row--three">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <TableSkeleton rows={8} label="Loading sessions" />
    </div>
  );
}
