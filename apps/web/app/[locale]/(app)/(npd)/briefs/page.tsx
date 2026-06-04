/**
 * T-119 — Brief list page (NPD briefs).
 *
 * Server Component. Reads REAL, org-scoped data from public.brief (joined to
 * public.npd_projects for the e2e-spine linked-project cell) via `withOrgContext`
 * (RLS-enforced as app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/brief-screens.jsx:7-82 (BriefList)
 *
 * RBAC (server-side, never client-trusted):
 *   - read gate  → npd.dashboard.view (broad NPD read; mirrors prototype where the
 *     list itself is not gated but lives inside the NPD shell)
 *   - canCreate  → brief.create        (prototype: npd_can('brief.create'))
 *   - canConvert → brief.convert_to_fa (prototype: npd_can('brief.convert_to_fa'))
 */

import { getTranslations } from 'next-intl/server';

import {
  BriefListTable,
  type BriefListLabels,
  type BriefListRow,
  type PageState,
} from './_components/brief-list-table';
import { BriefModalsHost } from './_components/brief-modals-host';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type BriefListPageProps = {
  params?: Promise<{ locale: string }>;
  // T-121 (wiring): the list-table pushes `?modal=…&brief=<id>`; the page reads
  // it server-side to resolve the complete-summary for the modal host.
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  // Test-only injection seam (mirrors fa/page.tsx convention).
  rows?: BriefListRow[];
  canCreate?: boolean;
  canConvert?: boolean;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type BriefLoaderRow = {
  brief_id: string;
  dev_code: string;
  product_name: string | null;
  template: string;
  status: string;
  created_at: string | null;
  owner: string | null;
  project_id: string | null;
  project_code: string | null;
  project_gate: string | null;
};

type LoaderResult = {
  state: PageState;
  rows: BriefListRow[];
  canCreate: boolean;
  canConvert: boolean;
};

const READ_PERMISSION = 'npd.dashboard.view';
const CREATE_PERMISSION = 'brief.create';
const CONVERT_PERMISSION = 'brief.convert_to_fa';

const DEFAULT_LABELS: BriefListLabels = {
  title: 'NPD Briefs',
  subtitle: 'Briefs are pre-FA intake',
  createBrief: '+ New Brief',
  searchPlaceholder: 'Search brief name or dev code…',
  filterStatus: 'Status',
  filterTemplate: 'Template',
  clearFilters: 'Clear filters',
  statusAll: 'All statuses',
  templateAll: 'All templates',
  colDevCode: 'Dev Code',
  colProductName: 'Product Name',
  colTemplate: 'Template',
  colStatus: 'Status',
  colLinkedProject: 'Linked Project',
  colCreated: 'Created',
  colOwner: 'Owner',
  colActions: 'Actions',
  open: 'Open',
  convert: 'Convert',
  templateSingle: 'Single',
  templateMulti: 'Multi',
  statusDraft: 'Draft',
  statusComplete: 'Complete',
  statusConverted: '✓ Converted',
  statusAbandoned: 'Abandoned',
  noProject: '—',
  noOwner: '—',
  loading: 'Loading briefs…',
  empty: 'No briefs match your filters',
  emptyBody:
    'Briefs are pre-FA intake records. Start a new one or clear your filters to see existing briefs.',
  error: 'Unable to load briefs. Try again after the backend is available.',
  forbidden: 'You do not have permission to view briefs.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof BriefListLabels>;

function translateLabel(t: (key: string) => string, key: keyof BriefListLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<BriefListLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.briefList' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as BriefListLabels);
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

function toRow(row: BriefLoaderRow): BriefListRow {
  return {
    briefId: row.brief_id,
    devCode: row.dev_code,
    productName: row.product_name,
    template: row.template,
    status: row.status,
    createdAt: row.created_at,
    owner: row.owner,
    projectCode: row.project_code,
    projectGate: row.project_gate,
    projectId: row.project_id,
  };
}

async function readPageData(): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const [canRead, canCreate, canConvert] = await Promise.all([
        hasPermission(ctx, READ_PERMISSION),
        hasPermission(ctx, CREATE_PERMISSION),
        hasPermission(ctx, CONVERT_PERMISSION),
      ]);

      if (!canRead) {
        return { state: 'permission_denied', rows: [], canCreate, canConvert };
      }

      // Org-scoping is enforced by RLS (org_id = app.current_org_id()); the
      // explicit predicate documents intent and survives a missing policy. The
      // npd_projects join supplies the e2e-spine linked-project cell.
      const result = await ctx.client.query<BriefLoaderRow>(
        `select b.brief_id::text as brief_id,
                b.dev_code,
                b.product_name,
                b.template,
                b.status,
                b.created_at::date::text as created_at,
                u.name as owner,
                p.id::text as project_id,
                p.code as project_code,
                p.current_gate as project_gate
           from public.brief b
           left join public.npd_projects p
             on p.id = b.npd_project_id and p.org_id = b.org_id
           left join public.users u
             on u.id = b.created_by_user and u.org_id = b.org_id
          where b.org_id = app.current_org_id()
          order by b.created_at desc, b.dev_code asc`,
      );

      const rows = result.rows.map(toRow);
      return { state: rows.length === 0 ? 'empty' : 'ready', rows, canCreate, canConvert };
    });
  } catch (error) {
    console.error('[brief-list] org-scoped read failed:', error);
    return { state: 'error', rows: [], canCreate: false, canConvert: false };
  }
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function BriefListPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as BriefListPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const search = props.searchParams ? await props.searchParams : {};
  // The list pushes `?modal=briefConvert&brief=<id>`; resolve the brief for the
  // Complete modal summary server-side.
  const briefId = firstParam(search.brief);

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.rows);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
        canCreate: props.canCreate ?? false,
        canConvert: props.canConvert ?? false,
      }
    : await readPageData();

  return (
    <>
      <BriefListTable
        rows={loaded.rows}
        labels={labels}
        canCreate={props.canCreate ?? loaded.canCreate}
        canConvert={props.canConvert ?? loaded.canConvert}
        state={props.state ?? loaded.state}
      />
      {/* T-121: mount the merged Create/Complete modal host; it maps the
          `?modal=` triggers the list pushes to the injected modals. Rendered
          inside the same RSC so RBAC + summary are server-resolved. */}
      {await BriefModalsHost({ locale, briefId })}
    </>
  );
}
