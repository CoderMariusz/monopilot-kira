'use client';

/**
 * Fala-3 — SensoryRadar (the left-hand radar chart of the Sensory panel).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:287-306
 *   (the `.radar-wrap` <svg> radar: concentric grid polygons + spokes + the
 *    scored polygon + per-attribute axis labels).
 *
 * The repo has no radar charting lib; the prototype itself draws a hand-rolled
 * SVG radar with the same geometry the costing screen uses for its CSS bars
 * (layout-only numeric math, never money). We translate that SVG 1:1 here: the
 * attribute SCORE is the only numeric we read, and it drives a layout-only
 * radius (NOT a persisted/displayed value), exactly as the prototype does. Score
 * strings stay as decimal STRINGS at the data boundary; the only Number() here is
 * the geometry radius, never shown as a value.
 *
 * Server-rendered SVG (no interactivity); marked 'use client' only so the parent
 * client screen can compose it without a raw-function-prop RSC boundary.
 */

import React from 'react';

export type SensoryRadarPoint = {
  attribute: string;
  /** Score /10 as a decimal STRING (NUMERIC). Drives layout-only radius. */
  score: string | null;
};

const CX = 140;
const CY = 140;
const R = 110;
const MAX_SCORE = 10;
const GRID_RINGS = [0.2, 0.4, 0.6, 0.8, 1.0];

/** Layout-only numeric parse for radial geometry (never a displayed value). */
function scoreNum(score: string | null): number {
  if (score === null) return 0;
  const n = Number(score);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_SCORE, n)) : 0;
}

function angleAt(i: number, n: number): number {
  return -Math.PI / 2 + (i / n) * Math.PI * 2;
}

export function SensoryRadar({ points }: { points: SensoryRadarPoint[] }) {
  const n = points.length;
  if (n === 0) return null;

  const scored = points.map((p, i) => {
    const a = angleAt(i, n);
    const rr = (scoreNum(p.score) / MAX_SCORE) * R;
    return { x: CX + Math.cos(a) * rr, y: CY + Math.sin(a) * rr };
  });
  const polygon = scored.map((p) => `${p.x},${p.y}`).join(' ');

  const labelPts = points.map((_, i) => {
    const a = angleAt(i, n);
    const cos = Math.cos(a);
    const anchor: 'start' | 'end' | 'middle' = cos > 0.1 ? 'start' : cos < -0.1 ? 'end' : 'middle';
    return {
      x: CX + cos * (R + 18),
      y: CY + Math.sin(a) * (R + 18),
      anchor,
    };
  });

  return (
    <svg
      data-testid="sensory-radar"
      width="320"
      height="300"
      viewBox="0 0 320 300"
      role="img"
      aria-label="Sensory attribute radar"
    >
      {GRID_RINGS.map((f, i) => (
        <polygon
          key={`ring-${i}`}
          points={Array.from({ length: n })
            .map((_, j) => {
              const a = angleAt(j, n);
              return `${CX + Math.cos(a) * R * f},${CY + Math.sin(a) * R * f}`;
            })
            .join(' ')}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}
      {points.map((_, i) => {
        const a = angleAt(i, n);
        return (
          <line
            key={`spoke-${i}`}
            x1={CX}
            y1={CY}
            x2={CX + Math.cos(a) * R}
            y2={CY + Math.sin(a) * R}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        );
      })}
      <polygon
        data-testid="sensory-radar-polygon"
        points={polygon}
        fill="rgba(59,130,246,0.18)"
        stroke="#3b82f6"
        strokeWidth="2"
      />
      {scored.map((p, i) => (
        <circle key={`pt-${i}`} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
      ))}
      {points.map((p, i) => (
        <text
          key={`label-${i}`}
          x={labelPts[i]!.x}
          y={labelPts[i]!.y}
          textAnchor={labelPts[i]!.anchor}
          fontSize="11"
          fill="#475569"
          dominantBaseline="middle"
        >
          {p.attribute}
        </text>
      ))}
    </svg>
  );
}

export default SensoryRadar;
