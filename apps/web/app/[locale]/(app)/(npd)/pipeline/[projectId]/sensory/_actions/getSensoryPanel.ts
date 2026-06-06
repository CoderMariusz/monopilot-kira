'use server';

/**
 * Fala-3 — `getSensoryPanel` READ action (NPD Sensory stage).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/sensory
 *
 * Ownership boundary (HARD): sensory is OWNED by 03-Technical. This NPD stage is
 * a READ-ONLY display of the Technical-owned sensory PANEL for the project's
 * product. There is NO write path here — writes belong to Technical. RBAC gates
 * on `technical.sensory.read` (byte-identical to the seeded GRANT string in
 * packages/db/migrations/236 / the enum TECHNICAL_SENSORY_READ).
 *
 * Real data only (no mocks). Resolves the project's product, then reads the
 * Technical sensory evaluation(s) for it + per-attribute scores + panelist
 * comments. Everything is org-scoped through withOrgContext → app.set_org_context
 * → RLS (org_id = app.current_org_id()). No tenant_id / current_setting.
 *
 * NUMERIC-exact: every score / benchmark column is cast ::text in SQL and carried
 * as a decimal STRING — never coerced to a JS float in the loader.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { SENSORY_READ_PERMISSION } from './constants';

export type SensoryPanelState =
  | 'ready'
  | 'empty'
  | 'error'
  | 'permission_denied';

/** One radar / table attribute row (score/10 + ±benchmark). Decimal STRINGS. */
export type SensoryAttributeScore = {
  attributeName: string;
  /** 0..10 attribute score as a decimal STRING (NUMERIC(4,2)); null = unscored. */
  scoreOutOf10: string | null;
  /** Signed ± delta vs the benchmark as a decimal STRING; null = no benchmark. */
  vsBenchmark: string | null;
  displayOrder: number;
};

export type SensoryPanelistComment = {
  panelistCode: string;
  comment: string;
  displayOrder: number;
};

export type SensoryPanelData = {
  panelId: string;
  productCode: string;
  productName: string;
  /** Panel-level fields from technical_sensory_evaluations (mig 237 extension). */
  panelDate: string | null;
  panelistCount: number | null;
  benchmarkProductCode: string | null;
  /** Overall panel score /10 as a decimal STRING (NUMERIC(4,2)); null = unset. */
  overallScore: string | null;
  status: string;
  attributes: SensoryAttributeScore[];
  comments: SensoryPanelistComment[];
};

export type GetSensoryPanelResult =
  | { state: 'ready'; data: SensoryPanelData }
  | { state: 'empty'; data: null }
  | { state: 'error'; data: null }
  | { state: 'permission_denied'; data: null };

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

export async function getSensoryPanel(projectId: string): Promise<GetSensoryPanelResult> {
  if (!projectId || typeof projectId !== 'string') {
    return { state: 'empty', data: null };
  }

  try {
    return await withOrgContext(async (rawCtx): Promise<GetSensoryPanelResult> => {
      const ctx = rawCtx as OrgContextLike;

      // RBAC — Technical owns sensory; gate the read on technical.sensory.read.
      const canRead = await hasPermission(ctx, SENSORY_READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null };
      }

      // Resolve the project's product (the sensory subject). RLS scopes to org.
      const project = await ctx.client.query<{ product_code: string | null; product_name: string | null }>(
        `select p.product_code,
                pr.product_name
           from public.npd_projects p
           left join public.product pr
             on pr.org_id = p.org_id
            and pr.product_code = p.product_code
          where p.id = $1::uuid
            and p.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const productCode = project.rows[0]?.product_code;
      if (!productCode) {
        return { state: 'empty', data: null };
      }
      const productName = project.rows[0]?.product_name ?? productCode;

      // The Technical-owned sensory evaluation row IS the panel (mig 166 + 237).
      // The subject is the product/project; prefer a product-subject row, fall
      // back to a project-subject row. RLS scopes to the org. NUMERIC ::text.
      const panel = await ctx.client.query<{
        id: string;
        status: string;
        panel_date: string | null;
        panelist_count: number | null;
        benchmark_product_code: string | null;
        overall_score: string | null;
      }>(
        `select id,
                status,
                to_char(panel_date, 'YYYY-MM-DD') as panel_date,
                panelist_count,
                benchmark_product_code,
                overall_score::text as overall_score
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
      const panelRow = panel.rows[0];
      if (!panelRow) {
        return { state: 'empty', data: null };
      }

      // Per-attribute radar/table rows (score/10 + ±benchmark). NUMERIC ::text.
      const attrs = await ctx.client.query<{
        attribute_name: string;
        score_out_of_10: string | null;
        vs_benchmark: string | null;
        display_order: number;
      }>(
        `select attribute_name,
                score_out_of_10::text as score_out_of_10,
                vs_benchmark::text as vs_benchmark,
                display_order
           from public.technical_sensory_attribute_scores
          where org_id = app.current_org_id()
            and panel_id = $1::uuid
          order by display_order asc, attribute_name asc`,
        [panelRow.id],
      );

      // Panelist comments.
      const comments = await ctx.client.query<{
        panelist_code: string;
        comment: string;
        display_order: number;
      }>(
        `select panelist_code, comment, display_order
           from public.technical_sensory_panelist_comments
          where org_id = app.current_org_id()
            and panel_id = $1::uuid
          order by display_order asc, panelist_code asc`,
        [panelRow.id],
      );

      return {
        state: 'ready',
        data: {
          panelId: panelRow.id,
          productCode,
          productName,
          panelDate: panelRow.panel_date,
          panelistCount: panelRow.panelist_count,
          benchmarkProductCode: panelRow.benchmark_product_code,
          overallScore: panelRow.overall_score,
          status: panelRow.status,
          attributes: attrs.rows.map((a) => ({
            attributeName: a.attribute_name,
            scoreOutOf10: a.score_out_of_10,
            vsBenchmark: a.vs_benchmark,
            displayOrder: a.display_order,
          })),
          comments: comments.rows.map((c) => ({
            panelistCode: c.panelist_code,
            comment: c.comment,
            displayOrder: c.display_order,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[getSensoryPanel] org-scoped read failed:', error);
    return { state: 'error', data: null };
  }
}
