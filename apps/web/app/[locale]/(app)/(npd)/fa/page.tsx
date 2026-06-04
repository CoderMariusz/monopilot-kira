/**
 * T-019 — FA list page (Factory Articles).
 *
 * Server Component. Reads REAL, org-scoped data from public.product via
 * `withOrgContext` (RLS-enforced as app_user with app.current_org_id()). No
 * mocks, no hard-coded rows.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:177-297 (FAList)
 *
 * URL persistence (translation note: openModal → URL search params):
 *   ?dept=mrp        → pre-filter to FAs where that dept has missing data (AC2)
 *   ?showClosed=true → include closed FAs (AC3)
 *   ?sort=...        → reserved for column sort (table sorts client-side)
 */

import { getTranslations } from 'next-intl/server';

import {
  FaListTable,
  type FaDeptStates,
  type FaListLabels,
  type FaListRow,
  type PageState,
} from './_components/fa-list-table';
import { buildFaCreateModalProps } from './_components/fa-create-host';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type FaListPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ dept?: string; showClosed?: string; sort?: string }>;
  // Test-only injection seam (mirrors machines page.tsx convention).
  rows?: FaListRow[];
  canCreate?: boolean;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProductLoaderRow = {
  product_code: string;
  product_name: string | null;
  pack_size: string | null;
  status_overall: string | null;
  launch_date: string | null;
  days_to_launch: number | null;
  built: boolean;
  done_core: boolean | null;
  done_planning: boolean | null;
  done_commercial: boolean | null;
  done_production: boolean | null;
  done_technical: boolean | null;
  done_mrp: boolean | null;
  done_procurement: boolean | null;
  closed_core: string | null;
  closed_planning: string | null;
  closed_commercial: string | null;
  closed_production: string | null;
  closed_technical: string | null;
  closed_mrp: string | null;
  closed_procurement: string | null;
};

type LoaderResult = { state: PageState; rows: FaListRow[]; canCreate: boolean };

const READ_PERMISSION = 'npd.fa.read';
const CREATE_PERMISSION = 'fa.create';

const DEFAULT_LABELS: FaListLabels = {
  title: 'Factory Articles',
  subtitle: 'All FAs · filter by status or department',
  createFa: '+ Create FA',
  searchPlaceholder: 'Search FA code or name…',
  filterDept: 'Department',
  filterStatus: 'Status',
  clearFilters: 'Clear filters',
  showClosed: 'Show closed',
  deptAll: 'All departments',
  statusAll: 'All statuses',
  colProductCode: 'FA Code',
  colProductName: 'Product Name',
  colPackSize: 'Pack',
  colStatus: 'Status',
  colLaunch: 'Launch',
  colDaysToLaunch: 'Days left',
  colBuilt: 'Built',
  colActions: 'Actions',
  open: 'Open',
  deptCore: 'Core',
  deptPlanning: 'Planning',
  deptCommercial: 'Commercial',
  deptProduction: 'Production',
  deptTechnical: 'Technical',
  deptMrp: 'MRP',
  deptProcurement: 'Procurement',
  statusBuilt: 'Built',
  statusComplete: 'Complete',
  statusAlert: 'Alert',
  statusInProgress: 'In progress',
  statusPending: 'Pending',
  noDate: 'No date set',
  loading: 'Loading factory articles…',
  empty: 'No Factory Articles match your filters',
  emptyBody:
    'Factory Articles are the master NPD record created from a converted Brief. Create one or clear filters.',
  error: 'Unable to load Factory Articles. Try again after the backend is available.',
  forbidden: 'You do not have permission to view Factory Articles.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof FaListLabels>;

function translateLabel(t: (key: string) => string, key: keyof FaListLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<FaListLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faList' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as FaListLabels);
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

function deptState(done: boolean | null, closed: string | null): FaDeptStates['core'] {
  if (done) return 'done';
  if (closed === 'Yes') return 'blocked';
  return 'pending';
}

function toRow(row: ProductLoaderRow): FaListRow {
  const dept: FaDeptStates = {
    core: deptState(row.done_core, row.closed_core),
    planning: deptState(row.done_planning, row.closed_planning),
    commercial: deptState(row.done_commercial, row.closed_commercial),
    production: deptState(row.done_production, row.closed_production),
    technical: deptState(row.done_technical, row.closed_technical),
    mrp: deptState(row.done_mrp, row.closed_mrp),
    procurement: deptState(row.done_procurement, row.closed_procurement),
  };
  return {
    productCode: row.product_code,
    productName: row.product_name,
    packSize: row.pack_size,
    statusOverall: row.status_overall,
    launchDate: row.launch_date,
    daysToLaunch: row.days_to_launch,
    built: Boolean(row.built),
    dept,
  };
}

async function readPageData(showClosed: boolean): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const [canRead, canCreate] = await Promise.all([
        hasPermission(ctx, READ_PERMISSION),
        hasPermission(ctx, CREATE_PERMISSION),
      ]);

      if (!canRead) {
        return { state: 'permission_denied', rows: [], canCreate };
      }

      // Org-scoping is enforced by RLS (org_id = app.current_org_id()); the
      // explicit predicate documents intent and survives a missing policy.
      const result = await ctx.client.query<ProductLoaderRow>(
        `select product_code,
                product_name,
                pack_size,
                status_overall,
                launch_date::text as launch_date,
                days_to_launch,
                built,
                done_core, done_planning, done_commercial, done_production,
                done_technical, done_mrp, done_procurement,
                closed_core, closed_planning, closed_commercial, closed_production,
                closed_technical, closed_mrp, closed_procurement
           from public.product
          where org_id = app.current_org_id()
            ${showClosed ? '' : 'and built is not true'}
          order by days_to_launch asc nulls last, product_code asc`,
      );

      const rows = result.rows.map(toRow);
      return { state: rows.length === 0 ? 'empty' : 'ready', rows, canCreate };
    });
  } catch (error) {
    console.error('[fa-list] org-scoped read failed:', error);
    return { state: 'error', rows: [], canCreate: false };
  }
}

export default async function FaListPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FaListPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const search = props.searchParams ? await props.searchParams : {};
  const showClosed = search.showClosed === 'true';

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.rows);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
        canCreate: props.canCreate ?? false,
      }
    : await readPageData(showClosed);

  const canCreate = props.canCreate ?? loaded.canCreate;

  // NF fix: resolve the create-modal labels + (RBAC-gated) Server Action on the
  // server and hand them to FaListTable, which renders the FaCreateModal INLINE
  // in the same client island as the "+ Create FG" button. No separate `?modal=`
  // island → the button opens the dialog on a fresh hard load, not only after an
  // SPA navigation. The real createFa action is provided only when permitted.
  const createModal = await buildFaCreateModalProps(locale, canCreate);

  return (
    <FaListTable
      rows={loaded.rows}
      labels={labels}
      canCreate={canCreate}
      state={props.state ?? loaded.state}
      createModalLabels={createModal.labels}
      createFaAction={createModal.action}
    />
  );
}
