'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * Chart primitives, hand-rolled in SVG/CSS so the dashboard stays dependency-free
 * and inherits the site's palette.
 *
 * Palette: the four categorical slots live in globals.css as --viz-1..--viz-4
 * (green #00e87a, pink #ff1d78, blue #5aa3f0, gold #c9a227). That set was checked
 * with the dataviz validator against this near-black surface: it clears the
 * chroma floor, the all-pairs CVD separation (worst ΔE 9.5), the normal-vision
 * floor (worst ΔE 21.2) and 3:1 contrast. The one deviation is the OKLCH
 * lightness band, which is calibrated for a #1a1a19 surface — ours is #050a16,
 * far darker, so the brighter steps are what keep contrast high. Every series is
 * direct-labelled as well as coloured, so identity never rests on hue alone.
 */

export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'] as const;

export type Slice = { label: string; value: number; color?: string };

/* ── Stat tile ──────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  accent,
  href,
  cta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  /** Makes the whole tile a link — for numbers someone acts on. */
  href?: string;
  /** What following the link does. Shares the bottom line with `sub`, so the
   *  tile stays the same height as its neighbours. */
  cta?: string;
}) {
  const showCta = Boolean(href && cta);
  const body = (
    <>
      <div className="viz-tile-label">{label}</div>
      <div className="viz-tile-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {(sub || showCta) && (
        <div className="viz-tile-row">
          {sub && <div className="viz-tile-sub">{sub}</div>}
          {showCta && <span className="viz-tile-cta">{cta} &rarr;</span>}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="admin-card viz-tile viz-tile--link">
        {body}
      </Link>
    );
  }

  return <div className="admin-card viz-tile">{body}</div>;
}

/* ── Card shell ─────────────────────────────────────────── */

export function ChartCard({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  /** A headline figure at the right of the title (e.g. "+14 this week"). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const head = (
    <div className="viz-card-head">
      <h3 className="admin-heading viz-card-title">{title}</h3>
      {subtitle && <p className="viz-card-sub">{subtitle}</p>}
    </div>
  );

  return (
    <div className="admin-card viz-card">
      {aside ? (
        <div className="viz-card-top">
          {head}
          <div className="viz-card-aside">{aside}</div>
        </div>
      ) : (
        head
      )}
      {children}
    </div>
  );
}

function EmptyState({ children = 'No data yet' }: { children?: React.ReactNode }) {
  return <div className="viz-empty">{children}</div>;
}

/* ── Part-to-whole: one stacked bar + legend ────────────── */

export function ShareBar({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <EmptyState />;

  const shown = slices.filter((s) => s.value > 0);

  return (
    <div>
      <div className="viz-sharebar" role="img" aria-label={shown.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {shown.map((s, i) => (
          <div
            key={s.label}
            className="viz-sharebar-seg"
            style={{
              flexGrow: s.value,
              background: s.color ?? VIZ[i % VIZ.length],
            }}
            title={`${s.label}: ${s.value} (${pct(s.value, total)})`}
          />
        ))}
      </div>

      <ul className="viz-legend">
        {slices.map((s, i) => (
          <li key={s.label} className="viz-legend-item">
            <span className="viz-swatch" style={{ background: s.color ?? VIZ[i % VIZ.length] }} />
            <span className="viz-legend-label">{s.label}</span>
            <span className="viz-legend-value">
              {s.value}
              <span className="viz-legend-pct">{pct(s.value, total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Part-to-whole with a headline: donut + legend ──────── */

const DONUT_SIZE = 200;
const DONUT_STROKE = 28;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2 - 4; // 4px leaves room for the hover swell
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
/** Surface-coloured gap between segments, in px along the ring. */
const DONUT_GAP = 2;

/**
 * A ring of slices with the headline in the middle, beside a legend of tiles
 * (label, count, share) that doubles as the table view. Made for a handful of
 * slices: each gets a tile with its count at headline size.
 *
 * Hover is the tooltip: pointing at a slice or its legend row swaps the centre
 * to that slice's count and share and dims the rest — no floating box to
 * collide with the legend. Slices are drawn in the caller's order, which is
 * what the palette's adjacent-pair validation was run against.
 */
export function DonutBreakdown({
  items,
  centerValue,
  centerLabel,
  emptyLabel,
}: {
  items: Slice[];
  centerValue: string;
  centerLabel: string;
  emptyLabel?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total === 0) return <EmptyState>{emptyLabel}</EmptyState>;

  const shown = items.filter((i) => i.value > 0);
  const gap = shown.length > 1 ? DONUT_GAP : 0;
  const active = shown.find((i) => i.label === hovered) ?? null;

  const lengths = shown.map((item) => (item.value / total) * DONUT_CIRCUMFERENCE);
  const segments = shown.map((item, i) => ({
    item,
    color: item.color ?? VIZ[i % VIZ.length],
    // Trim the gap off the end of each slice; a sliver smaller than the gap
    // still gets a visible 1px so it is never silently dropped.
    dash: Math.max(lengths[i] - gap, 1),
    // Where this slice starts along the ring: the sum of every slice before it.
    offset: lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
  }));

  return (
    <div className="viz-donut">
      <div className="viz-donut-figure" onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          className="viz-donut-svg"
          role="img"
          aria-label={shown.map((s) => `${s.label}: ${s.value}`).join(', ')}
        >
          <g transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}>
            {segments.map(({ item, color, dash, offset: start }) => (
              <circle
                key={item.label}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_RADIUS}
                fill="none"
                stroke={color}
                strokeWidth={active?.label === item.label ? DONUT_STROKE + 6 : DONUT_STROKE}
                strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE - dash}`}
                strokeDashoffset={-start}
                className="viz-donut-seg"
                style={{ opacity: active && active.label !== item.label ? 0.3 : 1 }}
                onMouseEnter={() => setHovered(item.label)}
              >
                <title>{`${item.label}: ${item.value} (${pct(item.value, total)})`}</title>
              </circle>
            ))}
          </g>
        </svg>

        <div className="viz-donut-center" aria-hidden>
          <span className="viz-donut-value">{active ? active.value : centerValue}</span>
          <span className="viz-donut-label">
            {active ? `${active.label} · ${pct(active.value, total)}` : centerLabel}
          </span>
        </div>
      </div>

      <ul className="viz-donut-legend">
        {shown.map((item, i) => (
          <li
            key={item.label}
            className={`viz-donut-row${active?.label === item.label ? ' is-active' : ''}`}
            onMouseEnter={() => setHovered(item.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="viz-donut-row-head">
              <span className="viz-swatch" style={{ background: item.color ?? VIZ[i % VIZ.length] }} />
              <span className="viz-legend-label">{item.label}</span>
            </span>
            <span className="viz-donut-row-value">
              {item.value}
              <span className="viz-legend-pct">{pct(item.value, total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Magnitude: ranked horizontal bars ──────────────────── */

export function RankedBars({
  items,
  color = 'var(--viz-1)',
  emptyLabel,
}: {
  items: Slice[];
  color?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) return <EmptyState>{emptyLabel}</EmptyState>;

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="viz-bars">
      {items.map((item) => (
        <li key={item.label} className="viz-bar-row">
          <span className="viz-bar-label" title={item.label}>
            {item.label}
          </span>
          <span className="viz-bar-track">
            <span
              className="viz-bar-fill"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? color }}
            />
          </span>
          <span className="viz-bar-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Ratio against a limit ──────────────────────────────── */

export function Meter({
  value,
  total,
  caption,
  color = 'var(--viz-1)',
}: {
  value: number;
  total: number;
  caption: string;
  color?: string;
}) {
  const share = total === 0 ? 0 : value / total;

  return (
    <div className="viz-meter">
      <div className="viz-meter-head">
        <span className="viz-meter-value" style={{ color }}>
          {Math.round(share * 100)}%
        </span>
        <span className="viz-meter-caption">{caption}</span>
      </div>
      <span className="viz-bar-track">
        <span className="viz-bar-fill" style={{ width: `${share * 100}%`, background: color }} />
      </span>
      <div className="viz-meter-foot">
        {value} of {total}
      </div>
    </div>
  );
}

/* ── Trend over time: cumulative area + line ────────────── */

export type TrendPoint = { date: string; total: number; daily: number };

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  // Drawing at 1:1 with the measured width keeps text and strokes at real pixel
  // sizes — a viewBox that scales to fit would shrink the axis labels to nothing
  // on a phone and blow them up on a wide screen.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;

    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (points.length < 2) {
    return (
      <div ref={wrapper}>
        <EmptyState>Not enough history to plot a trend yet</EmptyState>
      </div>
    );
  }

  const W = Math.max(width, 260);
  const H = W < 520 ? 180 : 230;
  const PAD = { top: 12, right: 12, bottom: 24, left: 38 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...points.map((p) => p.total));
  const niceMax = niceCeil(max);

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z`;

  const ticks = [0, niceMax / 2, niceMax];
  const active = hover === null ? null : points[hover];

  // Evenly spaced date labels, thinned out so they never collide.
  const labelCount = Math.max(2, Math.min(6, Math.floor(plotW / 70)));
  const xLabels = Array.from({ length: labelCount }, (_, k) =>
    Math.round((k / (labelCount - 1)) * (points.length - 1)),
  );

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left - PAD.left) / plotW;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.min(Math.max(i, 0), points.length - 1));
  }

  return (
    <div className="viz-trend" ref={wrapper}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="viz-trend-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Cumulative registrations, ${points[0].date} to ${points[points.length - 1].date}, ending at ${
          points[points.length - 1].total
        }`}
      >
        <defs>
          <linearGradient id="vizTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--viz-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="viz-axis-text">
              {t}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#vizTrendFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--viz-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].total)}
              r="5"
              fill="var(--viz-1)"
              stroke="var(--color-bg)"
              strokeWidth="2"
            />
          </g>
        )}

        {xLabels.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 7}
            textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}
            className="viz-axis-text"
          >
            {points[i].date}
          </text>
        ))}
      </svg>

      <div className="viz-trend-readout">
        {active ? (
          <>
            <span className="viz-trend-readout-date">{active.date}</span>
            <span className="viz-trend-readout-total">{active.total} total</span>
            <span className="viz-trend-readout-daily">
              {active.daily > 0 ? `+${active.daily} that day` : 'no new signups'}
            </span>
          </>
        ) : (
          <span className="viz-trend-readout-hint">Hover the chart for a daily breakdown</span>
        )}
      </div>
    </div>
  );
}

/* ── Status list (visa pipeline) ────────────────────────── */

export function StatusList({
  items,
  emptyLabel = 'No visa applications yet',
}: {
  items: Slice[];
  emptyLabel?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return <EmptyState>{emptyLabel}</EmptyState>;

  return (
    <ul className="viz-status-list">
      {items.map((item) => (
        <li key={item.label} className="viz-status-row">
          <span className="viz-status-dot" style={{ background: item.color }} />
          <span className="viz-status-label">{item.label}</span>
          <span className="viz-bar-track viz-status-track">
            <span
              className="viz-bar-fill"
              style={{ width: `${(item.value / total) * 100}%`, background: item.color }}
            />
          </span>
          <span className="viz-bar-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── helpers ────────────────────────────────────────────── */

function pct(value: number, total: number) {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/** Rounds up to a readable axis maximum (1, 2, 5 × 10ⁿ). */
function niceCeil(n: number) {
  if (n <= 5) return Math.max(n, 1);
  const magnitude = 10 ** Math.floor(Math.log10(n));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= n) return candidate;
  }
  return 10 * magnitude;
}
