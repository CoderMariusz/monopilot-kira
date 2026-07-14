import type { MrpBucketRow, MrpKpis, MrpRow } from './mrp-compute';

export type MrpRunData = {
  ranAt: string;
  rows: MrpRow[];
  bucketDates: string[];
  bucketRows: MrpBucketRow[];
  kpis: MrpKpis;
  runId: string | null;
  runNumber: string | null;
  plannedOrders: MrpPlannedOrder[];
  /** Populated when confirmed SOs lack promised/required ship dates (P2-06). */
  warnings?: { undatedSoLines: number };
};

export type MrpRunResult =
  | { ok: true; data: MrpRunData }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type MrpRunInput = { persist?: boolean; horizonWeeks?: number };

export type MrpRunSummary = {
  id: string;
  runNumber: string;
  status: string;
  horizonStart: string;
  requirementCount: number;
  exceptionCount: number;
  createdAt: string;
};

export type MrpRunRequirement = {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  bucketDate: string;
  grossRequirement: string;
  scheduledReceipts: string;
  projectedOnHand: string;
  netRequirement: string;
  uom: string;
  exceptionType: string | null;
};

export type MrpPlannedOrderType = 'buy' | 'make' | 'transfer';

export type MrpPlannedOrder = {
  id: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  type: MrpPlannedOrderType;
  qty: string;
  uom: string;
  needBy: string;
  releaseBy: string | null;
  isLate?: boolean;
  supplierId: string | null;
  status: string;
};

export type MrpConvertResult =
  | {
      ok: true;
      created: number;
      poIds?: string[];
      woIds?: string[];
      skipped: Array<{ id: string; reason: string }>;
      priceWarnings?: Array<{ id: string; reason: string }>;
    }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type MrpCancelResult =
  | { ok: true; cancelled: true }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'not_found' | 'invalid_state' | 'persistence_failed' };

export type MrpRunsListResult =
  | { ok: true; data: MrpRunSummary[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type MrpRunRequirementsResult =
  | { ok: true; data: MrpRunRequirement[] }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'not_found' | 'persistence_failed' };
