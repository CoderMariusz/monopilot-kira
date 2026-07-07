const THROUGHPUT_UOMS = ['kg', 'pack', 'each', 'l'] as const;

export type WipProcessThroughputUom = (typeof THROUGHPUT_UOMS)[number];

/** Subset of Settings process-default payload used when prefilling a WIP process row. */
export type ProcessDefaultPrefillSource = {
  defaultDurationHours?: number;
  standardCost?: number;
  throughputPerHour?: number | null;
  throughputUom?: string | null;
  setupCost?: number;
  yieldPct?: number;
};

export type WipProcessPrefillFields = {
  durationHours: number;
  additionalCost: number;
  throughputPerHour: number;
  throughputUom: WipProcessThroughputUom;
  setupCost: number;
  yieldPct: number;
};

function resolveThroughputUom(value: string | null | undefined): WipProcessThroughputUom {
  if (value && (THROUGHPUT_UOMS as readonly string[]).includes(value)) {
    return value as WipProcessThroughputUom;
  }
  return 'kg';
}

/** Map npd_process_defaults payload → addWipProcess / WipProcessRow prefill fields. */
export function wipProcessPrefillFromDefault(
  payload: ProcessDefaultPrefillSource | null | undefined,
): WipProcessPrefillFields {
  return {
    durationHours: payload?.defaultDurationHours ?? 0,
    additionalCost: payload?.standardCost ?? 0,
    throughputPerHour: payload?.throughputPerHour ?? 0,
    throughputUom: resolveThroughputUom(payload?.throughputUom),
    setupCost: payload?.setupCost ?? 0,
    yieldPct: payload?.yieldPct ?? 100,
  };
}
