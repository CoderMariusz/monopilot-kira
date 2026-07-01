'use server';

/**
 * NPD project-stage Brief — read action.
 *
 * Since the 2026-06-06 pivot the brief is FOLDED INTO the project (mig 242): the
 * capture fields live directly on `public.npd_projects` and are written by the
 * create-wizard. There is no longer a separate `public.brief` row, so this reads
 * the merged columns straight off the project. Money/decimal columns are cast
 * ::text and carried as decimal STRINGS — never coerced to JS floats here.
 *
 * `withOrgContext` (RLS as app_user with app.current_org_id()). The brief view is
 * read-oriented (the wizard owns writes), so no write action is needed here.
 *
 * RBAC read permission: `npd.brief.read` (already seeded). Resolved server-side,
 * never client-trusted.
 */

import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

export type ProjectBriefState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

/** Project-stage brief view (read-oriented; the brief is frozen post-conversion). */
export type ProjectBriefView = {
  briefId: string;
  devCode: string;
  projectName: string | null;
  /** brief.status — drives the "✓ Completed" badge (complete/converted). */
  status: 'draft' | 'complete' | 'converted' | 'abandoned';
  /** LEFT column. */
  productName: string | null;
  /** ISO date string from npd_projects.target_launch (or null). */
  targetLaunchDate: string | null;
  packFormat: string | null;
  /** Costing v2: pack net weight in grams (the recipe batch size). */
  packWeightG: string | null;
  packsPerCase: number | null;
  expectedVolume: string | null;
  marketingClaims: string | null;
  /** RIGHT column. */
  category: string | null;
  targetRetailPriceEur: string | null;
  salesChannel: string | null;
  targetAudience: string | null;
  /** Full-width. */
  constraints: string | null;
  notes: string | null;
};

export type ReadProjectBriefResult = {
  state: ProjectBriefState;
  data: ProjectBriefView | null;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.brief.read';

type ProjectBriefRow = {
  id: string;
  code: string;
  name: string | null;
  type: string | null;
  current_stage: string;
  target_launch: string | null;
  pack_format: string | null;
  pack_weight_g: string | null;
  packs_per_case: number | null;
  sales_channel: string | null;
  expected_volume: string | null;
  target_retail_price_eur: string | null;
  target_audience: string | null;
  marketing_claims: string | null;
  constraints: string | null;
  notes: string | null;
};

export async function readProjectBrief(projectId: string): Promise<ReadProjectBriefResult> {
  if (!projectId) return { state: 'empty', data: null };
  try {
    return await withOrgContext(async (rawCtx): Promise<ReadProjectBriefResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null };
      }

      // Brief fields are merged onto the project (mig 242). RLS scopes to the org.
      const result = await ctx.client.query<ProjectBriefRow>(
        `select id,
                code,
                name,
                type,
                current_stage,
                target_launch::text            as target_launch,
                pack_format,
                pack_weight_g::text            as pack_weight_g,
                packs_per_case,
                sales_channel,
                expected_volume,
                target_retail_price_eur::text  as target_retail_price_eur,
                target_audience,
                marketing_claims,
                constraints,
                notes
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const row = result.rows[0];
      if (!row) {
        return { state: 'empty', data: null };
      }

      const data: ProjectBriefView = {
        // No separate brief row — the project IS the brief.
        briefId: row.id,
        devCode: row.code,
        projectName: row.name,
        // Brief is captured at creation, so it is always "complete"; once the
        // project leaves the brief stage it reads as frozen ("converted").
        status: row.current_stage === 'brief' ? 'complete' : 'converted',
        productName: row.name,
        targetLaunchDate: row.target_launch,
        packFormat: row.pack_format,
        packWeightG: row.pack_weight_g,
        packsPerCase: row.packs_per_case,
        expectedVolume: row.expected_volume,
        marketingClaims: row.marketing_claims,
        category: row.type,
        targetRetailPriceEur: row.target_retail_price_eur,
        salesChannel: row.sales_channel,
        targetAudience: row.target_audience,
        constraints: row.constraints,
        notes: row.notes,
      };

      return { state: 'ready', data };
    });
  } catch (error) {
    console.error('[project-brief] org-scoped read failed:', error);
    return { state: 'error', data: null };
  }
}
