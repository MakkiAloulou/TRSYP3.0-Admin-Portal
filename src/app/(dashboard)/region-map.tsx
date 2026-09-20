'use client';

import { useState } from 'react';
import { TUNISIA_REGIONS, TUNISIA_VIEWBOX } from '@/lib/tunisia-regions';

export type RegionCount = { region: string; value: number };

/**
 * Sequential ramp, dim -> bright, one hue.
 *
 * Magnitude takes a single-hue ramp, and on a dark surface the anchor flips:
 * more participants reads as brighter, not darker. Lightness is monotonic
 * across the five steps (OKLab L 0.27 -> 0.82, roughly even), so the order is
 * visible to everyone including colourblind readers — a sequential ramp is
 * read by lightness, not hue.
 */
const RAMP = ['#0a2e1e', '#0f4d30', '#167a45', '#1fae5e', '#00e87a'] as const;

/** Deliberately off-ramp: "nobody from here" is a different claim to "a few". */
const NO_DATA = '#1a1f2e';

export function RegionMap({ counts }: { counts: RegionCount[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const byRegion = new Map(counts.map((c) => [c.region, c.value]));
  const max = Math.max(0, ...counts.map((c) => c.value));

  // Equal-interval buckets. The exact figure is always one hover or one list
  // row away, so the fill only has to convey rough magnitude.
  const step = Math.max(1, Math.ceil(max / RAMP.length));

  function fillFor(value: number) {
    if (value === 0) return NO_DATA;
    return RAMP[Math.min(RAMP.length - 1, Math.ceil(value / step) - 1)];
  }

  const ranked = [...counts].filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  const hoveredValue = hovered ? (byRegion.get(hovered) ?? 0) : 0;

  return (
    <div className="region-layout">
      <div
        className="region-map"
        onMouseLeave={() => {
          setHovered(null);
          setCursor(null);
        }}
      >
        <svg
          viewBox={`0 0 ${TUNISIA_VIEWBOX.width} ${TUNISIA_VIEWBOX.height}`}
          className="region-map-svg"
          role="img"
          aria-label="Participants by governorate. The same figures are listed beside the map."
        >
          {TUNISIA_REGIONS.map((region) => {
            const value = byRegion.get(region.name) ?? 0;
            return (
              <path
                key={region.id}
                d={region.d}
                fill={fillFor(value)}
                className={`region-shape${hovered === region.name ? ' is-hovered' : ''}`}
                onMouseEnter={() => setHovered(region.name)}
                onMouseMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
                  if (box) setCursor({ x: e.clientX - box.left, y: e.clientY - box.top });
                }}
              >
                {/* Native tooltip, so the figure survives without JS or a mouse. */}
                <title>{`${region.name}: ${value}`}</title>
              </path>
            );
          })}
        </svg>

        {hovered && cursor && (
          <div className="region-tooltip" style={{ left: cursor.x, top: cursor.y }}>
            <span className="region-tooltip-name">{hovered}</span>
            <span className="region-tooltip-value">
              {hoveredValue} {hoveredValue === 1 ? 'participant' : 'participants'}
            </span>
          </div>
        )}
      </div>

      <div className="region-side">
        <div className="region-legend" aria-hidden>
          <span className="region-legend-label">Fewer</span>
          {RAMP.map((colour) => (
            <span key={colour} className="region-legend-swatch" style={{ background: colour }} />
          ))}
          <span className="region-legend-label">More</span>
        </div>

        {/* The map's table view: exact figures, readable without hover. */}
        <ul className="region-list">
          {ranked.length === 0 && <li className="viz-empty">No regions recorded yet</li>}
          {ranked.map((row) => (
            <li
              key={row.region}
              className={`region-list-row${hovered === row.region ? ' is-hovered' : ''}`}
              onMouseEnter={() => setHovered(row.region)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="region-list-dot" style={{ background: fillFor(row.value) }} />
              <span className="region-list-name">{row.region}</span>
              <span className="region-list-value">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
