'use server';

/**
 * NPD project-stage Brief — read action.
 *
 * Resolves the brief that created an `npd_project` (the project-stage view of the
 * brief). The link is `public.brief.npd_project_id = public.npd_projects.id`
 * (unique constraint `brief_npd_project_unique`, migration 081). A project may
 * have no linked brief (created directly), in which case we surface an empty
 * state rather than an error.
 *
 * Reuses the SAME org-scoped read path as the brief-detail page
 * (`briefs/[briefId]/page.tsx`): `withOrgContext` (RLS as app_user with
 * app.current_org_id()), the same `hasPermission` shape, and the same
 * `public.brief` + `public.brief_lines` columns. Money/decimal columns are cast
 * ::text and carried as decimal STRINGS — never coerced to JS floats here.
 *
 * The brief is FROZEN after conversion (`convertBriefToFa` sets status). This is
 * a read-oriented stage view, so no write action is needed.
 *
 * RBAC read permission: `npd.brief.read` (already seeded). Resolved server-side,
 * never client-trusted.
 */

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

type BriefHeaderRow = {
  brief_id: string;
  dev_code: string;
  product_name: string | null;
  status: ProjectBriefView['status'];
  project_name: string | null;
  target_launch: string | null;
};

type BriefLineRow = {
  line_type: 'product' | 'component' | 'summary';
  line_index: number;
  product: string | null;
  volume: string | null;
  comments: string | null;
  benchmark_identified: string | null;
  price: string | null;
  primary_packaging: string | null;
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

      // Resolve the brief that created this project. RLS scopes both rows to the org.
      const header = await ctx.client.query<BriefHeaderRow>(
        `select b.brief_id,
                b.dev_code,
                b.product_name,
                b.status,
                p.name          as project_name,
                p.target_launch::text as target_launch
           from public.brief b
           join public.npd_projects p
             on p.id = b.npd_project_id
            and p.org_id = b.org_id
          where b.npd_project_id = $1::uuid
            and b.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const head = header.rows[0];
      if (!head) {
        return { state: 'empty', data: null };
      }

      const lines = await ctx.client.query<BriefLineRow>(
        `select line_type,
                line_index,
                product,
                volume::text as volume,
                comments,
                benchmark_identified,
                price,
                primary_packaging
           from public.brief_lines
          where brief_id = $1::uuid
            and org_id = app.current_org_id()
          order by line_index asc`,
        [head.brief_id],
      );

      const productLine = lines.rows.find((l) => l.line_type === 'product');
      const summaryLine = lines.rows.find((l) => l.line_type === 'summary');
      const packagingLine = lines.rows.find((l) => l.primary_packaging !== null) ?? productLine;

      const data: ProjectBriefView = {
        briefId: head.brief_id,
        devCode: head.dev_code,
        projectName: head.project_name,
        status: head.status,
        productName: productLine?.product ?? head.product_name,
        targetLaunchDate: head.target_launch,
        packFormat: packagingLine?.primary_packaging ?? null,
        expectedVolume: productLine?.volume ?? null,
        // Free-text brief comments carry the marketing-claims / constraints copy
        // until the dedicated columns land (Phase B.2 rescan). Read-only here.
        marketingClaims: null,
        category: null,
        targetRetailPriceEur: (summaryLine ?? productLine)?.price ?? null,
        salesChannel: null,
        targetAudience: null,
        constraints: productLine?.comments ?? null,
        notes: summaryLine?.comments ?? null,
      };

      return { state: 'ready', data };
    });
  } catch (error) {
    console.error('[project-brief] org-scoped read failed:', error);
    return { state: 'error', data: null };
  }
}
