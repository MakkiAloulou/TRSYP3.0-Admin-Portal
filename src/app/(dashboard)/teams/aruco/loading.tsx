import { LoadingHeading, TableSkeleton } from '../../loading-skeletons';

// The teams loading screen is a grid of team cards; this page is a register.
export default function ArucoLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading title="ArUco" subtitle="Loading the register…" />
      <TableSkeleton rows={8} label="Loading the ArUco register" />
    </div>
  );
}
