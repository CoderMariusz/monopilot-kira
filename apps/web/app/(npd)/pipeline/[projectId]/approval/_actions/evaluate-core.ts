import { evaluateApprovalCriteria as evaluateApprovalCriteriaPure } from '@monopilot/domain';
import type { ApprovalCriteriaResult, EvaluateApprovalCriteriaInput } from '@monopilot/domain';

export type EvaluateApprovalCriteriaResult =
  | { ok: true; data: ApprovalCriteriaResult }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'persistence_failed'; message?: string };

const MARGIN_WARN_THRESHOLD_KEY = 'costing_margin_warn_pct';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type FormulationRow = {
  locked_at: Date | null;
  locked_version_id: string | null;
};

type NutritionRow = {
  grade: string;
};

type CostingRow = {
  margin_pct: string;
};

type MarginThresholdRow = {
  value_int: number | null;
  value_text: string | null;
};

type ProductRow = {
  product_code: string;
  allergens: string[] | null;
  may_contain: string[] | null;
  allergens_declaration_accepted: boolean;
};

type ProjectRow = {
  id: string;
};

type AllergenAuditRow = {
  audited: boolean;
};

type RiskRow = {
  open_high_count: string;
};

type DocsRow = {
  active_count: string;
  expired_count: string;
  invalid_count: string;
};

type CriterionConfigRow = {
  criterion_key: string;
  required: boolean;
};

type SensoryScoreRow = {
  overall_score: string | null;
};

/**
 * Org-scoped approval criteria evaluation using an existing transaction client.
 * Avoids nested withOrgContext when called from gate advance (same txn + project lock).
 */
export async function evaluateApprovalCriteriaWithClient(
  client: QueryClient,
  productCode: string,
): Promise<EvaluateApprovalCriteriaResult> {
  const product = await client.query<ProductRow>(
    `select product_code, allergens, may_contain, allergens_declaration_accepted
       from public.product
      where product_code = $1
        and org_id = app.current_org_id()
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  const productRow = product.rows[0];
  if (!productRow) return { ok: false as const, error: 'not_found' as const };

  const project = await client.query<ProjectRow>(
    `select id::text as id
       from public.npd_projects
      where product_code = $1
        and org_id = app.current_org_id()
      order by created_at desc
      limit 1`,
    [productCode],
  );
  const projectId = project.rows[0]?.id;

  const formulation = await client.query<FormulationRow>(
    `select f.locked_at,
            (select fv.id
               from public.formulation_versions fv
              where fv.formulation_id = f.id
                and fv.state = 'locked'
              order by fv.version_number desc
              limit 1) as locked_version_id
       from public.formulations f
      where f.product_code = $1
        and f.org_id = app.current_org_id()
      order by f.locked_at desc nulls last, f.created_at desc
      limit 1`,
    [productCode],
  );
  const formulationRow = formulation.rows[0] ?? { locked_at: null, locked_version_id: null };

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
    [productCode, formulationRow.locked_version_id],
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

  const marginThreshold = await client.query<MarginThresholdRow>(
    `select value_int, value_text
       from "Reference"."AlertThresholds"
      where threshold_key = $1`,
    [MARGIN_WARN_THRESHOLD_KEY],
  );

  const sensoryInput = await resolveSensoryInput(client, productCode, projectId);

  const allergenAudit = await client.query<AllergenAuditRow>(
    `select exists (
       select 1
         from public.allergen_cascade_rebuild_jobs
        where product_code = $1
          and org_id = app.current_org_id()
          and status = 'processed'
          and processed_at is not null
     ) as audited`,
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
  const marginThresholdPct = resolveThreshold(marginThreshold.rows[0]);
  const criterionConfig = await client.query<CriterionConfigRow>(
    `select criterion_key, required
       from public.npd_approval_criterion_config
      where org_id = app.current_org_id()`,
  );
  const requiredByCriterion = new Map(
    criterionConfig.rows.map((row) => [row.criterion_key, row.required] as const),
  );
  const requiredFor = (criterionKey: keyof ApprovalCriteriaResult, fallback = true): boolean =>
    requiredByCriterion.get(criterionKey) ?? fallback;

  return {
    ok: true as const,
    data: evaluateApprovalCriteriaPure({
      formulation: {
        required: requiredFor('C1'),
        lockedAt: formulationRow.locked_at,
      },
      nutrition: {
        required: requiredFor('C2'),
        nutriScoreGrade: nutrition.rows[0]?.grade ?? null,
      },
      costing: {
        required: requiredFor('C3'),
        targetMarginPct: costing.rows[0]?.margin_pct ?? null,
        ...(marginThresholdPct ? { marginThresholdPct } : {}),
      },
      sensory: {
        ...sensoryInput,
        required: requiredFor('C4', sensoryInput.required ?? true),
      },
      allergens: {
        required: requiredFor('C5'),
        audited: allergenAudit.rows[0]?.audited === true || productRow.allergens_declaration_accepted === true,
        passed: publishedAllergens.every((code) => code.trim().length > 0),
      },
      risks: {
        required: requiredFor('C6'),
        openHighCount: Number.parseInt(risks.rows[0]?.open_high_count ?? '0', 10),
      },
      docs: {
        required: requiredFor('C7'),
        activeCount: Number.parseInt(docsRow.active_count, 10),
        expiredCount: Number.parseInt(docsRow.expired_count, 10),
        invalidCount: Number.parseInt(docsRow.invalid_count, 10),
      },
    }),
  };
}

async function resolveSensoryInput(
  client: QueryClient,
  productCode: string,
  projectId: string | undefined,
): Promise<EvaluateApprovalCriteriaInput['sensory']> {
  if (!projectId) return { required: false };

  const panel = await client.query<SensoryScoreRow>(
    `select overall_score::text as overall_score
       from public.technical_sensory_evaluations
      where org_id = app.current_org_id()
        and (
          (subject_type = 'product' and subject_ref = $1)
          or (subject_type = 'project' and subject_ref = $2)
        )
      order by case when subject_type = 'product' then 0 else 1 end,
               evaluated_at desc nulls last,
               updated_at desc
      limit 1`,
    [productCode, projectId],
  );
  const overallScore = panel.rows[0]?.overall_score;
  return overallScore
    ? { required: true, meanScore: overallScore }
    : { required: false };
}

function resolveThreshold(row: MarginThresholdRow | undefined): string | undefined {
  if (!row) return undefined;
  if (row.value_int !== null && row.value_int !== undefined) return String(row.value_int);
  if (row.value_text !== null && row.value_text !== undefined && /^-?\d+(\.\d+)?$/.test(row.value_text.trim())) {
    return row.value_text.trim();
  }
  return undefined;
}
