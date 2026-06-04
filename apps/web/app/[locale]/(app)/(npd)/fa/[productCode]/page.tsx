/**
 * FA detail page (RSC) — shell + tabs container.
 *
 * Route: /[locale]/(app)/(npd)/fa/[productCode]
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *   - sticky header: breadcrumb eyebrow + FA code (mono) + product name +
 *     status_overall badge + ⚡ Built badge (prototype lines 330-353).
 *   - dept tab bar (subnav-inline, lines 387-398) → <FaTabs> tabs container.
 *
 * Real-data wiring (NO mocks):
 *   The FA core row (code/name/status_overall/built) AND the FA history timeline
 *   are read server-side inside `withOrgContext` — a single org-context
 *   transaction running as app_user with RLS pinned to app.current_org_id().
 *   RBAC (`npd.fa.read`) is resolved server-side; the client never re-queries
 *   and never trusts a client-side permission flag (permission_denied,
 *   not-found, and error are all server-resolved into discrete UI states).
 *
 * Tab content is intentionally deferred-empty for every department EXCEPT
 * History (T-027, kept intact) — the dept tab content lands in T-023..T-028.
 *
 * History parity source (kept from T-027):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:938-968 (FAHistoryTab)
 */

import { getTranslations } from 'next-intl/server';

import { listFaHistory, type FaHistoryEvent } from '@monopilot/queries';
import { Badge } from '@monopilot/ui/Badge';

import { FaTabs, type FaTabsLabels } from './_components/fa-tabs';
import {
  FaHistoryTab,
  type FaHistoryLabels,
  type FaHistoryPageState,
  type FaHistoryRow,
} from './_components/fa-history-tab';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type FaDetailPageProps = {
  params: Promise<{ locale: string; productCode: string }>;
  // Test-only injection seam (mirrors costing/page.tsx) for the History panel.
  historyRows?: FaHistoryRow[];
  historyState?: FaHistoryPageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';

const STATUS_KEYS = ['Pending', 'InProgress', 'Alert', 'Complete', 'Built'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

// ---------------------------------------------------------------------------
// FA core row (real, org-scoped)
// ---------------------------------------------------------------------------

type FaCoreRow = {
  productCode: string;
  productName: string | null;
  statusOverall: string | null;
  built: boolean;
};

type FaDetailLoad =
  | { state: 'ready'; fa: FaCoreRow; history: HistoryLoad }
  | { state: 'empty' }
  | { state: 'permission_denied' }
  | { state: 'error' };

type HistoryLoad = { state: FaHistoryPageState; rows: FaHistoryRow[] };

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

async function readFaCore(ctx: OrgContextLike, productCode: string): Promise<FaCoreRow | null> {
  // RLS pins org scope to app.current_org_id(); product_code is the PK.
  const { rows } = await ctx.client.query<{
    product_code: string;
    product_name: string | null;
    status_overall: string | null;
    built: boolean | null;
  }>(
    `select product_code, product_name, status_overall, built
       from public.product
      where product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    productCode: row.product_code,
    productName: row.product_name,
    statusOverall: row.status_overall,
    built: row.built === true,
  };
}

function toHistoryRow(event: FaHistoryEvent): FaHistoryRow {
  return {
    id: event.id,
    source: event.source,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    actorName: event.actorName,
    actorUserId: event.actorUserId,
    payload: event.payload,
  };
}

async function loadFaDetail(productCode: string): Promise<FaDetailLoad> {
  try {
    return await withOrgContext(async (rawCtx): Promise<FaDetailLoad> => {
      const ctx = rawCtx as OrgContextLike;

      if (!(await hasPermission(ctx, READ_PERMISSION))) {
        return { state: 'permission_denied' };
      }

      const fa = await readFaCore(ctx, productCode);
      if (!fa) {
        return { state: 'empty' };
      }

      // History inside the SAME org-context transaction (no second round-trip).
      let history: HistoryLoad;
      try {
        const events = await listFaHistory(productCode, { client: ctx.client });
        const rows = events.map(toHistoryRow);
        history = { state: rows.length === 0 ? 'empty' : 'ready', rows };
      } catch (historyError) {
        console.error('[fa-detail] history read failed:', historyError);
        history = { state: 'error', rows: [] };
      }

      return { state: 'ready', fa, history };
    });
  } catch (error) {
    console.error('[fa-detail] org-scoped read failed:', error);
    return { state: 'error' };
  }
}

// ---------------------------------------------------------------------------
// i18n label builders
// ---------------------------------------------------------------------------

type FaDetailLabels = {
  eyebrow: string;
  subtitle: string;
  built: string;
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
  status: Record<StatusKey, string>;
  tabs: FaTabsLabels;
};

const DEFAULT_FA_DETAIL_LABELS: FaDetailLabels = {
  eyebrow: 'Factory Article',
  subtitle: 'Department workspace · close each department to complete the FA',
  built: 'Built',
  empty: 'Factory Article not found',
  emptyBody: 'No Factory Article matches this code in your organisation.',
  forbidden: 'You do not have permission to view this Factory Article.',
  error: 'Unable to load this Factory Article.',
  status: {
    Pending: 'Pending',
    InProgress: 'In progress',
    Alert: 'Alert',
    Complete: 'Complete',
    Built: 'Built',
  },
  tabs: {
    tablistLabel: 'FA detail departments',
    tabs: {
      core: 'Core',
      planning: 'Planning',
      commercial: 'Commercial',
      production: 'Production',
      technical: 'Technical',
      mrp: 'MRP',
      procurement: 'Procurement',
      history: 'History',
    },
    deferred: 'Tab content deferred',
    deferredBody: 'This department workspace is delivered in a later slice.',
  },
};

async function buildFaDetailLabels(locale: string): Promise<FaDetailLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faDetail' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const d = DEFAULT_FA_DETAIL_LABELS;
    return {
      eyebrow: pick('eyebrow', d.eyebrow),
      subtitle: pick('subtitle', d.subtitle),
      built: pick('built', d.built),
      empty: pick('empty', d.empty),
      emptyBody: pick('emptyBody', d.emptyBody),
      forbidden: pick('forbidden', d.forbidden),
      error: pick('error', d.error),
      status: {
        Pending: pick('status.Pending', d.status.Pending),
        InProgress: pick('status.InProgress', d.status.InProgress),
        Alert: pick('status.Alert', d.status.Alert),
        Complete: pick('status.Complete', d.status.Complete),
        Built: pick('status.Built', d.status.Built),
      },
      tabs: {
        tablistLabel: d.tabs.tablistLabel,
        tabs: {
          core: pick('tabs.core', d.tabs.tabs.core),
          planning: pick('tabs.planning', d.tabs.tabs.planning),
          commercial: pick('tabs.commercial', d.tabs.tabs.commercial),
          production: pick('tabs.production', d.tabs.tabs.production),
          technical: pick('tabs.technical', d.tabs.tabs.technical),
          mrp: pick('tabs.mrp', d.tabs.tabs.mrp),
          procurement: pick('tabs.procurement', d.tabs.tabs.procurement),
          history: pick('tabs.history', d.tabs.tabs.history),
        },
        deferred: pick('deferred', d.tabs.deferred),
        deferredBody: pick('deferredBody', d.tabs.deferredBody),
      },
    };
  } catch {
    return DEFAULT_FA_DETAIL_LABELS;
  }
}

// History tab labels (npd.faHistory) — unchanged contract from T-027.
const DEFAULT_HISTORY_LABELS: FaHistoryLabels = {
  title: 'History',
  subtitle: 'Read-only timeline of every change to this Factory Article.',
  filterLabel: 'Event type',
  filterAll: 'All events',
  colWhen: 'When',
  colActor: 'Who',
  colEvent: 'Event',
  detailsToggle: 'Details',
  detailsHide: 'Hide details',
  systemActor: 'System',
  unknownActor: 'Unknown',
  loading: 'Loading FA history…',
  empty: 'No history yet',
  emptyBody: 'Changes to this Factory Article will appear here as they happen.',
  emptyFiltered: 'No events match this filter',
  emptyFilteredBody: 'Try a different event type or clear the filter.',
  clearFilter: 'Clear filter',
  error: 'Unable to load FA history.',
  forbidden: 'You do not have permission to view this FA history.',
  eventLabels: {},
};

const SCALAR_LABEL_KEYS = Object.keys(DEFAULT_HISTORY_LABELS).filter(
  (k) => k !== 'eventLabels',
) as Array<Exclude<keyof FaHistoryLabels, 'eventLabels'>>;

const EVENT_LABEL_KEYS = [
  'created',
  'field_edit',
  'edit',
  'dept_closed',
  'dept_reopened',
  'core_closed',
  'built',
  'built_reset',
  'allergens_changed',
  'intermediate_code_changed',
  'recipe_changed',
  'template_applied',
  'cascade',
  'deleted',
] as const;

async function buildHistoryLabels(locale: string): Promise<FaHistoryLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faHistory' });
    const labels: FaHistoryLabels = { ...DEFAULT_HISTORY_LABELS, eventLabels: {} };
    for (const key of SCALAR_LABEL_KEYS) {
      try {
        const value = t(key);
        labels[key] = value === key ? DEFAULT_HISTORY_LABELS[key] : value;
      } catch {
        labels[key] = DEFAULT_HISTORY_LABELS[key];
      }
    }
    const eventLabels: Record<string, string> = {};
    for (const key of EVENT_LABEL_KEYS) {
      try {
        const value = t(`type.${key}`);
        if (value && value !== `type.${key}`) eventLabels[key] = value;
      } catch {
        /* skip missing event label */
      }
    }
    labels.eventLabels = eventLabels;
    return labels;
  } catch {
    return { ...DEFAULT_HISTORY_LABELS };
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function statusBadge(statusOverall: string | null, labels: FaDetailLabels) {
  if (!statusOverall) return null;
  const isKnown = (STATUS_KEYS as readonly string[]).includes(statusOverall);
  const label = isKnown ? labels.status[statusOverall as StatusKey] : statusOverall;
  const tone =
    statusOverall === 'Complete' || statusOverall === 'Built'
      ? 'success'
      : statusOverall === 'Alert'
        ? 'danger'
        : statusOverall === 'InProgress'
          ? 'warning'
          : 'muted';
  return (
    <Badge tone={tone} data-testid="fa-detail-status">
      {label}
    </Badge>
  );
}

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <div
        role="alert"
        data-testid={testId}
        className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {body ? <p className="mt-1 text-sm text-slate-600">{body}</p> : null}
      </div>
    </main>
  );
}

export default async function FaDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FaDetailPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const [labels, historyLabels] = await Promise.all([
    buildFaDetailLabels(locale),
    buildHistoryLabels(locale),
  ]);

  const injected = props.historyRows !== undefined || props.historyState !== undefined;

  const load: FaDetailLoad = injected
    ? {
        state: 'ready',
        fa: { productCode, productName: null, statusOverall: null, built: false },
        history: {
          state:
            props.historyState ??
            (props.historyRows && props.historyRows.length > 0 ? 'ready' : 'empty'),
          rows: props.historyRows ?? [],
        },
      }
    : await loadFaDetail(productCode);

  if (load.state === 'permission_denied') {
    return <StatePanel testId="fa-detail-forbidden" title={labels.forbidden} />;
  }
  if (load.state === 'error') {
    return <StatePanel testId="fa-detail-error" title={labels.error} />;
  }
  if (load.state === 'empty') {
    return <StatePanel testId="fa-detail-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const { fa, history } = load;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <section
        aria-label={labels.eyebrow}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          {labels.eyebrow}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-bold tracking-tight text-blue-700">
            {fa.productCode}
          </span>
          <h1 className="text-xl font-semibold text-slate-950">
            {fa.productName ?? fa.productCode}
          </h1>
          {statusBadge(fa.statusOverall, labels)}
          {fa.built ? (
            <Badge tone="info" data-testid="fa-detail-built">
              {'⚡ '}
              {labels.built}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-slate-600">{labels.subtitle}</p>
      </section>

      <FaTabs
        productCode={fa.productCode}
        labels={labels.tabs}
        historyPanel={
          <FaHistoryTab
            productCode={fa.productCode}
            rows={history.rows}
            labels={historyLabels}
            state={history.state}
          />
        }
      />
    </main>
  );
}
