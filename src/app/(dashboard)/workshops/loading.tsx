import { LoadingHeading, StatTileSkeleton, TableSkeleton } from '../loading-skeletons';

export default function WorkshopsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="Workshops" subtitle="Seats booked on the website, and the participants still without one" />
      <div className="viz-kpi-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={8} label="Loading workshops" />
    </div>
  );
}
