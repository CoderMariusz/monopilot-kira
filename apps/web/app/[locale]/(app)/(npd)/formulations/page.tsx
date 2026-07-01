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
import { hasPermission } from '../../../../../lib/auth/has-permission';
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

// NOTE: there is no dedicated `npd.formulation.read` in the seeded permission
// vocabulary (migration 080/149 seed only npd.formulation.create_draft / .lock).
// This cross-FG list is a read view scoped to Finished Goods, so it gates on the
// already-seeded FG read permission. A dedicated npd.formulation.read can be added
// to the org-admin seed (mirror mig 149) during the NPD backend wave if desired.
const READ_PERMISSION = 'npd.fa.read';

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
      //
      // F6 (W9 cross-review BLOCKER): the allergen union resolves ITEM-LINKED
      // ingredient lines LIVE from the SSOT public.item_allergen_profiles
      // (pre-aggregated CTE keyed by item_id, single left join — the
      // get-formulation.ts shape), so locked/legacy versions can never surface
      // a stale stored cache here. The stored column is read ONLY for legacy
      // free-text lines (item_id IS NULL), which have no SSOT source.
      const result = await ctx.client.query<FormulationLoaderRow>(
        `with profile_allergens as (
           select iap.item_id,
                  array_agg(distinct iap.allergen_code order by iap.allergen_code) as codes
             from public.item_allergen_profiles iap
            where iap.org_id = app.current_org_id()
            group by iap.item_id
         )
         select fv.id                                   as version_id,
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
                        from public.formulation_ingredients fi2
                        left join profile_allergens pa on pa.item_id = fi2.item_id
                        cross join lateral unnest(
                          case
                            when fi2.item_id is not null then coalesce(pa.codes, '{}'::text[])
                            else coalesce(fi2.allergens_inherited, '{}'::text[])
                          end
                        ) as a
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
