'use server';

import { evaluateApprovalCriteria as evaluateApprovalCriteriaPure } from '@monopilot/domain';
import type { ApprovalCriteriaResult } from '@monopilot/domain';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const ProductCode = z.string().trim().min(1).max(120);

export type EvaluateApprovalCriteriaResult =
  | { ok: true; data: ApprovalCriteriaResult }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed'; message?: string };

type FormulationRow = {
  locked_at: Date | null;
  current_version_id: string | null;
};

type NutritionRow = {
  grade: string;
};

type CostingRow = {
  margin_pct: string;
};

type ProductRow = {
  product_code: string;
  allergens: string[] | null;
  may_contain: string[] | null;
};

type RiskRow = {
  open_high_count: string;
};

type DocsRow = {
  active_count: string;
  expired_count: string;
  invalid_count: string;
};

export async function evaluateApprovalCriteria(
  productCodeInput: unknown,
): Promise<EvaluateApprovalCriteriaResult> {
  const parsed = ProductCode.safeParse(productCodeInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  const productCode = parsed.data;

  try {
    return await withOrgContext(async ({ client }) => {
      const product = await client.query<ProductRow>(
        `select product_code, allergens, may_contain
           from public.product
          where product_code = $1
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [productCode],
      );
      const productRow = product.rows[0];
      if (!productRow) return { ok: false as const, error: 'not_found' as const };

      const formulation = await client.query<FormulationRow>(
        `select locked_at, current_version_id
           from public.formulations
          where product_code = $1
            and org_id = app.current_org_id()
          order by locked_at desc nulls last, created_at desc
          limit 1`,
        [productCode],
      );
      const formulationRow = formulation.rows[0] ?? { locked_at: null, current_version_id: null };

      const nutrition = await client.query<NutritionRow>(
        `select grade
           from public.nutri_score_results
          where product_code = $1
            and org_id = app.current_org_id()
            and (
              $2::uuid is null
              or formulation_version_id = $2::uuid
            )
          order by computed_at desc
          limit 1`,
        [productCode, formulationRow.current_version_id],
      );

      const costing = await client.query<CostingRow>(
        `select margin_pct::text
           from public.costing_breakdowns
          where product_code = $1
            and org_id = app.current_org_id()
            and lower(scenario) = 'target'
          order by computed_at desc
          limit 1`,
        [productCode],
      );

      const risks = await client.query<RiskRow>(
        `select count(*)::text as open_high_count
           from public.risks
          where product_code = $1
            and org_id = app.current_org_id()
            and state = 'Open'
            and bucket = 'High'`,
        [productCode],
      );

      const docs = await client.query<DocsRow>(
        `select
           count(*)::text as active_count,
           count(*) filter (
             where expiry_state = 'Expired'
                or (expires_at is not null and expires_at < current_date)
           )::text as expired_count,
           count(*) filter (
             where expiry_state <> 'Valid'
                or (expires_at is not null and expires_at < current_date)
           )::text as invalid_count
         from public.compliance_docs
        where product_code = $1
          and org_id = app.current_org_id()
          and deleted_at is null`,
        [productCode],
      );

      const docsRow = docs.rows[0] ?? { active_count: '0', expired_count: '0', invalid_count: '0' };
      const publishedAllergens = [...(productRow.allergens ?? []), ...(productRow.may_contain ?? [])];

      return {
        ok: true as const,
        data: evaluateApprovalCriteriaPure({
          formulation: { lockedAt: formulationRow.locked_at },
          nutrition: { nutriScoreGrade: nutrition.rows[0]?.grade ?? null },
          costing: { targetMarginPct: costing.rows[0]?.margin_pct ?? null },
          sensory: { required: false },
          allergens: {
            audited: true,
            passed: publishedAllergens.every((code) => code.trim().length > 0),
          },
          risks: {
            openHighCount: Number.parseInt(risks.rows[0]?.open_high_count ?? '0', 10),
          },
          docs: {
            activeCount: Number.parseInt(docsRow.active_count, 10),
            expiredCount: Number.parseInt(docsRow.expired_count, 10),
            invalidCount: Number.parseInt(docsRow.invalid_count, 10),
          },
        }),
      };
    });
  } catch (err) {
    console.error('[evaluateApprovalCriteria] persistence_failed', {
      productCode,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
