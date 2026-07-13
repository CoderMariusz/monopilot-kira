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

import { evaluateNpdValidation } from '@monopilot/validation';
import { Button } from '@monopilot/ui/Button';

import {
  ValidationStatusPanel,
  type ValidationRule,
  type ValidationStatus,
} from '../../../../../../../components/npd/validation-status-panel';
import { loadFgCodeMask } from '../../../../../../(npd)/fa/actions/create-fa';
import { codeMaskToRegExp } from '../../../../../../../lib/documents/code-mask';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  compoundedYieldPctForProduct,
  loadProductProcessYields,
} from '../../../../../../(npd)/pipeline/_actions/_lib/product-process-yields';

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
  /** Compounded Π(process yield_pct) for single-component products; null when N/A. */
  totalYieldPct: number | null;
  /** Server-computed V01-V08 validation results (real product row). */
  validation: ValidationRule[];
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

async function readPackSizes(ctx: OrgContextLike): Promise<string[]> {
  try {
    const { rows } = await ctx.client.query<{ value: string | null }>(
      `select value
         from "Reference"."PackSizes"
        where org_id = app.current_org_id()`,
    );
    return rows.map((r) => str(r.value)).filter((v) => v !== '');
  } catch {
    // PackSizes reference may be absent in some orgs; V03 then degrades to a
    // non-empty check (pass when filled) rather than 500-ing the panel.
    return [];
  }
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

async function readSummary(
  ctx: OrgContextLike,
  productCode: string,
  validationTitles: Record<string, string>,
): Promise<FaSummary | null> {
  // RLS pins org scope to app.current_org_id(); product_code is the PK. The
  // composite identity (org_id, product_code) is therefore enforced by RLS +
  // PK without an explicit org_id predicate in the WHERE clause. The full row is
  // read as JSON so the V01-V08 computation has every column it needs.
  const { rows } = await ctx.client.query<Record<string, unknown>>(
    `select to_jsonb(p.*) as product_json
       from public.product p
      where p.product_code = $1
        and p.deleted_at is null
      limit 1`,
    [productCode],
  );
  const raw = rows[0];
  if (!raw) return null;
  // Production query aliases the full row as `product_json`; tests may return the
  // flat columns directly — accept either shape.
  const json = (raw.product_json as Record<string, unknown> | undefined) ?? raw;
  if (!json || Object.keys(json).length === 0) return null;

  const packSizes = await readPackSizes(ctx);
  const fgMask = await loadFgCodeMask(ctx);
  const codeMaskRegExp = fgMask ? codeMaskToRegExp(fgMask) : null;
  const validation = await evaluateNpdValidation(ctx.client, {
    orgId: ctx.orgId,
    productRow: json,
    packSizes,
    codeMaskRegExp,
    titles: validationTitles,
  });
  const processYields = await loadProductProcessYields(ctx, productCode);
  const totalYieldPct = compoundedYieldPctForProduct(processYields);
  const daysRaw = json.days_to_launch;
  return {
    productCode: str(json.product_code),
    productName: json.product_name == null ? null : String(json.product_name),
    statusOverall: json.status_overall == null ? null : String(json.status_overall),
    built: json.built === true,
    daysToLaunch: typeof daysRaw === 'number' ? daysRaw : daysRaw == null ? null : Number(daysRaw),
    launchDate: json.launch_date == null ? null : String(json.launch_date),
    lastUpdated: json.created_at == null ? null : String(json.created_at),
    totalYieldPct,
    validation: validation as ValidationRule[],
  };
}

async function loadSummary(
  productCode: string,
  validationTitles: Record<string, string>,
): Promise<FaRightPanelLoad> {
  try {
    return await withOrgContext(async (rawCtx): Promise<FaRightPanelLoad> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, READ_PERMISSION))) {
        return { state: 'permission_denied' };
      }
      const fa = await readSummary(ctx, productCode, validationTitles);
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
  totalYield: string;
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
  /** V01-V08 validation panel (prototype fa-screens.jsx:421-452). */
  validationTitle: string;
  validationRules: Record<string, string>;
  validationStatusLabels: Record<ValidationStatus, string>;
};

const DEFAULT_VALIDATION_RULES: Record<string, string> = {
  V01: 'FG Code format',
  V02: 'Product Name required',
  V03: 'Pack Size in reference',
  V04: 'D365 material codes',
  V05: 'Dept required fields',
  V06: 'PR Code suffix',
  V07: 'Allergen declaration',
  V08: 'Brief mapping',
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
  totalYield: 'Total yield',
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
  validationTitle: 'Validation status',
  validationRules: DEFAULT_VALIDATION_RULES,
  validationStatusLabels: {
    pass: 'Pass',
    fail: 'Fail',
    warn: 'Warning',
    info: 'Info',
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
      totalYield: pick('totalYield', d.totalYield),
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
      validationTitle: pick('validationTitle', d.validationTitle),
      validationRules: {
        V01: pick('validationRules.V01', d.validationRules.V01),
        V02: pick('validationRules.V02', d.validationRules.V02),
        V03: pick('validationRules.V03', d.validationRules.V03),
        V04: pick('validationRules.V04', d.validationRules.V04),
        V05: pick('validationRules.V05', d.validationRules.V05),
        V06: pick('validationRules.V06', d.validationRules.V06),
        V07: pick('validationRules.V07', d.validationRules.V07),
        V08: pick('validationRules.V08', d.validationRules.V08),
      },
      validationStatusLabels: {
        pass: pick('validationStatusLabels.pass', d.validationStatusLabels.pass),
        fail: pick('validationStatusLabels.fail', d.validationStatusLabels.fail),
        warn: pick('validationStatusLabels.warn', d.validationStatusLabels.warn),
        info: pick('validationStatusLabels.info', d.validationStatusLabels.info),
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
      aria-label="Loading FG summary"
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
        : await loadSummary(productCode, labels.validationRules);

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
      {/* Card 1 — status pill + key facts (status summary above the V-table) */}
      <div className="card" data-slot="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">{labels.keyFacts}</h2>
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
              <dt>{labels.totalYield}</dt>
              <dd
                className="mono"
                style={{ fontWeight: 500, color: 'var(--text)' }}
                data-testid="fa-right-panel-total-yield"
              >
                {fa.totalYieldPct == null ? '—' : `${fa.totalYieldPct.toFixed(2)}%`}
              </dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <dt>{labels.lastUpdated}</dt>
              <dd className="mono" style={{ fontWeight: 500, color: 'var(--text)' }}>{lastUpdated ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* V01-V08 Validation status table (prototype lines 421-452) — ABOVE Built */}
      <ValidationStatusPanel
        title={labels.validationTitle}
        rules={fa.validation}
        statusLabels={labels.validationStatusLabels}
      />

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
