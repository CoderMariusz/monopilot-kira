export const COUNT_TYPES = ['cycle', 'full', 'spot'] as const;
export type CountType = (typeof COUNT_TYPES)[number];

export const COUNT_SESSION_STATUSES = ['open', 'counting', 'review', 'closed', 'cancelled'] as const;
export type CountSessionStatus = (typeof COUNT_SESSION_STATUSES)[number] | (string & {});

export const COUNT_LINE_STATUSES = ['pending', 'counted', 'approved', 'applied', 'rejected'] as const;
export type CountLineStatus = (typeof COUNT_LINE_STATUSES)[number];

export type DecimalString = string;

export type CreateCountSessionInput = {
  warehouseId: string;
  countType: CountType;
};

export type CountWarehouseOption = {
  id: string;
  code: string;
  name: string;
  siteId: string | null;
};

/** Pure helper — plans whether create should switch the top-bar site before persisting. */
export type CountCreateSitePlan =
  | { action: 'proceed' }
  | { action: 'switch_site'; warehouseSiteId: string }
  | { action: 'blocked'; reason: 'warehouse_site_required' };

export function planCountSessionCreateSite(
  activeSiteId: string | null,
  warehouseSiteId: string | null,
): CountCreateSitePlan {
  if (!warehouseSiteId) return { action: 'blocked', reason: 'warehouse_site_required' };
  if (activeSiteId === warehouseSiteId) return { action: 'proceed' };
  return { action: 'switch_site', warehouseSiteId };
}

export type CountSession = {
  id: string;
  warehouseId: string;
  warehouseCode: string | null;
  countType: CountType | (string & {});
  status: CountSessionStatus;
  createdAt: string | null;
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
  varianceQty: DecimalString;
};

/**
 * Soft, non-blocking cycle-count variance signal. Emitted by `recordCount` when
 * the absolute variance between the counted and the system on-hand qty exceeds
 * the org's configured `count_variance_warn_pct` (a `tenant_variations`
 * feature-flag, percent). It NEVER blocks the count from being recorded — it
 * just lets the UI surface "this count is off by N% — recheck before applying"
 * to the counter/supervisor. Mirrors the production over-consume / mass-balance
 * WARN tier (a flag + reason code + the over-amount/variance for the caller).
 */
export type CountVarianceWarning = {
  /** Always true when present; lets the consumer narrow on `if (warning)`. */
  varianceExceedsThreshold: true;
  /** Machine-readable reason code for logs / audit. */
  reasonCode: 'count_variance_over_threshold';
  /** Absolute variance percent vs. system on-hand, 4dp decimal string. */
  variancePct: DecimalString;
  /** The configured warn threshold percent (decimal string). */
  warnPct: DecimalString;
};

export type CountLine = {
  id: string;
  sessionId: string;
  locationId: string;
  locationCode: string | null;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  lpId: string | null;
  lpNumber: string | null;
  countedQty: DecimalString | null;
  varianceQty: DecimalString | null;
  status: CountLineStatus;
  uom: string | null;
  /**
   * Present only when the recorded count's variance exceeded the org's
   * `count_variance_warn_pct`. Additive + optional — existing consumers that
   * ignore it keep compiling. Absent on reads (`getCountSession`/list) where no
   * single counted-vs-system delta is being evaluated.
   */
  varianceWarning?: CountVarianceWarning;
};

export type CountSessionDetail = CountSession & {
  lines: CountLine[];
  /**
   * True when the session belongs to a site the current user cannot see.
   * In that case `lines` is always empty (no counted/variance quantities are
   * returned). The header (warehouse, status, type) is still readable so the
   * user is not left with a 404 when navigating to a URL they legitimately
   * received (F10 vanish-trap fix). The client renders a "restricted" notice
   * instead of the blind-count/variance tables.
   */
  linesRestricted?: boolean;
};

export type RecordCountInput = {
  sessionId: string;
  locationId: string;
  itemId: string;
  lpId?: string | null;
  countedQty: DecimalString | number;
  batchNumber?: string | null;
  batch_number?: string | null;
  expiryDate?: string | Date | null;
  expiry_date?: string | Date | null;
};

export type CountSignature = {
  password: string;
  reason?: string | null;
  nonce?: string;
};

export type ApproveAndApplyVarianceInput = {
  countLineId: string;
  signature: CountSignature;
  supervisorUserId?: string;
  supervisorPin?: string;
};

export type ApplyVarianceResult = {
  countLineId: string;
  adjustmentId: string;
  direction: 'increase' | 'decrease';
  adjustmentQty: DecimalString;
  varianceQty: DecimalString;
  lpId: string | null;
  esignRef: string;
  status: 'applied';
};
