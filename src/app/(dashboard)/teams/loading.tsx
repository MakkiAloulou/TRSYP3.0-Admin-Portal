import { LoadingHeading, Skeleton } from '../loading-skeletons';

// Covers all three activity pages, so the title is a placeholder rather than
// guessing which one is loading.
export default function TeamsLoading() {
  return (
    <div className="space-y-4">
      <LoadingHeading subtitle="Loading teams…" />

      <div className="loading-late grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, card) => (
          <div key={card} className="admin-card flex flex-col gap-3 p-5">
            <Skeleton className="skeleton-text" style={{ width: '55%', height: 14 }} />
            <Skeleton className="skeleton-text" style={{ width: '30%' }} />
            {Array.from({ length: 3 }).map((_, member) => (
              <Skeleton key={member} style={{ height: 32 }} />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">Loading teams</span>
    </div>
  );
}
