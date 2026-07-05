'use client';

import type { ComponentProcess } from '../actions/get-component-processes';

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(4).replace(/\.?0+$/, '');
}

/** W5 — effective kg/pack = base qty × Π(yield_pct/100) across processes (display only). */
export function computeEffectiveKgPerPack(
  baseQtyKg: number,
  processes: ComponentProcess[],
): number | null {
  if (!Number.isFinite(baseQtyKg) || baseQtyKg <= 0 || processes.length === 0) return null;
  const hasSubFullYield = processes.some((p) => {
    const y = (p as ComponentProcess & { yieldPct?: number }).yieldPct ?? 100;
    return y < 100;
  });
  if (!hasSubFullYield) return null;

  const factor = processes.reduce((acc, p) => {
    const y = (p as ComponentProcess & { yieldPct?: number }).yieldPct ?? 100;
    return acc * (y / 100);
  }, 1);

  return baseQtyKg * factor;
}

export function ProcessYieldHint({
  baseQtyKg,
  processes,
}: {
  baseQtyKg: number | null | undefined;
  processes: ComponentProcess[];
}) {
  if (baseQtyKg == null || !Number.isFinite(baseQtyKg) || baseQtyKg <= 0) return null;

  const effective = computeEffectiveKgPerPack(baseQtyKg, processes);
  if (effective == null) return null;

  return (
    <p
      className="mt-1 text-[11px] text-amber-800"
      data-testid="fa-prod-process-yield-hint"
    >
      effective {fmtQty(effective)} kg/pack after process yields
    </p>
  );
}
