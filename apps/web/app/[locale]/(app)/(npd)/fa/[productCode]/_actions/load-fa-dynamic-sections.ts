'use server';

/**
 * A3 (NPD-DYN) · SLICE 1 — FA dynamic-sections DATA LAYER (definitions only).
 *
 * Reads the per-org dynamic NPD catalog (migration 333 + seed 370) and returns
 * the field DEFINITIONS grouped into the 3 owner-facing sections the upcoming
 * render slice will consume. This slice is ADDITIVE — it does NOT touch the live
 * FA detail page / tabs / dept-status strip. It also deliberately does NOT read
 * any product field VALUES; the render slice joins those onto this structure.
 *
 * Source tables (all org-scoped, RLS-pinned to app.current_org_id()):
 *   public.npd_departments d        — code / name / display_order / active
 *   public.npd_department_field df  — visible / required / display_order / field_id
 *   public.npd_field_catalog f      — code / label / data_type
 *
 * Contract (mirrors the sibling fa/* actions, e.g. get-fa-bom.ts):
 *   - withOrgContext (app_user + RLS pinned to app.current_org_id());
 *   - server-side RBAC (npd.fa.read — the SAME read permission the FG detail
 *     page and every other FA tab enforce; never client-trusted);
 *   - error envelope: throws AuthError('FORBIDDEN') on RBAC failure (caught by
 *     the page loader into a discrete state) — identical to get-fa-bom.ts;
 *   - no mocks, no migrations, no writes.
 *
 * 'use server' files may export ONLY async functions — the section grouping
 * constant (SECTION_MAP) and the public types live in the sibling
 * load-fa-dynamic-sections.types.ts so this module exports just the async loader.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from '../../../../../../(npd)/fa/actions/errors';
import {
  FA_DYNAMIC_SECTIONS_READ_PERMISSION,
  type FaDynamicField,
  type FaDynamicSection,
  type FaDynamicSectionsResult,
} from './load-fa-dynamic-sections.types';
// Re-exported so callers can `import { SECTION_MAP } from './load-fa-dynamic-sections'`
// — but the constant itself is DECLARED in the .types sibling because a
// 'use server' module may only export async functions.
import { SECTION_MAP } from './load-fa-dynamic-sections.types';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

/** Trailing bucket for any active dept not claimed by a SECTION_MAP entry. */
const OTHER_SECTION_KEY = 'other';
const OTHER_SECTION_LABEL = 'Other';

/** Raw catalog join row (definition only — no product values). */
type CatalogRow = {
  dept_code: string | null;
  dept_display_order: number | null;
  field_code: string | null;
  field_label: string | null;
  field_data_type: string | null;
  df_required: boolean | null;
  df_display_order: number | null;
  /** mig 374 — auto-derived flags carried through for the fully-dynamic render. */
  field_is_auto: boolean | null;
  field_auto_source: string | null;
};

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

/**
 * Resolve which section a department code belongs to. Returns the SECTION_MAP
 * key for a mapped dept, or the trailing 'other' bucket key otherwise. Matching
 * is case-insensitive so a re-cased dept code in the catalog never silently
 * drops out of every section.
 */
function sectionKeyForDept(deptCode: string): string {
  const lower = deptCode.trim().toLowerCase();
  for (const entry of SECTION_MAP) {
    if (entry.depts.some((d) => d.toLowerCase() === lower)) return entry.key;
  }
  return OTHER_SECTION_KEY;
}

/**
 * Read the dynamic FA field DEFINITIONS for the org and group them into the 3
 * owner-facing sections (plus a trailing 'other' bucket if — and only if — the
 * org configured an active dept that no SECTION_MAP entry claims, so an unmapped
 * dept can never crash or vanish).
 *
 * Org-scoped via withOrgContext + app.current_org_id(); RBAC resolved
 * server-side (npd.fa.read). productCode is accepted (and validated) so this
 * loader matches the per-FG signature the render slice will call, but NO product
 * VALUES are read here — definitions/structure only.
 */
export async function loadFaDynamicSections(productCode: string): Promise<FaDynamicSectionsResult> {
  // Validate the arg up-front for a stable signature; the value is not used in a
  // query in this slice (definitions are org-wide, not per-FG).
  normalizeProductCode(productCode);

  return withOrgContext<FaDynamicSectionsResult>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;

    if (!(await hasPermission(ctx, FA_DYNAMIC_SECTIONS_READ_PERMISSION))) {
      throw new AuthError(
        'FORBIDDEN',
        `${FA_DYNAMIC_SECTIONS_READ_PERMISSION} is required to read the FA field catalog`,
      );
    }

    // Visible, active field assignments joined to their catalog definitions.
    // Ordered by department display_order then the field's df.display_order so the
    // caller can group in arrival order without a second sort. Every bind param is
    // explicitly ::cast per the repo SQL convention; org scope is RLS-pinned and
    // re-asserted in every join predicate (df.org_id = d.org_id, f.org_id =
    // df.org_id) so a cross-org field assignment cannot leak in.
    const { rows } = await ctx.client.query<CatalogRow>(
      `select
          d.code               as dept_code,
          d.display_order      as dept_display_order,
          f.code               as field_code,
          f.label              as field_label,
          f.data_type          as field_data_type,
          coalesce(f.is_auto, false) as field_is_auto,
          f.auto_source_field  as field_auto_source,
          df.required          as df_required,
          df.display_order     as df_display_order
         from public.npd_departments d
         join public.npd_department_field df
           on df.department_id = d.id
          and df.org_id = d.org_id
         join public.npd_field_catalog f
           on f.id = df.field_id
          and f.org_id = df.org_id
        where d.org_id = app.current_org_id()
          and d.active = $1::boolean
          and df.visible = $2::boolean
        order by d.display_order asc, d.code asc, df.display_order asc, f.code asc`,
      [true, true],
    );

    // Seed the 3 canonical sections in SECTION_MAP order; the trailing 'other'
    // bucket is created lazily and only emitted if it ends up with fields.
    const bySection = new Map<string, FaDynamicField[]>();
    const sectionOrder: string[] = [];
    const sectionLabels = new Map<string, string>();
    /** dept code → its npd_departments.display_order (for the defensive re-sort). */
    const deptDisplayOrder = new Map<string, number>();
    for (const entry of SECTION_MAP) {
      bySection.set(entry.key, []);
      sectionOrder.push(entry.key);
      sectionLabels.set(entry.key, entry.label);
    }

    for (const row of rows) {
      const deptCode = (row.dept_code ?? '').trim();
      const fieldCode = (row.field_code ?? '').trim();
      if (!deptCode || !fieldCode) continue;

      if (!deptDisplayOrder.has(deptCode)) {
        deptDisplayOrder.set(deptCode, Number(row.dept_display_order ?? 0));
      }

      const key = sectionKeyForDept(deptCode);
      if (!bySection.has(key)) {
        // First unmapped dept — register the trailing 'other' bucket once.
        bySection.set(key, []);
        sectionOrder.push(key);
        sectionLabels.set(key, OTHER_SECTION_LABEL);
      }

      // mig 374 — carry auto-awareness into the dynamic field definition so the
      // future fully-dynamic render renders auto fields read-only + value-overridden
      // exactly as the current static render does.
      const auto = row.field_is_auto === true;
      const autoSourceField =
        auto && (row.field_auto_source ?? '').trim() !== ''
          ? (row.field_auto_source as string).trim().toLowerCase()
          : undefined;

      bySection.get(key)!.push({
        code: fieldCode,
        label: (row.field_label ?? fieldCode).trim() || fieldCode,
        dataType: (row.field_data_type ?? 'text').trim() || 'text',
        required: row.df_required === true,
        deptCode,
        displayOrder: Number(row.df_display_order ?? 0),
        auto: auto || undefined,
        readOnly: auto || undefined,
        autoSourceField,
      });
    }

    // Defensive re-sort within each section: the SQL already orders by
    // d.display_order then df.display_order, but the loader does NOT rely solely
    // on row arrival order — it re-sorts by (deptDisplayOrder, displayOrder,
    // code) so the contract "fields ordered by display_order" holds even if a
    // future caller / view returns rows unordered. deptDisplayOrder is captured
    // off the catalog rows below.
    const sections: FaDynamicSection[] = sectionOrder.map((key) => {
      const fields = (bySection.get(key) ?? []).slice().sort((a, b) => {
        const ad = deptDisplayOrder.get(a.deptCode) ?? 0;
        const bd = deptDisplayOrder.get(b.deptCode) ?? 0;
        if (ad !== bd) return ad - bd;
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.code.localeCompare(b.code);
      });
      return { key, label: sectionLabels.get(key) ?? key, fields };
    });

    return { ok: true, sections };
  });
}
