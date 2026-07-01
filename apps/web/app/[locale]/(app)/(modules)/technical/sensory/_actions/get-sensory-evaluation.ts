'use server';

/**
 * Sensory EDIT prefill loader — fetch one panel header + its attribute scores +
 * panelist comments for the record modal in edit mode.
 *
 * Org-scoped through withOrgContext (RLS via app.current_org_id()); gated on
 * `technical.sensory.read` (dual-store). NUMERIC columns are cast ::text and
 * carried as decimal STRINGS at the loader boundary (the form parses them once
 * for the number inputs); this mirrors getSensoryPanel.ts.
 *
 * Parity source = existing sensory READ screens + Technical action conventions
 * (no standalone sensory JSX prototype exists).
 */

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const SENSORY_READ_PERMISSION = 'technical.sensory.read';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type SensoryEvaluationDetail = {
  panelId: string;
  subjectType: string;
  subjectRef: string;
  subjectItemId: string | null;
  status: string;
  statusReason: string | null;
  policyRequired: boolean;
  panelDate: string | null;
  panelistCount: number | null;
  benchmarkProductCode: string | null;
  /** Overall panel score /10 as a decimal STRING; null = unset. */
  overallScore: string | null;
  attributes: Array<{
    attributeName: string;
    scoreOutOf10: string | null;
    vsBenchmark: string | null;
    displayOrder: number;
  }>;
  comments: Array<{ panelistCode: string; comment: string; displayOrder: number }>;
};

export type GetSensoryEvaluationResult =
  | { ok: true; data: SensoryEvaluationDetail }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'READ_FAILED' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSensoryEvaluation(panelId: string): Promise<GetSensoryEvaluationResult> {
  if (typeof panelId !== 'string' || !UUID_RE.test(panelId.trim())) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const id = panelId.trim();

  try {
    return await withOrgContext(async (rawCtx): Promise<GetSensoryEvaluationResult> => {
      const ctx = rawCtx as OrgContextLike;

      if (!(await hasPermission(ctx, SENSORY_READ_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const header = await ctx.client.query<{
        id: string;
        subject_type: string;
        subject_ref: string;
        subject_item_id: string | null;
        status: string;
        status_reason: string | null;
        policy_required: boolean;
        panel_date: string | null;
        panelist_count: number | null;
        benchmark_product_code: string | null;
        overall_score: string | null;
      }>(
        `select id::text as id,
                subject_type,
                subject_ref,
                subject_item_id::text as subject_item_id,
                status,
                status_reason,
                policy_required,
                to_char(panel_date, 'YYYY-MM-DD') as panel_date,
                panelist_count,
                benchmark_product_code,
                overall_score::text as overall_score
           from public.technical_sensory_evaluations
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [id],
      );
      const row = header.rows[0];
      if (!row) return { ok: false, code: 'NOT_FOUND' };

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
          where panel_id = $1::uuid
            and org_id = app.current_org_id()
          order by display_order asc, attribute_name asc`,
        [id],
      );

      const comments = await ctx.client.query<{
        panelist_code: string;
        comment: string;
        display_order: number;
      }>(
        `select panelist_code, comment, display_order
           from public.technical_sensory_panelist_comments
          where panel_id = $1::uuid
            and org_id = app.current_org_id()
          order by display_order asc, panelist_code asc`,
        [id],
      );

      return {
        ok: true,
        data: {
          panelId: row.id,
          subjectType: row.subject_type,
          subjectRef: row.subject_ref,
          subjectItemId: row.subject_item_id,
          status: row.status,
          statusReason: row.status_reason,
          policyRequired: row.policy_required,
          panelDate: row.panel_date,
          panelistCount: row.panelist_count,
          benchmarkProductCode: row.benchmark_product_code,
          overallScore: row.overall_score,
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
    console.error('[technical/sensory] getSensoryEvaluation failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'READ_FAILED' };
  }
}
