/**
 * FA right panel sidebar (STANDALONE, real-data) — T-137.
 *
 * Self-contained async RSC. Reads the REAL product summary for one FA
 * (status_overall / built / days_to_launch / launch_date / closed_* / created_at)
 * through `withOrgContext` — a single org-context transaction running as
 * app_user with RLS pinned to `app.current_org_id()`. RBAC (`npd.fa.read`) is
 * resolved server-side; the client never re-queries and never trusts a
 * client-side permission flag (permission_denied, empty, and error are all
 * server-resolved into discrete UI states). Composite identity is
 * (org_id, product_code): org_id is RLS-scoped, product_code is the PK.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:404-452
 *   (FARightPanel — 280px sticky aside: a Validation/Status card carrying the
 *    status pill + key facts, then a Built-status card with the
 *    "Any edit resets the Built flag" note.)
 *
 * STRICT SCOPE: this component is standalone. It does NOT import or mutate the
 * merged page.tsx / fa-tabs.tsx (route wiring is T-138). The Dept Close / D365
 * Build launchers are rendered as deferred action seams (disabled) because the
 * modal workflow is T-123-deferred — no DB write, no Server Action, no mock.
 *
 * Mock-data note: this file REPLACES the earlier prop-driven mock stub. No
 * hardcoded summary array remains; every field comes from public.product.
 */
import { getTranslations } from 'next-intl/server';

import { Button } from '@monopilot/ui/Button';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const READ_PERMISSION = 'npd.fa.read';

const STATUS_KEYS = ['Pending', 'InProgress', 'Alert', 'Complete', 'Built'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type FaSummary = {
  productCode: string;
  productName: string | null;
  statusOverall: string | null;
  built: boolean;
  daysToLaunch: number | null;
  launchDate: string | null;
  lastUpdated: string | null;
};

type FaRightPanelLoad =
  | { state: 'ready'; fa: FaSummary }
  | { state: 'empty' }
  | { state: 'permission_denied' }
  | { state: 'error' };

export type FaRightPanelProps = {
  locale: string;
  productCode: string;
  // Test/storybook injection seam: bypasses the org-context read when provided.
  summary?: FaSummary;
  loadState?: FaRightPanelLoad['state'];
  /**
   * T-138 wiring slot: when the layout provides a wired actions node (the client
   * `FaRightPanelActions`), it REPLACES the deferred-disabled action seams. When
   * omitted (T-137 standalone), the panel keeps the disabled deferred seams.
   */
  actionsSlot?: import('react').ReactNode;
};

// ---------------------------------------------------------------------------
// Real-data read (org-scoped, RLS app.current_org_id())
// ---------------------------------------------------------------------------

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

async function readSummary(ctx: OrgContextLike, productCode: string): Promise<FaSummary | null> {
  // RLS pins org scope to app.current_org_id(); product_code is the PK. The
  // composite identity (org_id, product_code) is therefore enforced by RLS +
  // PK without an explicit org_id predicate in the WHERE clause.
  const { rows } = await ctx.client.query<{
    product_code: string;
    product_name: string | null;
    status_overall: string | null;
    built: boolean | null;
    days_to_launch: number | null;
    launch_date: string | null;
    created_at: string | null;
  }>(
    `select product_code, product_name, status_overall, built,
            days_to_launch, launch_date, created_at
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
    daysToLaunch: typeof row.days_to_launch === 'number' ? row.days_to_launch : null,
    launchDate: row.launch_date ?? null,
    lastUpdated: row.created_at ?? null,
  };
}

async function loadSummary(productCode: string): Promise<FaRightPanelLoad> {
  try {
    return await withOrgContext(async (rawCtx): Promise<FaRightPanelLoad> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, READ_PERMISSION))) {
        return { state: 'permission_denied' };
      }
      const fa = await readSummary(ctx, productCode);
      if (!fa) return { state: 'empty' };
      return { state: 'ready', fa };
    });
  } catch (error) {
    console.error('[fa-right-panel] org-scoped read failed:', error);
    return { state: 'error' };
  }
}

// ---------------------------------------------------------------------------
// i18n labels (npd.faRightPanel — NEW namespace)
// ---------------------------------------------------------------------------

type FaRightPanelLabels = {
  title: string;
  subtitle: string;
  keyFacts: string;
  code: string;
  name: string;
  statusLabel: string;
  daysToLaunch: string;
  launchDate: string;
  lastUpdated: string;
  builtTitle: string;
  built: string;
  notBuilt: string;
  builtNote: string;
  actions: string;
  deptClose: string;
  d365Build: string;
  actionsDeferred: string;
  loading: string;
  empty: string;
  emptyBody: string;
  forbidden: string;
  error: string;
  status: Record<StatusKey, string>;
};

const DEFAULT_LABELS: FaRightPanelLabels = {
  title: 'Validation status',
  subtitle: 'Right-panel summary for this Finished Good.',
  keyFacts: 'Key facts',
  code: 'Code',
  name: 'Product',
  statusLabel: 'Status',
  daysToLaunch: 'Days to launch',
  launchDate: 'Launch date',
  lastUpdated: 'Last updated',
  builtTitle: 'Built status',
  built: 'Built',
  notBuilt: 'Not built',
  builtNote: 'Any edit resets the Built flag.',
  actions: 'Quick actions',
  deptClose: 'Dept Close',
  d365Build: 'D365 Build',
  actionsDeferred: 'Available once the action workflow ships.',
  loading: 'Loading summary…',
  empty: 'No summary',
  emptyBody: 'No Finished Good matches this code in your organisation.',
  forbidden: 'You do not have permission to view this summary.',
  error: 'Unable to load the summary.',
  status: {
    Pending: 'Pending',
    InProgress: 'In progress',
    Alert: 'Alert',
    Complete: 'Complete',
    Built: 'Built',
  },
};

async function buildLabels(locale: string): Promise<FaRightPanelLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.faRightPanel' });
    const pick = (key: string, fallback: string) => {
      try {
        const value = t(key);
        return value === key ? fallback : value;
      } catch {
        return fallback;
      }
    };
    const d = DEFAULT_LABELS;
    return {
      title: pick('title', d.title),
      subtitle: pick('subtitle', d.subtitle),
      keyFacts: pick('keyFacts', d.keyFacts),
      code: pick('code', d.code),
      name: pick('name', d.name),
      statusLabel: pick('statusLabel', d.statusLabel),
      daysToLaunch: pick('daysToLaunch', d.daysToLaunch),
      launchDate: pick('launchDate', d.launchDate),
      lastUpdated: pick('lastUpdated', d.lastUpdated),
      builtTitle: pick('builtTitle', d.builtTitle),
      built: pick('built', d.built),
      notBuilt: pick('notBuilt', d.notBuilt),
      builtNote: pick('builtNote', d.builtNote),
      actions: pick('actions', d.actions),
      deptClose: pick('deptClose', d.deptClose),
      d365Build: pick('d365Build', d.d365Build),
      actionsDeferred: pick('actionsDeferred', d.actionsDeferred),
      loading: pick('loading', d.loading),
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
    };
  } catch {
    return DEFAULT_LABELS;
  }
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

/** Map status → design-system `.badge-<tone>` class (globals.css; the `.badge--*`
 *  emitted by the primitive has no CSS rule, hence the unstyled-badge drift). */
function statusBadgeClass(statusOverall: string | null): string {
  if (statusOverall === 'Complete' || statusOverall === 'Built') return 'badge-green';
  if (statusOverall === 'Alert') return 'badge-red';
  if (statusOverall === 'InProgress') return 'badge-amber';
  return 'badge-gray';
}

function statusLabel(statusOverall: string | null, labels: FaRightPanelLabels): string {
  if (!statusOverall) return labels.status.Pending;
  return (STATUS_KEYS as readonly string[]).includes(statusOverall)
    ? labels.status[statusOverall as StatusKey]
    : statusOverall;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  // Keep ISO date portion only (the prototype shows date + time; we only
  // persist created_at, so render the date with a stable, locale-agnostic slice
  // to avoid hydration drift — see deviation log).
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

const ASIDE_CLASS = 'sticky top-4 self-start w-full max-w-[280px]';

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <aside
      aria-label={title}
      className={ASIDE_CLASS}
      data-prototype-anchor="npd/fa-screens.jsx:404-452"
    >
      <div className="card" data-slot="card">
        <div style={{ textAlign: 'center' }}>
          <p role="alert" data-testid={testId} style={{ fontSize: 13, fontWeight: 600 }}>
            {title}
          </p>
          {body ? <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>{body}</p> : null}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (Suspense boundary)
// ---------------------------------------------------------------------------

export function FaRightPanelSkeleton() {
  return (
    <aside
      aria-busy="true"
      aria-label="Loading FA summary"
      className={ASIDE_CLASS}
      data-prototype-anchor="npd/fa-screens.jsx:404-452"
      data-testid="fa-right-panel-skeleton"
    >
      <div className="card" data-slot="card">
        <div className="card-head">
          <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function FaRightPanel(props: FaRightPanelProps) {
  const { locale, productCode } = props;
  const labels = await buildLabels(locale);

  const load: FaRightPanelLoad =
    props.summary !== undefined
      ? { state: 'ready', fa: props.summary }
      : props.loadState !== undefined && props.loadState !== 'ready'
        ? ({ state: props.loadState } as FaRightPanelLoad)
        : await loadSummary(productCode);

  if (load.state === 'permission_denied') {
    return <StatePanel testId="fa-right-panel-forbidden" title={labels.forbidden} />;
  }
  if (load.state === 'error') {
    return <StatePanel testId="fa-right-panel-error" title={labels.error} />;
  }
  if (load.state === 'empty') {
    return <StatePanel testId="fa-right-panel-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const { fa } = load;
  const lastUpdated = formatDate(fa.lastUpdated);
  const launchDate = formatDate(fa.launchDate);

  return (
    <aside
      aria-label={labels.title}
      className={ASIDE_CLASS}
      data-testid="fa-right-panel"
      data-prototype-anchor="npd/fa-screens.jsx:404-452"
    >
      {/* Card 1 — Validation/Status + key facts (prototype lines 437-452) */}
      <div className="card" data-slot="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">{labels.title}</h2>
            <p className="muted" style={{ marginTop: 2, fontSize: 11 }}>{labels.subtitle}</p>
          </div>
          <span
            className={`badge ${statusBadgeClass(fa.statusOverall)}`}
            data-slot="badge"
            data-testid="fa-right-panel-status"
            aria-label={`${labels.statusLabel}: ${statusLabel(fa.statusOverall, labels)}`}
          >
            {statusLabel(fa.statusOverall, labels)}
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="mono" style={{ fontWeight: 600, color: 'var(--blue)' }}>{fa.productCode}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {fa.productName ?? fa.productCode}
            </div>
          </div>

          <dl className="muted" style={{ display: 'grid', gap: 6, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt>{labels.daysToLaunch}</dt>
              <dd style={{ fontWeight: 500, color: 'var(--text)' }} data-testid="fa-right-panel-days-to-launch">
                {fa.daysToLaunch ?? '—'}
              </dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt>{labels.launchDate}</dt>
              <dd className="mono" style={{ fontWeight: 500, color: 'var(--text)' }}>{launchDate ?? '—'}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt>{labels.lastUpdated}</dt>
              <dd className="mono" style={{ fontWeight: 500, color: 'var(--text)' }}>{lastUpdated ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Card 2 — Built status (prototype lines 454-467) */}
      <div className="card" data-slot="card">
        <div className="card-head">
          <h3 className="card-title">{labels.builtTitle}</h3>
        </div>
        <div className="space-y-2">
          <span
            className={`badge ${fa.built ? 'badge-blue' : 'badge-gray'}`}
            data-slot="badge"
            data-testid="fa-right-panel-built"
            aria-label={fa.built ? labels.built : labels.notBuilt}
          >
            {fa.built ? `⚡ ${labels.built}` : labels.notBuilt}
          </span>
          {fa.built && lastUpdated ? (
            <p className="muted" style={{ fontSize: 11 }}>
              {labels.lastUpdated}: {lastUpdated}
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 11 }}>{labels.builtNote}</p>
          )}
        </div>
      </div>

      {/* Card 3 — Action affordances (deferred seams; modal workflow = T-123) */}
      <div className="card" data-slot="card">
        <div className="card-head">
          <h3 className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {labels.actions}
          </h3>
        </div>
        <div className="space-y-2">
          {props.actionsSlot !== undefined ? (
            // T-138: wired client actions (route to ?modal=deptClose|d365Build).
            props.actionsSlot
          ) : (
            <>
              {/* T-137 standalone: deferred-disabled affordances (no modal wiring). */}
              <div className="grid gap-2">
                <Button
                  type="button"
                  className="btn-secondary btn-sm justify-center"
                  disabled
                  data-testid="fa-right-panel-action-deptClose"
                  title={labels.actionsDeferred}
                >
                  {labels.deptClose}
                </Button>
                <Button
                  type="button"
                  className="btn-primary btn-sm justify-center"
                  disabled
                  data-testid="fa-right-panel-action-d365Build"
                  title={labels.actionsDeferred}
                >
                  {labels.d365Build}
                </Button>
              </div>
              <p className="muted" style={{ fontSize: 11 }}>{labels.actionsDeferred}</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

export default FaRightPanel;
