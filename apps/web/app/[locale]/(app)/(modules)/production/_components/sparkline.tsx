/**
 * Production analytics sparkline — mirrors the 03-Technical cost-history SVG pattern
 * (technical/cost/_components/cost-manager.client.tsx:200-238). No chart library;
 * a plain inline SVG polyline + dots over a fixed viewBox. Presentational only.
 *
 * Used by the Waste analytics trend (new-screens.jsx:93-108) and the Analytics OEE
 * trend (other-screens.jsx:436-449) sub-pages.
 */

export type SparklinePoint = { value: number; label?: string };

const W = 600;
const H = 120;
const PAD = 10;

/**
 * Renders `points` left-to-right (already oldest→newest). Empty / single-point data
 * degrades to a flat baseline rather than throwing.
 */
export function Sparkline({
  points,
  color = 'var(--blue)',
  ariaLabel,
}: {
  points: SparklinePoint[];
  color?: string;
  ariaLabel: string;
}) {
  const values = points.map((p) => p.value);
  const max = values.length ? Math.max(...values) : 1;
  const min = values.length ? Math.min(...values) : 0;
  const range = max - min || 1;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const pt = (value: number, i: number) => {
    const denom = points.length > 1 ? points.length - 1 : 1;
    const x = (i / denom) * innerW + PAD;
    const y = H - PAD - ((value - min) / range) * innerH;
    return { x, y };
  };

  return (
    <svg
      data-testid="production-sparkline"
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      {points.map((p, i) => {
        if (i === 0) return null;
        const a = pt(points[i - 1]!.value, i - 1);
        const b = pt(p.value, i);
        return <line key={`l-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="2" />;
      })}
      {points.map((p, i) => {
        const { x, y } = pt(p.value, i);
        return <circle key={`c-${i}`} cx={x} cy={y} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />;
      })}
    </svg>
  );
}
