/**
 * T-020 — Technical lab-results READ MODEL (pure contract).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §5.5, §10.6, §10.8.
 *
 * Ownership red-line (CLAUDE.md + MON-domain-technical): `lab_results` is
 * QUALITY-OWNED. Technical READS it READ-ONLY — there is NO Technical
 * write/approve path. This module is the stable, pure mapping contract that
 * the Technical lab-results Route Handler uses to:
 *   1. validate + normalise the GET filter (test_type / result_status / item_id),
 *   2. build the org-scoped SELECT (RLS via app.current_org_id() does the org
 *      isolation; this just shapes the WHERE), and
 *   3. project a raw DB row into the read-model row Technical surfaces.
 *
 * It does NOT recalculate status, ownership, or thresholds — the Quality-side
 * `result_status` (and ATP `threshold_rlu`) are surfaced verbatim (AC4). No I/O,
 * no DB, no clock here; the Route Handler runs the query under withOrgContext.
 *
 * Red lines honoured:
 *   - No Technical write path modelled here (the read model has no INSERT/UPDATE).
 *   - No external lab API calls (Phase 2 out of scope).
 *   - FG canonical — no legacy FA aliases.
 *   - site_id is surfaced as a nullable soft uuid (day-1, no registry).
 */

// ── Canonical enums (mirror the CHECK constraints in migration 162) ───────────

export const LAB_TEST_TYPES = [
  'atp_swab',
  'allergen_elisa',
  'micro_apc',
  'nutrition',
  'sensory',
] as const;
export type LabTestType = (typeof LAB_TEST_TYPES)[number];

export const LAB_RESULT_STATUSES = ['pass', 'fail', 'inconclusive', 'pending', 'hold'] as const;
export type LabResultStatus = (typeof LAB_RESULT_STATUSES)[number];

export function isLabTestType(value: unknown): value is LabTestType {
  return typeof value === 'string' && (LAB_TEST_TYPES as readonly string[]).includes(value);
}

export function isLabResultStatus(value: unknown): value is LabResultStatus {
  return typeof value === 'string' && (LAB_RESULT_STATUSES as readonly string[]).includes(value);
}

// ── Read-model row Technical surfaces (Quality-owned, read-only) ──────────────

export interface LabResultReadRow {
  id: string;
  itemId: string | null;
  siteId: string | null;
  workOrderId: string | null;
  /** Soft pointer back to the Quality canonical row/event (read-only). */
  qualityResultId: string | null;
  testType: LabTestType;
  testCode: string | null;
  resultValue: string | null; // NUMERIC surfaced as string — never coerced to float
  resultUnit: string | null;
  /** Quality-calculated status — surfaced verbatim, NEVER recomputed here (AC4). */
  resultStatus: LabResultStatus;
  /** ATP swab threshold (RLU) as set by Quality — surfaced, not recalculated (AC4). */
  thresholdRlu: string | null;
  testedAt: string | null;
  labProvider: string | null;
  notes: string | null;
  createdAt: string;
}

/** Raw row shape as selected from public.lab_results (snake_case from pg). */
export interface LabResultDbRow {
  id: string;
  item_id: string | null;
  site_id: string | null;
  work_order_id: string | null;
  quality_result_id: string | null;
  test_type: string;
  test_code: string | null;
  result_value: string | null;
  result_unit: string | null;
  result_status: string;
  threshold_rlu: string | null;
  tested_at: string | Date | null;
  lab_provider: string | null;
  notes: string | null;
  created_at: string | Date;
}

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Project a raw lab_results DB row into the Technical read-model row.
 * Returns null when the row carries a test_type / result_status outside the
 * canonical set (defensive — never surface a value the contract can't type).
 */
export function toLabResultReadRow(row: LabResultDbRow): LabResultReadRow | null {
  if (!isLabTestType(row.test_type)) return null;
  if (!isLabResultStatus(row.result_status)) return null;
  return {
    id: String(row.id),
    itemId: row.item_id == null ? null : String(row.item_id),
    siteId: row.site_id == null ? null : String(row.site_id),
    workOrderId: row.work_order_id == null ? null : String(row.work_order_id),
    qualityResultId: row.quality_result_id == null ? null : String(row.quality_result_id),
    testType: row.test_type,
    testCode: row.test_code,
    resultValue: row.result_value == null ? null : String(row.result_value),
    resultUnit: row.result_unit,
    resultStatus: row.result_status,
    thresholdRlu: row.threshold_rlu == null ? null : String(row.threshold_rlu),
    testedAt: toIso(row.tested_at),
    labProvider: row.lab_provider,
    notes: row.notes,
    createdAt: toIso(row.created_at) as string,
  };
}

// ── GET filter contract ───────────────────────────────────────────────────────

export interface LabResultsFilter {
  testType?: LabTestType;
  resultStatus?: LabResultStatus;
  itemId?: string;
  limit: number;
}

export interface LabResultsFilterError {
  ok: false;
  error: 'invalid_filter';
  field: 'test_type' | 'result_status' | 'item_id' | 'limit';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * Parse + validate the query-string filter for GET /api/technical/lab-results.
 * Unknown / malformed enum values are rejected (typed error) rather than
 * silently ignored, so a caller cannot accidentally widen the result set.
 */
export function parseLabResultsFilter(
  params: URLSearchParams | Record<string, string | undefined>,
): { ok: true; filter: LabResultsFilter } | LabResultsFilterError {
  const get = (k: string): string | undefined => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return v == null || v === '' ? undefined : v;
  };

  const testTypeRaw = get('test_type');
  if (testTypeRaw !== undefined && !isLabTestType(testTypeRaw)) {
    return { ok: false, error: 'invalid_filter', field: 'test_type' };
  }

  const resultStatusRaw = get('result_status');
  if (resultStatusRaw !== undefined && !isLabResultStatus(resultStatusRaw)) {
    return { ok: false, error: 'invalid_filter', field: 'result_status' };
  }

  const itemIdRaw = get('item_id');
  if (itemIdRaw !== undefined && !UUID_RE.test(itemIdRaw)) {
    return { ok: false, error: 'invalid_filter', field: 'item_id' };
  }

  let limit = DEFAULT_LIMIT;
  const limitRaw = get('limit');
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_LIMIT) {
      return { ok: false, error: 'invalid_filter', field: 'limit' };
    }
    limit = n;
  }

  return {
    ok: true,
    filter: {
      testType: testTypeRaw as LabTestType | undefined,
      resultStatus: resultStatusRaw as LabResultStatus | undefined,
      itemId: itemIdRaw,
      limit,
    },
  };
}

/**
 * Build the parameterised, org-scoped read SELECT for the lab-results read
 * model. org isolation is enforced by RLS (`org_id = app.current_org_id()`);
 * the explicit predicate is kept as belt-and-suspenders. Returns the SQL text
 * plus positional params — no string interpolation of user input.
 */
export function buildLabResultsQuery(filter: LabResultsFilter): {
  text: string;
  values: unknown[];
} {
  const values: unknown[] = [];
  const where: string[] = ['org_id = app.current_org_id()'];

  if (filter.testType) {
    values.push(filter.testType);
    where.push(`test_type = $${values.length}`);
  }
  if (filter.resultStatus) {
    values.push(filter.resultStatus);
    where.push(`result_status = $${values.length}`);
  }
  if (filter.itemId) {
    values.push(filter.itemId);
    where.push(`item_id = $${values.length}::uuid`);
  }

  values.push(filter.limit);
  const limitParam = `$${values.length}`;

  const text = `
    select id, item_id, site_id, work_order_id, quality_result_id,
           test_type, test_code, result_value, result_unit, result_status,
           threshold_rlu, tested_at, lab_provider, notes, created_at
      from public.lab_results
     where ${where.join(' and ')}
     order by coalesce(tested_at, created_at) desc, created_at desc
     limit ${limitParam}`;

  return { text, values };
}
