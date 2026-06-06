/**
 * Formulations list page (module-level, cross-FG) — RSC.
 *
 * Route: /[locale]/(app)/(npd)/formulations  (the NpdSubNav "Formulations" tab).
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS-enforced
 * as app_user with app.current_org_id()). No mocks, no hard-coded rows. Flattens
 * EVERY formulation version across the org by joining:
 *   - public.formulations          → formulation header (project_id, product_code)
 *   - public.formulation_versions  → one row per version (number, state, created_at)
 *   - public.product               → parent FG name (org_id, product_code)
 *   - public.formulation_ingredients → item count + allergen union per version
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:7-76 (FormulationList)
 *
 * Rows link into the EXISTING per-project formulation editor
 * (/[locale]/pipeline/[projectId]/formulation) — this page does not rebuild it.
 */

import { getTranslations } from 'next-intl/server';

import {
  FormulationsList,
  type FormulationListRow,
  type FormulationsListLabels,
  type PageState,
} from './_components/formulations-list';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type FormulationsPageProps = {
  params?: Promise<{ locale: string }>;
  // Test-only injection seam (mirrors fa/page.tsx convention).
  rows?: FormulationListRow[];
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type FormulationLoaderRow = {
  version_id: string;
  project_id: string;
  fg_code: string | null;
  fg_name: string | null;
  version_number: number;
  state: string;
  effective_from: string | null;
  item_count: number | string | null;
  allergen_codes: string[] | null;
};

type LoaderResult = { state: PageState; rows: FormulationListRow[] };

const READ_PERMISSION = 'npd.formulation.read';

const DEFAULT_LABELS: FormulationsListLabels = {
  title: 'Formulations',
  subtitle: 'Cross-FG view of all formulation versions',
  searchPlaceholder: 'Search FG code, name or version…',
  filterFg: 'Finished Good',
  filterStatus: 'Status',
  clearFilters: 'Clear filters',
  fgAll: 'All Finished Goods',
  statusAll: 'All statuses',
  statusDraft: 'Draft',
  statusSubmitted: 'Submitted for trial',
  statusLocked: 'Locked',
  colFg: 'Finished Good',
  colVersion: 'Version',
  colStatus: 'Status',
  colEffectiveFrom: 'Effective from',
  colEffectiveTo: 'Effective to',
  colItems: 'Items',
  colAllergens: 'Allergens',
  colActions: 'Actions',
  open: 'Open',
  current: 'current',
  none: '—',
  loading: 'Loading formulations…',
  empty: 'No formulations match your filters',
  emptyBody:
    'Formulation versions are created from the recipe editor inside an NPD project. Create one or clear filters.',
  error: 'Unable to load formulations. Try again after the backend is available.',
  forbidden: 'You do not have permission to view formulations.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FormulationsListLabels>;

function translateLabel(t: (key: string) => string, key: keyof FormulationsListLabels): string {
  try {
    const value = t(key);
    return value === key ? (DEFAULT_LABELS[key] ?? key) : value;
  } catch {
    return DEFAULT_LABELS[key] ?? key;
  }
}

async function buildLabels(locale: string): Promise<FormulationsListLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.formulations' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as FormulationsListLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

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

function toRow(row: FormulationLoaderRow): FormulationListRow {
  const codes = (row.allergen_codes ?? []).filter(Boolean);
  return {
    versionId: row.version_id,
    projectId: row.project_id,
    fgCode: row.fg_code,
    fgName: row.fg_name,
    version: `v${row.version_number}`,
    status: row.state,
    effectiveFrom: row.effective_from,
    // No effective_to column is modelled yet (single live version per formulation);
    // null ⇒ the client renders the "current" label (prototype line 65).
    effectiveTo: null,
    itemCount: Number(row.item_count ?? 0),
    allergenSummary: codes.length > 0 ? codes.join(', ') : null,
  };
}

async function readPageData(): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', rows: [] };
      }

      // Cross-FG flatten of every formulation version in the org. Org-scoping is
      // enforced by RLS (org_id = app.current_org_id()); the explicit predicate
      // documents intent and survives a missing policy. The ingredient roll-up
      // (count + allergen union) is a correlated subquery per version.
      const result = await ctx.client.query<FormulationLoaderRow>(
        `select fv.id                                   as version_id,
                f.project_id                            as project_id,
                f.product_code                          as fg_code,
                p.product_name                          as fg_name,
                fv.version_number                       as version_number,
                fv.state                                as state,
                fv.created_at::date::text               as effective_from,
                coalesce(agg.item_count, 0)             as item_count,
                agg.allergen_codes                      as allergen_codes
           from public.formulations f
           join public.formulation_versions fv
             on fv.formulation_id = f.id
           left join public.product p
             on p.org_id = f.org_id and p.product_code = f.product_code
           left join lateral (
             select count(*)::int as item_count,
                    array(
                      select distinct a
                        from public.formulation_ingredients fi2,
                             unnest(fi2.allergens_inherited) as a
                       where fi2.version_id = fv.id
                       order by a
                    ) as allergen_codes
               from public.formulation_ingredients fi
              where fi.version_id = fv.id
           ) agg on true
          where f.org_id = app.current_org_id()
          order by fv.created_at desc, f.product_code asc, fv.version_number desc`,
      );

      const rows = result.rows.map(toRow);
      return { state: rows.length === 0 ? 'empty' : 'ready', rows };
    });
  } catch (error) {
    console.error('[formulations-list] org-scoped read failed:', error);
    return { state: 'error', rows: [] };
  }
}

export default async function FormulationsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FormulationsPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.rows);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
      }
    : await readPageData();

  return <FormulationsList rows={loaded.rows} labels={labels} state={props.state ?? loaded.state} />;
}
