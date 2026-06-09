'use server';

/**
 * FA BOM tab — READ-ONLY server action (Lane 12).
 *
 * Surfaces the FA's computed BOM (the SCR-03h "BOM (computed view)" tab,
 * prototype fa-screens.jsx:840-886) inside the FG detail tab strip. The shared
 * tables `public.bom_headers` / `public.bom_lines` are the BOM SSOT — Technical
 * owns every write; THIS action only reads. There is no write surface here: the
 * empty state links the user to /technical/bom (the canonical write screens stay
 * in Technical per the product decision).
 *
 * Read path (real data, RLS): `public.get_fa_bom(product_code)` (migration 099)
 * picks the single best header for the FG (active > technical_approved >
 * in_review > draft, then highest version) and returns its ordered lines with the
 * header status + version. We join `public.d365_import_cache` for the per-line
 * D365 status badge — the SAME join `public.fa_bom_view` (migration 133) uses,
 * but WITHOUT the view's `built = false` filter so a built FA still shows its
 * frozen BOM. The export CSV action (`bom-export-csv.ts`) reads the view; this
 * tab read mirrors the view's projection so the on-screen rows and the exported
 * rows are identical.
 *
 * Contract (mirrors the sibling fa/* actions): withOrgContext (app_user + RLS
 * pinned to app.current_org_id()), server-side RBAC (npd.fa.read — the same read
 * permission the FG detail page and every other FA tab enforce; never
 * client-trusted), no mocks, no migrations.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from '../../../../../../(npd)/fa/actions/errors';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

// Types + the permission constant live in fa-bom-types.ts — a 'use server'
// module may export only async functions (Turbopack build rule).
import { FA_BOM_READ_PERMISSION, type FaBomLine, type FaBomResult, type FaBomVersion } from './fa-bom-types';

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

function normalizeProductCode(productCode: string): string {
  const normalized = (productCode ?? '').trim();
  if (!normalized) throw new ValidationError('INVALID_PRODUCT_CODE', 'productCode is required');
  return normalized;
}

type BomRow = {
  bom_header_id: string;
  status: string | null;
  version: number | string | null;
  component_type: string | null;
  component_code: string | null;
  component_name: string | null;
  quantity: string | null;
  process_stage: string | null;
  source: string | null;
  d365_status: string | null;
};

/**
 * READ-ONLY: returns the FA's best BOM version header + its lines for the given
 * product code, org-scoped via withOrgContext + app.current_org_id(). RBAC is
 * resolved server-side (npd.fa.read). Returns `{ state: 'empty' }` when the FG
 * has no BOM header (no rows), which drives the read-only empty state in the tab.
 */
export async function getFaBom(productCode: string): Promise<FaBomResult> {
  const normalized = normalizeProductCode(productCode);

  return withOrgContext<FaBomResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;

    if (!(await hasPermission(ctx, FA_BOM_READ_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${FA_BOM_READ_PERMISSION} is required to read the FA BOM`);
    }

    // `get_fa_bom` selects the single best header + its ordered lines. The D365
    // status join + name lookup mirror `public.fa_bom_view`, minus its
    // `built = false` filter (built FAs keep showing their frozen BOM). The
    // identifiers in the join are fixed (no user input); org scope is RLS-pinned.
    const { rows } = await ctx.client.query<BomRow>(
      `select
          bom.bom_header_id,
          bom.status,
          bom.version,
          bom.component_type,
          bom.component_code,
          coalesce(nullif(item.name, ''), bom.component_code) as component_name,
          bom.quantity::text as quantity,
          coalesce(nullif(bom.manufacturing_operation_name, ''), '') as process_stage,
          coalesce(nullif(bom.source, ''), '') as source,
          coalesce(nullif(d365.status, ''), 'Empty') as d365_status
         from public.get_fa_bom($1) bom
         left join public.d365_import_cache d365
           on d365.org_id = app.current_org_id()
          and d365.code = bom.component_code
         left join public.items item
           on item.org_id = app.current_org_id()
          and item.item_code = bom.component_code
        order by bom.line_no`,
      [normalized],
    );

    if (rows.length === 0) {
      return { state: 'empty' };
    }

    const first = rows[0];
    const version: FaBomVersion = {
      bomHeaderId: String(first.bom_header_id),
      status: first.status ?? '',
      version: Number(first.version ?? 1),
      lineCount: rows.length,
    };

    const lines: FaBomLine[] = rows.map((r) => ({
      componentType: (r.component_type ?? '').trim(),
      componentCode: r.component_code ?? '',
      componentName: r.component_name ?? r.component_code ?? '',
      quantity: r.quantity ?? '',
      processStage: r.process_stage ?? '',
      source: r.source ?? '',
      d365Status: r.d365_status ?? 'Empty',
    }));

    return { state: 'ready', version, lines };
  });
}
