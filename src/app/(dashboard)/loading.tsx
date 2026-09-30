import { ChartCardSkeleton, Skeleton } from './loading-skeletons';

// The overview reads every participant, team and payment proof before it can
// draw anything. This keeps the page's shape on screen while it does.
export default function OverviewLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="admin-heading text-lg text-white">Overview</h2>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Live registration &amp; team stats
        </p>
      </div>

      <div className="loading-late space-y-6">
        <div className="viz-kpi-row">
          {Array.from({ length: 5 }).map((_, tile) => (
            <div key={tile} className="admin-card viz-tile">
              <Skeleton className="skeleton-text" style={{ width: '60%' }} />
              <Skeleton style={{ width: '40%', height: 28, marginTop: 10 }} />
              <Skeleton className="skeleton-text" style={{ width: '75%', marginTop: 10 }} />
            </div>
          ))}
        </div>

        <ChartCardSkeleton height={220} />
        <ChartCardSkeleton height={260} />

        <div className="viz-grid">
          {Array.from({ length: 4 }).map((_, card) => (
            <ChartCardSkeleton key={card} height={200} />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading overview</span>
    </div>
  );
}
