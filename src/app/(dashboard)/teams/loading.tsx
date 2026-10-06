import { LoadingHeading, Skeleton } from '../loading-skeletons';

// Covers all three activity pages, so the title is a placeholder rather than
// guessing which one is loading. The export button sits where the real one
// will, at the right of the heading.
export default function TeamsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <LoadingHeading subtitle="Loading teams…" />
        <Skeleton className="loading-late" style={{ width: 110, height: 38 }} />
      </div>

      <div className="loading-late grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, card) => (
          <div key={card} className="admin-card flex flex-col gap-3 p-5">
            <Skeleton className="skeleton-text" style={{ width: '55%', height: 14 }} />
            <Skeleton className="skeleton-text" style={{ width: '35%' }} />
            {/* Member rows: the payment mark, then the name. */}
            {Array.from({ length: 3 }).map((_, member) => (
              <div key={member} className="flex items-center gap-2.5 px-2" style={{ height: 32 }}>
                <Skeleton style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} />
                <Skeleton className="skeleton-text" style={{ flex: 1 }} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only">Loading teams</span>
    </div>
  );
}
