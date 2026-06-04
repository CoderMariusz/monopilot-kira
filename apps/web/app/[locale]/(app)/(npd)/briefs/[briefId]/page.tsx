/**
 * T-120 — Brief detail page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/briefs/[briefId]
 *
 * T-121 (wiring): consolidated under `briefs/[briefId]` (was `brief/[briefId]`)
 * so the list-table row links (`/briefs/<id>`) and the BriefCreateModal
 * post-create redirect resolve to a real route. A back-link to the list is
 * wired via `listHref` on the form (breadcrumb 'Briefs' becomes navigable).
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - public.brief                       → the brief header (status / template / dev_code / fa link)
 *   - public.brief_lines                 → product line + summary line + component lines + packaging
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:84-231 (BriefDetail)
 *
 * Decimal weights/prices are carried as STRINGS (NUMERIC ::text) end-to-end —
 * never coerced to JS floats in this loader.
 *
 * The Save Draft write is owned by T-031 (`saveBriefDraft`) and imported here,
 * never authored. The Mark-complete Server Action (V-NPD-BRF-001 server-side
 * weight check + status transition + project routing) is owned by the parent
 * slice T-034 and is NOT yet merged; the CTA + project-routing behaviour is
 * fully implemented and parity-tested in the client component, and is wired the
 * moment that action lands (pass `onMarkComplete`). RBAC (`permission_denied`)
 * is resolved server-side and never trusted from the client.
 */

import { getTranslations } from 'next-intl/server';

import {
  BriefDetailForm,
  type BriefDetailData,
  type BriefDetailLabels,
  type BriefFormValues,
  type BriefStatus,
  type BriefTemplate,
  type PageState,
  type SaveDraftOutcome,
} from './_components/brief-detail-form';
import { saveBriefDraft } from '../../../../../(npd)/brief/actions/save-brief-draft';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type BriefPageProps = {
  params?: Promise<{ locale: string; briefId: string }>;
  // Test-only injection seam (mirrors costing/nutrition/fa pages).
  data?: BriefDetailData | null;
  state?: PageState;
  canWrite?: boolean;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LoaderResult = { state: PageState; data: BriefDetailData | null; canWrite: boolean };

const READ_PERMISSION = 'npd.brief.read';
const WRITE_PERMISSION = 'npd.brief.write';

/** Target component-weight total + tolerance (grams) — prototype V-NPD-BRF-001. */
const TARGET_WEIGHT_G = '220';
const WEIGHT_TOLERANCE_G = '5';

const DEFAULT_LABELS: BriefDetailLabels = {
  breadcrumbRoot: 'NPD',
  breadcrumbList: 'Briefs',
  templateMulti: 'Multi',
  templateSingle: 'Single',
  statusDraft: 'Draft',
  statusComplete: 'Complete',
  statusConverted: 'Converted',
  statusAbandoned: 'Abandoned',
  convertedTo: 'Converted',
  convertedNotice: 'This brief has been converted to {fa}. It is now read-only.',
  viewProject: 'View project',
  saveDraft: 'Save draft',
  saving: 'Saving…',
  saved: 'Draft saved.',
  saveError: 'Could not save the draft. Try again.',
  markComplete: 'Complete brief for project',
  completing: 'Completing…',
  completeError: 'Could not complete the brief. Try again.',
  tabProduct: 'Product details',
  tabPackaging: 'Packaging',
  sectionATitle: 'Section A — Product details',
  sectionBTitle: 'Section B — Packaging (C14-C20)',
  fieldProduct: 'Product',
  fieldVolume: 'Volume (pcs/week)',
  fieldDevCode: 'Dev Code',
  fieldDevCodeHint: 'Format DEV<YY><MM>-<seq>',
  fieldPacksPerCase: 'Packs per case',
  fieldBenchmark: 'Benchmark identified',
  fieldComments: 'Comments',
  fieldComponent: 'Component',
  fieldSliceCount: 'Slice count',
  fieldSupplier: 'Supplier',
  fieldCode: 'Code',
  fieldPrice: 'Price',
  fieldWeight: 'Weight (g)',
  fieldPct: '%',
  componentsTitle: 'Components (Multi template)',
  addComponent: '+ Add component',
  removeComponent: 'Remove component',
  totalRow: 'Total',
  weightMismatch: 'Weight mismatch',
  weightMismatchBody:
    'Component weights ({total}g) differ from the target total by more than tolerance. Adjust before completing.',
  fieldPrimaryPackaging: 'C14 · Primary packaging',
  fieldSecondaryPackaging: 'C15 · Secondary packaging',
  fieldBaseWebCode: 'C16 · Base web/tray/bag code',
  fieldBaseWebCodeHint: 'Maps to fa.web on Convert.',
  fieldBaseWebPrice: 'C17 · Base web price',
  fieldTopWebType: 'C18 · Top web type',
  fieldSleeveCartonCode: 'C19 · Sleeve/Carton code',
  fieldSleeveCartonCodeHint: 'Maps to fa.mrp_sleeves on Convert.',
  fieldSleeveCartonPrice: 'C20 · Sleeve/Carton price',
  packagingExtTitle: 'Additional packaging fields (C21–C37)',
  packagingExtPending: 'Phase B.2 rescan pending',
  packagingExtBody:
    'Fields C21-C37 (sleeve artwork, lamination, gas mix, pallet config, retailer labelling) are pending the Phase B.2 Brief schema rescan. Rendered inline but not yet mapped.',
  packagingExtKey: 'Field',
  packagingExtValue: 'Value',
  tbd: 'TBD',
  loading: 'Loading brief…',
  empty: 'Brief not found',
  emptyBody: 'This brief does not exist or you do not have access to it.',
  error: 'Unable to load the brief.',
  forbidden: 'You do not have permission to view this brief.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof BriefDetailLabels>;

function translateLabel(t: (key: string) => string, key: keyof BriefDetailLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<BriefDetailLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.briefDetail' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as BriefDetailLabels);
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

type BriefHeaderRow = {
  brief_id: string;
  dev_code: string;
  product_name: string | null;
  template: BriefTemplate;
  status: BriefStatus;
  npd_project_id: string | null;
  fa_code: string | null;
};

type BriefLineRow = {
  line_type: 'product' | 'component' | 'summary';
  line_index: number;
  product: string | null;
  volume: string | null;
  dev_code: string | null;
  component: string | null;
  slice_count: number | null;
  supplier: string | null;
  code: string | null;
  price: string | null;
  weights: string | null;
  pct: string | null;
  packs_per_case: number | null;
  comments: string | null;
  benchmark_identified: string | null;
  primary_packaging: string | null;
  secondary_packaging: string | null;
  base_web_code: string | null;
  base_web_price: string | null;
  top_web_type: string | null;
  sleeve_carton_code: string | null;
  sleeve_carton_price: string | null;
  packaging_ext: Record<string, unknown> | null;
};

function asStringMap(value: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
}

async function readPageData(briefId: string): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, READ_PERMISSION);
      if (!canRead) {
        return { state: 'permission_denied', data: null, canWrite: false };
      }
      const canWrite = await hasPermission(ctx, WRITE_PERMISSION);

      const header = await ctx.client.query<BriefHeaderRow>(
        `select b.brief_id,
                b.dev_code,
                b.product_name,
                b.template,
                b.status,
                b.npd_project_id,
                pr.product_code as fa_code
           from public.brief b
           left join public.npd_projects p on p.id = b.npd_project_id and p.org_id = b.org_id
           left join public.product pr on pr.org_id = p.org_id and pr.product_code = p.product_code
          where b.brief_id = $1::uuid
            and b.org_id = app.current_org_id()
          limit 1`,
        [briefId],
      );
      const head = header.rows[0];
      if (!head) {
        return { state: 'empty', data: null, canWrite };
      }

      const lines = await ctx.client.query<BriefLineRow>(
        `select line_type,
                line_index,
                product,
                volume::text             as volume,
                dev_code,
                component,
                slice_count,
                supplier,
                code,
                price,
                weights::text            as weights,
                pct::text                as pct,
                packs_per_case,
                comments,
                benchmark_identified,
                primary_packaging,
                secondary_packaging,
                base_web_code,
                base_web_price::text     as base_web_price,
                top_web_type,
                sleeve_carton_code,
                sleeve_carton_price::text as sleeve_carton_price,
                packaging_ext
           from public.brief_lines
          where brief_id = $1::uuid
            and org_id = app.current_org_id()
          order by line_index asc`,
        [briefId],
      );

      const productLine = lines.rows.find((l) => l.line_type === 'product');
      const summaryLine = lines.rows.find((l) => l.line_type === 'summary');
      const componentLines = lines.rows.filter((l) => l.line_type === 'component');
      // Packaging fields live on the product line (or the first line that has them).
      const packagingLine =
        lines.rows.find((l) => l.primary_packaging !== null || l.base_web_code !== null) ?? productLine;
      const extLine = lines.rows.find((l) => Object.keys(asStringMap(l.packaging_ext)).length > 0);

      const data: BriefDetailData = {
        briefId: head.brief_id,
        devCode: head.dev_code,
        productName: head.product_name,
        template: head.template,
        status: head.status,
        faCode: head.fa_code,
        npdProjectId: head.npd_project_id,
        product: {
          product: productLine?.product ?? head.product_name,
          volume: productLine?.volume ?? null,
          devCode: productLine?.dev_code ?? head.dev_code,
          packsPerCase: productLine?.packs_per_case ?? null,
          benchmark: productLine?.benchmark_identified ?? null,
          comments: productLine?.comments ?? null,
          summaryComponent: summaryLine?.component ?? null,
          summarySliceCount: summaryLine?.slice_count ?? null,
          summarySupplier: summaryLine?.supplier ?? null,
          summaryCode: summaryLine?.code ?? null,
          summaryPrice: summaryLine?.price ?? null,
          summaryWeights: summaryLine?.weights ?? null,
          summaryPct: summaryLine?.pct ?? null,
        },
        components: componentLines.map((l) => ({
          component: l.component,
          sliceCount: l.slice_count,
          supplier: l.supplier,
          code: l.code,
          price: l.price,
          weights: l.weights,
          pct: l.pct,
        })),
        packaging: {
          primaryPackaging: packagingLine?.primary_packaging ?? null,
          secondaryPackaging: packagingLine?.secondary_packaging ?? null,
          baseWebCode: packagingLine?.base_web_code ?? null,
          baseWebPrice: packagingLine?.base_web_price ?? null,
          topWebType: packagingLine?.top_web_type ?? null,
          sleeveCartonCode: packagingLine?.sleeve_carton_code ?? null,
          sleeveCartonPrice: packagingLine?.sleeve_carton_price ?? null,
        },
        packagingExt: asStringMap(extLine?.packaging_ext),
        targetWeightG: TARGET_WEIGHT_G,
        weightToleranceG: WEIGHT_TOLERANCE_G,
      };

      return { state: 'ready', data, canWrite };
    });
  } catch (error) {
    console.error('[brief-detail] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false };
  }
}

/**
 * Save-draft adapter passed to the client. Maps the RHF form shape into the
 * `saveBriefDraft` (T-031) line model: a `product` line, a `summary` line that
 * carries the aggregate (drives V-NPD-BRF-001), and one `component` line each.
 */
async function saveDraftAction(briefId: string, fields: BriefFormValues): Promise<SaveDraftOutcome> {
  'use server';
  try {
    await saveBriefDraft(briefId, {
      productName: fields.product.product ?? null,
      volume: fields.product.volume ?? null,
      lines: [
        {
          lineType: 'product',
          lineIndex: 0,
          product: fields.product.product ?? null,
          volume: fields.product.volume ?? null,
          devCode: fields.product.devCode ?? null,
          packsPerCase: fields.product.packsPerCase ?? null,
          comments: fields.product.comments ?? null,
        },
        {
          lineType: 'summary',
          lineIndex: 1,
          component: fields.product.summaryComponent ?? null,
          sliceCount: fields.product.summarySliceCount ?? null,
          supplier: fields.product.summarySupplier ?? null,
          code: fields.product.summaryCode ?? null,
          price: fields.product.summaryPrice ?? null,
          weights: fields.product.summaryWeights ?? null,
          pct: fields.product.summaryPct ?? null,
        },
        ...fields.components.map((c, i) => ({
          lineType: 'component' as const,
          lineIndex: i + 2,
          component: c.component ?? null,
          sliceCount: c.sliceCount ?? null,
          supplier: c.supplier ?? null,
          code: c.code ?? null,
          price: c.price ?? null,
          weights: c.weights ?? null,
          pct: c.pct ?? null,
        })),
      ],
    });
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SAVE_FAILED';
    return { ok: false, error: code };
  }
}

export default async function BriefDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as BriefPageProps;
  const { locale, briefId } = props.params ? await props.params : { locale: 'en', briefId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.canWrite ?? false,
      }
    : await readPageData(briefId);

  // T-121 (wiring): locale-prefixed back-link so the breadcrumb 'Briefs' crumb
  // returns to the list inside the same locale route group.
  const listHref = `/${locale}/briefs`;

  return (
    <BriefDetailForm
      state={loaded.state}
      data={loaded.data}
      labels={labels}
      canWrite={loaded.canWrite}
      onSaveDraft={saveDraftAction}
      listHref={listHref}
    />
  );
}
