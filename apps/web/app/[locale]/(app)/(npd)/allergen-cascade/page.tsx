/**
 * Top-level NPD "Allergen cascade" screen — /[locale]/allergen-cascade.
 *
 * Module-level entry for the allergen cascade. The subnav tab "Allergen cascade"
 * (lib/navigation/npd-nav.ts) links here. Unlike the per-FG route
 * ([locale]/(app)/(npd)/fa/[productCode]/allergens), this page adds a TOP-LEVEL FG
 * SELECTOR: it lists the org's FGs, picks one from `?fg=` (alias `?productCode=`,
 * default = first FG), and renders that FG's cascade.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-145
 *   (AllergenCascade) — page head with title + EU-FIC 1169/2011 subtitle + the
 *   FG/FA selector dropdown + Refresh; 3-column derivation grid (RM red badges /
 *   process+may-contain amber badges / FG-final blue-bordered Contains + May contain)
 *   + cascade diagram + derivation note. The grid + Refresh + badges are owned by the
 *   reused AllergenCascadeSection/AllergenCascadeWidget (T-040); this page contributes
 *   the head + the new FG selector. The raw <select> is translated to shadcn Select.
 *
 * REUSE (does NOT re-author the cascade engine):
 *   - loader:    loadAllergenCascade   (reads the REAL public.fa_allergen_cascade VIEW
 *                                       + overrides via readAllergenCascade, RLS as
 *                                       app_user under app.current_org_id())
 *   - labels:    buildAllergenLabels   (next-intl npd.allergenWidget namespace)
 *   - renderer:  AllergenCascadeSection (wires the route-agnostic refresh/override
 *                                        Server Actions; derived badges stay read-only)
 *   from ../fa/[productCode]/_lib/allergen-cascade — the same helper the FA-detail
 *   Technical tab uses, so the two surfaces stay in sync. No prop tweak was needed:
 *   the section already renders fully standalone (own title, sections, EU14 card).
 *
 * Real org-scoped data only — the FG list is read via withOrgContext (RLS); no mocks.
 * RBAC for the cascade itself (npd.allergen.write / read) is resolved server-side
 * inside the reused loader and never trusted from the client.
 *
 * Five UI states:
 *   loading           → Suspense skeleton (page) + the widget's own loading notice
 *   empty (no FG)     → page-level empty card (org has no Finished Goods)
 *   empty (no data)   → the reused widget's empty notice for the selected FG
 *   error             → page-level error alert (FG list read failed)
 *   permission-denied → surfaced by the reused loader as the widget's forbidden notice
 *
 * Next.js 16: no non-serializable function props cross the RSC boundary — the FG
 * selector client island receives plain serializable props only.
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import {
  AllergenCascadeSection,
  buildAllergenLabels,
  loadAllergenCascade,
  type AllergenLoad,
} from '../../../../(npd)/fa/[productCode]/_lib/allergen-cascade';
import { FgSelector, type FgSelectorOption } from './_components/fg-selector';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type FgRow = { product_code: string; product_name: string | null };

export type FgListState = 'ready' | 'loading' | 'empty' | 'error';

export type FgListResult = {
  state: FgListState;
  fgs: FgSelectorOption[];
};

type AllergenLabels = Awaited<ReturnType<typeof buildAllergenLabels>>;

type PageLabels = {
  title: string;
  subtitle: string;
  breadcrumb: string;
  selectorLabel: string;
  selectorPlaceholder: string;
  emptyTitle: string;
  emptyBody: string;
  error: string;
  loading: string;
};

const DEFAULT_PAGE_LABELS: PageLabels = {
  title: 'Allergen cascade preview',
  subtitle:
    'Visual trace RM → process → FG · EU FIC 1169/2011 · 14 mandatory allergens. Auto-derived badges are read-only.',
  breadcrumb: 'NPD / Allergen cascade',
  selectorLabel: 'Finished Good',
  selectorPlaceholder: 'Select a Finished Good…',
  emptyTitle: 'No Finished Goods yet',
  emptyBody:
    'The allergen cascade is derived per Finished Good. Create an FG (from a converted Brief) to see its allergen declaration here.',
  error: 'Unable to load Finished Goods. Try again after the backend is available.',
  loading: 'Loading allergen cascade…',
};

const PAGE_LABEL_KEYS = Object.keys(DEFAULT_PAGE_LABELS) as Array<keyof PageLabels>;

function translatePageLabel(t: (key: string) => string, key: keyof PageLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_PAGE_LABELS[key] : value;
  } catch {
    return DEFAULT_PAGE_LABELS[key];
  }
}

async function buildPageLabels(locale: string): Promise<PageLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.allergenCascade' });
    return PAGE_LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translatePageLabel(t, key);
      return labels;
    }, {} as PageLabels);
  } catch {
    return { ...DEFAULT_PAGE_LABELS };
  }
}

/** Org-scoped FG list (REAL data, RLS-enforced). NO mocks. */
async function readFgList(): Promise<FgListResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<FgListResult> => {
      const ctx = rawCtx as OrgContextLike;
      // RLS enforces org scoping (org_id = app.current_org_id()); the explicit
      // predicate documents intent and survives a missing policy.
      const result = await ctx.client.query<FgRow>(
        `select product_code, product_name
           from public.product
          where org_id = app.current_org_id()
          order by product_code asc`,
      );
      const fgs: FgSelectorOption[] = result.rows.map((row) => ({
        value: row.product_code,
        label: row.product_name ? `${row.product_code} — ${row.product_name}` : row.product_code,
      }));
      return { state: fgs.length === 0 ? 'empty' : 'ready', fgs };
    });
  } catch (error) {
    console.error('[allergen-cascade] org-scoped FG list read failed:', error);
    return { state: 'error', fgs: [] };
  }
}

type AllergenCascadePageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ fg?: string; productCode?: string }>;
  // Test-only injection seam (mirrors the fa/page.tsx + allergens/page.tsx convention).
  fgList?: FgListResult;
  allergenLoad?: AllergenLoad;
};

function PageSkeleton({ label }: { label: string }) {
  return (
    <div data-testid="allergen-cascade-loading" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div className="h-10 w-64 animate-pulse rounded border border-slate-200 bg-slate-100" />
      <div className="h-64 animate-pulse rounded border border-slate-200 bg-slate-100" />
    </div>
  );
}

export async function CascadeBody({
  locale,
  requestedFg,
  pageLabels,
  allergenLabels,
  injectedFgList,
  injectedAllergenLoad,
}: {
  locale: string;
  requestedFg: string | undefined;
  pageLabels: PageLabels;
  allergenLabels: AllergenLabels;
  injectedFgList?: FgListResult;
  injectedAllergenLoad?: AllergenLoad;
}) {
  const fgList = injectedFgList ?? (await readFgList());

  if (fgList.state === 'error') {
    return (
      <div role="alert" data-testid="allergen-cascade-fg-error" className="alert alert-red">
        {pageLabels.error}
      </div>
    );
  }

  if (fgList.state === 'empty' || fgList.fgs.length === 0) {
    return (
      <div data-testid="allergen-cascade-empty" className="card">
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">⇣</span>
          <p className="empty-state-title">{pageLabels.emptyTitle}</p>
          <p className="empty-state-body">{pageLabels.emptyBody}</p>
        </div>
      </div>
    );
  }

  // Resolve the selected FG: ?fg= (or ?productCode= alias) when it is a real FG for
  // this org, otherwise default to the first FG.
  const validCodes = new Set(fgList.fgs.map((f) => f.value));
  const selectedFg =
    requestedFg && validCodes.has(requestedFg) ? requestedFg : fgList.fgs[0]!.value;

  const load =
    injectedAllergenLoad ?? (await loadAllergenCascade(selectedFg, locale));

  return (
    <div className="flex flex-col gap-4" data-testid="allergen-cascade-body">
      <FgSelector
        options={fgList.fgs}
        value={selectedFg}
        label={pageLabels.selectorLabel}
        placeholder={pageLabels.selectorPlaceholder}
      />
      <AllergenCascadeSection labels={allergenLabels} load={load} />
    </div>
  );
}

export default async function AllergenCascadePage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as AllergenCascadePageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const search = props.searchParams ? await props.searchParams : {};
  const requestedFg = search.fg ?? search.productCode;

  const [pageLabels, allergenLabels] = await Promise.all([
    buildPageLabels(locale),
    buildAllergenLabels(locale),
  ]);

  return (
    <main
      data-screen="npd-allergen-cascade"
      data-testid="allergen-cascade-page"
      className="flex w-full flex-col gap-4 px-6 py-6"
    >
      <nav aria-label="breadcrumb" className="text-xs text-slate-500">
        {pageLabels.breadcrumb}
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-slate-900">{pageLabels.title}</h1>
        <p className="text-xs text-slate-500">{pageLabels.subtitle}</p>
      </header>
      <Suspense fallback={<PageSkeleton label={pageLabels.loading} />}>
        <CascadeBody
          locale={locale}
          requestedFg={requestedFg}
          pageLabels={pageLabels}
          allergenLabels={allergenLabels}
          injectedFgList={props.fgList}
          injectedAllergenLoad={props.allergenLoad}
        />
      </Suspense>
    </main>
  );
}
