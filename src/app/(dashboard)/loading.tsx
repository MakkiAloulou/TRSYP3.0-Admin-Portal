import { ChartCardSkeleton, Skeleton, StatTileSkeleton } from './loading-skeletons';

// The overview waits on the database before it can draw anything; the
// payment-dependent parts then stream in behind their own skeletons. This
// keeps the page's shape on screen meanwhile — the same grid as the real page,
// so nothing jumps when the data lands.
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
        {/* Two rows of three: people and money, then the three activities. */}
        <div className="viz-kpi-row">
          {Array.from({ length: 6 }).map((_, tile) => (
            <StatTileSkeleton key={tile} />
          ))}
        </div>

        {/* Registrations over time. */}
        <ChartCardSkeleton height={220} />

        {/* Top student branches and the region map. */}
        <div className="viz-grid">
          <ChartCardSkeleton height={260} />
          <ChartCardSkeleton height={260} />
        </div>

        {/* Membership donut beside the two stacked splits. */}
        <div className="viz-split">
          <ChartCardSkeleton>
            <div className="viz-donut">
              <Skeleton className="skeleton-ring" />
              <div className="viz-donut-legend" style={{ gap: 18 }}>
                {Array.from({ length: 3 }).map((_, row) => (
                  <Skeleton key={row} className="skeleton-text" style={{ height: 16 }} />
                ))}
              </div>
            </div>
          </ChartCardSkeleton>

          <div className="viz-stack">
            {Array.from({ length: 2 }).map((_, card) => (
              <ChartCardSkeleton key={card}>
                <Skeleton style={{ height: 14 }} />
                <Skeleton className="skeleton-text" style={{ width: '60%' }} />
              </ChartCardSkeleton>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Loading overview</span>
    </div>
  );
}
