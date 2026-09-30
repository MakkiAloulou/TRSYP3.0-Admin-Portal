import type { CSSProperties, ReactNode } from 'react';

/** One shimmering placeholder block; size it with `style`. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden />;
}

/**
 * The page heading and subtitle while a page loads. A known title is printed
 * as text, since the real page shows the same words; the subtitle carries data
 * the page has not fetched yet, so it waits with the skeleton.
 */
export function LoadingHeading({ title, subtitle }: { title?: string; subtitle: string }) {
  return (
    <div>
      {title ? (
        <h2 className="admin-heading text-lg text-white">{title}</h2>
      ) : (
        <Skeleton className="loading-late" style={{ width: 200, height: 20, marginBottom: 6 }} />
      )}
      <p className="loading-late text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {subtitle}
      </p>
    </div>
  );
}

/** A card of table rows, staggered so the shimmer reads as a list. */
export function TableSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="admin-card loading-late p-4">
      {Array.from({ length: rows }).map((_, row) => (
        <Skeleton key={row} className="skeleton-row" style={{ animationDelay: `${row * 60}ms` }} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** A chart card: a title line, a subtitle line, then the chart's area. */
export function ChartCardSkeleton({ height, children }: { height?: number; children?: ReactNode }) {
  return (
    <div className="admin-card viz-card">
      <div className="viz-card-head">
        <Skeleton className="skeleton-text" style={{ width: '40%' }} />
        <Skeleton className="skeleton-text" style={{ width: '25%', marginTop: 6 }} />
      </div>
      {children ?? <Skeleton style={{ height }} />}
    </div>
  );
}
