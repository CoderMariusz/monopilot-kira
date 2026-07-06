export type ProcessDefaultRole = { roleGroup: string; defaultHeadcount: number };

/** Distinct labor-rate role group + its currently effective hourly rate (live cost compute). */
export type RoleGroupRate = { roleGroup: string; ratePerHour: number };

/** Read-only per-product usage of an operation (npd_wip_processes, joined by process_name). */
export type ProcessProductRate = {
  productCode: string;
  throughputPerHour: number | null;
  throughputUom: string | null;
  setupCost: number;
  yieldPct: number;
};

export type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  /** ManufacturingOperations.process_suffix — the category the prefix auto-numbers within. */
  processSuffix: string;
  /** Process code (PREP-01 style); null until first save assigns/receives one. */
  prefix: string | null;
  standardCost: number;
  /** false ⇒ standardCost was derived from roles × labor_rates at save; true ⇒ manual override. */
  costOverridden: boolean;
  defaultDurationHours: number;
  setupCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  yieldPct: number;
  roles: ProcessDefaultRole[];
  /** Read-only surfacing of per-product rates (npd_wip_processes) — not editable here. */
  productRates: ProcessProductRate[];
};
