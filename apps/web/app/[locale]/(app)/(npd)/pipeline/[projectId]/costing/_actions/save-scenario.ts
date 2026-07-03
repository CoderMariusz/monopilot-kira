'use server';

/**
 * T-073 — `saveCostingScenario` Server Action (§17.11.3 what-if persistence).
 *
 * Persists a NAMED what-if scenario (its input parameters) so a slider-driven
 * scenario is retrievable later. Idempotent UPSERT on
 * (org_id, product_code, scenario) — re-saving the same name overwrites params.
 *
 * The named what-if parameter set is stored in the breakdown's `scenario`
 * identity row; we keep the latest computed snapshot columns and persist the
 * raw parameters as part of the recompute via `computeCosting`. This action is
 * a thin idempotency wrapper that records/refreshes a scenario row WITHOUT
 * recomputing the waterfall, so callers can save a draft scenario name+params
 * and recompute on demand.
 *
 * Red lines: org-scoped (withOrgContext -> RLS), money stays decimal strings,
 * margin < 0% persists with status 'fail' (D10 — warning in UI, not a save block).
 */

import { z } from 'zod';
import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  computeWaterfall,
  decimalGt,
  decimalLt,
  decimalLte,
} from '../../../../../../../../lib/costing/compute-waterfall';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

const NON_NEG_DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');
const DECIMAL = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');

// Numeric-exact bounds enforced at FULL precision (no float coercion):
//   0 < yieldPct <= 100  (>100 silently REDUCES cost via the yield gross-up).
const YIELD_PCT = NON_NEG_DECIMAL.refine((s) => decimalGt(s, '0') && decimalLte(s, '100'), {
  message: 'yieldPct must be in (0, 100]',
});
//   marginPct < 100 (>=100 => 1-margin <= 0 => div-by-zero / negative price).
const MARGIN_PCT = DECIMAL.refine((s) => decimalLt(s, '100'), {
  message: 'marginPct must be < 100',
});

const ParamsSchema = z.object({
  rawCostEur: NON_NEG_DECIMAL,
  yieldPct: YIELD_PCT,
  processLabourEur: NON_NEG_DECIMAL,
  packagingEur: NON_NEG_DECIMAL,
  overheadEur: NON_NEG_DECIMAL,
  logisticsEur: NON_NEG_DECIMAL,
  marginPct: MARGIN_PCT,
  distributorMarkupPct: NON_NEG_DECIMAL,
  retailMarkupPct: NON_NEG_DECIMAL,
});

const Input = z.object({
  projectId: z.string().uuid(),
  productCode: z.string().trim().min(1).max(64),
  scenario: z.string().trim().min(1).max(64),
  params: ParamsSchema,
});

type SaveScenarioParams = z.infer<typeof ParamsSchema>;

type SaveScenarioError =
  | 'invalid_input'
  | 'forbidden'
  | 'margin_hard_fail'
  | 'not_found'
  | 'persistence_failed';

type SaveScenarioResult =
  | {
      ok: true;
      data: {
        breakdownId: string;
        productCode: string;
        scenario: string;
        rawCostEur: string;
        marginPct: string;
        targetPriceEur: string;
        /** Echo of the exact what-if input parameters that were persisted. */
        params: SaveScenarioParams;
      };
    }
  | { ok: false; error: SaveScenarioError; message?: string };

export async function saveCostingScenario(raw: unknown): Promise<SaveScenarioResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  // Derive the snapshot columns from the named scenario's params.
  const result = computeWaterfall(input.params);

  try {
    return await withOrgContext(async ({ orgId, userId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, 'npd.formulation.create_draft'))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const upsert = await client.query<{ id: string }>(
        `insert into public.costing_breakdowns
           (org_id, product_code, scenario, raw_cost_eur, margin_pct, target_price_eur, params, computed_at)
         values ($1::uuid, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::jsonb, now())
         on conflict (org_id, product_code, scenario) do update
           set raw_cost_eur     = excluded.raw_cost_eur,
               margin_pct       = excluded.margin_pct,
               target_price_eur = excluded.target_price_eur,
               params           = excluded.params,
               computed_at      = excluded.computed_at
         returning id`,
        [
          orgId,
          input.productCode,
          input.scenario,
          result.rawCostEur,
          result.marginPct,
          result.targetPriceEur,
          // Persist the EXACT what-if parameters (decimal strings, never floats)
          // so the scenario is retrievable by name + parameters (§17.11.3).
          JSON.stringify(input.params),
        ],
      );
      const breakdownId = upsert.rows[0]?.id;
      if (!breakdownId) return { ok: false as const, error: 'not_found' as const };

      safeRevalidatePath(`/[locale]/pipeline/${input.projectId}/costing-nutrition`, 'page');

      return {
        ok: true as const,
        data: {
          breakdownId,
          productCode: input.productCode,
          scenario: input.scenario,
          rawCostEur: result.rawCostEur,
          marginPct: result.marginPct,
          targetPriceEur: result.targetPriceEur,
          params: input.params,
        },
      };
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23503') return { ok: false, error: 'not_found' };
    console.error('[saveCostingScenario] persistence_failed', {
      productCode: input.productCode,
      scenario: input.scenario,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function safeRevalidatePath(path: string, type?: 'layout' | 'page'): void {
  try {
    revalidateLocalized(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
