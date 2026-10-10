import { TableSkeleton } from '../loading-skeletons';

// Only the table: the heading, counts and toolbar are in the layout and stay
// on screen, so a search reloads the rows without the box losing its focus.
export default function RoomsLoading() {
  return <TableSkeleton rows={8} label="Loading rooms" />;
}
