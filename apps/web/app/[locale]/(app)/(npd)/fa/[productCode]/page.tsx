/**
 * FA detail page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/fa/[productCode]
 *
 * T-027 extends this shell to load the REAL, org-scoped FA History timeline
 * (audit_events + outbox_events) via `withOrgContext` (RLS as app_user with
 * app.current_org_id()) and render it inside the History tab. No mocks.
 *
 * The history data + RBAC gate are resolved server-side and passed down to the
 * client `FaHistoryTab` as plain props — the client never re-queries and never
 * trusts a client-side permission flag (permission_denied is server-resolved).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:938-968 (FAHistoryTab)
 */

import { getTranslations } from 'next-intl/server';

import { listFaHistory, type FaHistoryEvent } from '@monopilot/queries';

import { FaTabs } from './_components/fa-tabs';
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
  // Test-only injection seam (mirrors costing/page.tsx).
  historyRows?: FaHistoryRow[];
  historyState?: FaHistoryPageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const READ_PERMISSION = 'npd.fa.read';

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

function toRow(event: FaHistoryEvent): FaHistoryRow {
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

type HistoryLoad = { state: FaHistoryPageState; rows: FaHistoryRow[] };

async function loadHistory(productCode: string): Promise<HistoryLoad> {
  try {
    return await withOrgContext(async (rawCtx): Promise<HistoryLoad> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, READ_PERMISSION))) {
        return { state: 'permission_denied', rows: [] };
      }
      const events = await listFaHistory(productCode, { client: ctx.client });
      const rows = events.map(toRow);
      return { state: rows.length === 0 ? 'empty' : 'ready', rows };
    });
  } catch (error) {
    console.error('[fa-history] org-scoped read failed:', error);
    return { state: 'error', rows: [] };
  }
}

export default async function FaDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as FaDetailPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const labels = await buildHistoryLabels(locale);

  const injected = props.historyRows !== undefined || props.historyState !== undefined;
  const load: HistoryLoad = injected
    ? {
        state: props.historyState ?? (props.historyRows && props.historyRows.length > 0 ? 'ready' : 'empty'),
        rows: props.historyRows ?? [],
      }
    : await loadHistory(productCode);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Factory Article
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{productCode}</h1>
        <p className="mt-2 text-sm text-slate-600">
          FA detail page shell. Department tab content is intentionally deferred in this slice.
        </p>
      </section>

      <FaTabs
        productCode={productCode}
        historyPanel={
          <FaHistoryTab
            productCode={productCode}
            rows={load.rows}
            labels={labels}
            state={load.state}
          />
        }
      />
    </main>
  );
}
