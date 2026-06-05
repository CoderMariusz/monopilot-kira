Reading additional input from stdin...
OpenAI Codex v0.124.0 (research preview)
--------
workdir: /Users/mariuszkrawczyk/Projects/monopilot-kira
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 019e96b6-94b1-72d0-85b1-bd516c36cdbf
--------
user
You are the cross-provider CODEX reviewer for MonoPilot Kira (Gate 4, /kira:review). The code below is a git diff (branch kira/long-run vs main) of Claude/agent-written work — the writer never reviews its own output, so you provide the independent cross-check. Review ONLY this diff (provided on stdin). Do NOT edit anything — review only.

Focus on HIGH-risk red-lines (this is food-mfg MES; regulated):
1. TENANCY: org_id NOT tenant_id; every operational table has RLS ENABLED + FORCED with policies using app.current_org_id() (the function form) — NEVER raw current_setting('app.current_org_id') or SET LOCAL. site_id present as nullable day-1.
2. CANONICAL OWNERS (a module must not create/write another's table): wo_outputs + oee_snapshots + downtime_events = 08-production; schedule_outputs = 04-planning; license_plates = 05-warehouse; item_cost_history = 03-technical (dual w/ finance); quality_holds + ncr_reports = 09-quality. oee_snapshots has a SINGLE producer (08); 15-oee is read-only.
3. RBAC SEED (the #1 live 403 bug): a new permission family must be GRANTed to the org-admin family (org.access.admin/org.platform.admin/owner/admin/org_admin) + operator roles, in BOTH role_permissions AND legacy roles.permissions jsonb, with an org-insert trigger + existing-org backfill, idempotent. The strings GRANTed must byte-match the strings pages CHECK.
4. OUTBOX: every new event_type is in the enum AND the latest migration's CHECK constraint (enum<->CHECK drift). Outbox INSERT must be in the same txn as the state change.
5. MONEY/QTY: NUMERIC-exact, never float/double precision for cost/qty/kg.
6. MIGRATION HYGIENE: 3-digit prefix, monotonic, never edits an applied migration, idempotent (IF NOT EXISTS / OR REPLACE), FK indexes present.
7. REGULATORY: CFR-21 Part 11 e-sign (PIN server-side hash, dual-sign distinct session), BRCGS retention, D365 export-only anti-corruption (R15, soft refs not hard FKs), GS1 SSCC.

Output format:
- A markdown table: | severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
- Then a final line: VERDICT: PASS  (gates-clean, no BLOCK/HIGH) or VERDICT: FAIL + the blocking items.
Be specific and cite the migration filename + line. If the diff is sound, say so plainly with VERDICT: PASS.

<stdin>
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/__tests__/dashboard.test.tsx b/apps/web/app/[locale]/(app)/(modules)/production/__tests__/dashboard.test.tsx
new file mode 100644
index 00000000..5d27275e
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/__tests__/dashboard.test.tsx
@@ -0,0 +1,134 @@
+/**
+ * T-046 — SCR-08-01 Production Dashboard: RTL parity + state tests.
+ *
+ * Prototype: prototypes/design/Monopilot Design System/production/dashboard.jsx:3-146
+ * (production_dashboard, KPI strip) + wo-list.jsx:3-104 (wo_list). Asserts the
+ * structural parity of the presentational pieces (4 live KPI tiles in prototype
+ * order, WO list table with status badges + progress bars + allergen badge) plus
+ * the required UI states (empty / populated). The page itself is an async RSC
+ * reading Supabase via withOrgContext, so it is exercised live (Playwright/manual)
+ * rather than in jsdom; here we test the pure presentational components.
+ */
+import '@testing-library/jest-dom/vitest';
+import React from 'react';
+import { render, screen, within } from '@testing-library/react';
+import { describe, expect, it } from 'vitest';
+
+import { KpiStrip, type KpiTile } from '../_components/kpi-strip';
+import { WoListTable, type WoListLabels, type WoRowView } from '../_components/wo-list-table';
+
+const TILES_POPULATED: KpiTile[] = [
+  { key: 'wo-in-progress', label: 'WOs in progress', value: '3 / 7', sub: 'Running / active', tone: 'info' },
+  { key: 'output-today', label: 'Output · today', value: '4,211 kg', sub: 'Registered output (kg)', tone: 'success' },
+  { key: 'oee-current', label: 'OEE · current', value: '78.4%', sub: 'Latest snapshot', tone: 'info' },
+  { key: 'open-downtime', label: 'Open downtime', value: '2', sub: 'Events not yet ended', tone: 'danger' },
+];
+
+const TILES_EMPTY: KpiTile[] = [
+  { key: 'wo-in-progress', label: 'WOs in progress', value: '0 / 0', sub: 'Running / active', tone: 'default' },
+  { key: 'output-today', label: 'Output · today', value: '0 kg', sub: 'Registered output (kg)', tone: 'default' },
+  { key: 'oee-current', label: 'OEE · current', value: 'No data', sub: 'Latest snapshot', tone: 'default' },
+  { key: 'open-downtime', label: 'Open downtime', value: '0', sub: 'Events not yet ended', tone: 'default' },
+];
+
+const WO_LABELS: WoListLabels = {
+  title: 'Work orders (2)',
+  emptyCopy: 'No work orders yet — released work orders from Planning appear here.',
+  allergenBadge: 'Allergen',
+  planningLink: 'Open in Planning',
+  col: { wo: 'WO', line: 'Line', status: 'Status', planned: 'Planned', progress: 'Progress', output: 'Output' },
+};
+
+const WO_ROWS: WoRowView[] = [
+  {
+    id: 'wo-1',
+    woNumber: 'WO-2026-0001',
+    status: 'in_progress',
+    statusLabel: 'In progress',
+    lineLabel: 'a1b2c3d4',
+    plannedLabel: '1,200 kg',
+    producedLabel: '600 kg',
+    progressPct: 50,
+    allergenGate: true,
+    planningHref: '/planning/work-orders',
+  },
+  {
+    id: 'wo-2',
+    woNumber: 'WO-2026-0002',
+    status: 'planned',
+    statusLabel: 'Planned',
+    lineLabel: '—',
+    plannedLabel: '800 kg',
+    producedLabel: '—',
+    progressPct: 0,
+    allergenGate: false,
+    planningHref: '/planning/work-orders',
+  },
+];
+
+describe('SCR-08-01 KPI strip (parity: dashboard.jsx:71-107)', () => {
+  it('renders exactly 4 live KPI tiles in the prototype order', () => {
+    render(<KpiStrip tiles={TILES_POPULATED} />);
+    const strip = screen.getByTestId('production-kpi-strip');
+    const tiles = within(strip).getAllByTestId(/^production-kpi-/);
+    expect(tiles).toHaveLength(4);
+    expect(tiles.map((el) => el.getAttribute('data-testid'))).toEqual([
+      'production-kpi-wo-in-progress',
+      'production-kpi-output-today',
+      'production-kpi-oee-current',
+      'production-kpi-open-downtime',
+    ]);
+  });
+
+  it('shows each tile label, value and sub-line', () => {
+    render(<KpiStrip tiles={TILES_POPULATED} />);
+    expect(screen.getByText('WOs in progress')).toBeInTheDocument();
+    expect(screen.getByText('4,211 kg')).toBeInTheDocument();
+    expect(screen.getByText('78.4%')).toBeInTheDocument();
+  });
+
+  it('EMPTY state: every tile still renders a value (0 / 0 kg / No data) — never blank', () => {
+    render(<KpiStrip tiles={TILES_EMPTY} />);
+    const strip = screen.getByTestId('production-kpi-strip');
+    expect(within(strip).getAllByTestId(/^production-kpi-/)).toHaveLength(4);
+    expect(screen.getByText('0 kg')).toBeInTheDocument();
+    expect(screen.getByText('No data')).toBeInTheDocument();
+  });
+});
+
+describe('SCR-08-02 WO list (parity: wo-list.jsx:52-101)', () => {
+  it('renders a table of WO rows with status badges and progress bars', () => {
+    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
+    const panel = screen.getByTestId('production-wo-list');
+    expect(within(panel).getByText('WO-2026-0001')).toBeInTheDocument();
+    expect(within(panel).getByText('In progress')).toBeInTheDocument();
+    // Accessible progress bar reflects produced/planned.
+    const bars = within(panel).getAllByRole('progressbar');
+    expect(bars.length).toBeGreaterThan(0);
+    expect(bars[0]).toHaveAttribute('aria-valuenow', '50');
+    expect(within(panel).queryByTestId('production-wo-list-empty')).not.toBeInTheDocument();
+  });
+
+  it('shows the allergen-gate badge only on allergen-flagged rows', () => {
+    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
+    expect(screen.getByTestId('production-wo-allergen-wo-1')).toBeInTheDocument();
+    expect(screen.queryByTestId('production-wo-allergen-wo-2')).not.toBeInTheDocument();
+  });
+
+  it('renders a Planning deep-link for planned (not-yet-startable) WOs — no in-Production Release control', () => {
+    render(<WoListTable rows={WO_ROWS} labels={WO_LABELS} />);
+    const link = screen.getByTestId('production-wo-planning-link-wo-2');
+    expect(link).toHaveAttribute('href', '/planning/work-orders');
+    expect(link).toHaveTextContent('Open in Planning');
+    // Hard red-line: no "Release WO" control anywhere in Production.
+    expect(screen.queryByText(/release wo/i)).not.toBeInTheDocument();
+  });
+
+  it('EMPTY state: shows the empty WO-list copy and no table', () => {
+    render(<WoListTable rows={[]} labels={WO_LABELS} />);
+    expect(screen.getByTestId('production-wo-list-empty')).toHaveTextContent(
+      'No work orders yet — released work orders from Planning appear here.',
+    );
+    expect(screen.queryByRole('table')).not.toBeInTheDocument();
+  });
+});
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts b/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts
new file mode 100644
index 00000000..c2bf5fb0
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts
@@ -0,0 +1,267 @@
+/**
+ * T-046 — 08-Production Dashboard (SCR-08-01): org-scoped live KPI + WO-list reads.
+ *
+ * Prototype: prototypes/design/Monopilot Design System/production/dashboard.jsx:3-146
+ * (production_dashboard, 6-KPI strip) + wo-list.jsx:3-104 (wo_list). The prototype's
+ * LINES / EVENTS_FEED / WOS mock arrays are replaced 1:1 with real Supabase reads.
+ *
+ * Every read runs inside `withOrgContext`, so it executes as `app_user` with
+ * `app.set_org_context(...)` applied — RLS (`org_id = app.current_org_id()`)
+ * scopes every count/row/sum to the signed-in user's organization. No service-role
+ * bypass, no mocks. Canonical owners are respected (read-only here):
+ *   - wo_executions / wo_outputs / downtime_events / oee_snapshots → 08-production
+ *     (migrations 181-184). work_orders → 04-planning (migration 176).
+ *
+ * RBAC: the page is gated server-side on `production.oee.read` (the production
+ * read permission seeded to the org-admin + operator + supervisor role families in
+ * migration 185). The client never re-queries and never trusts a client-side flag.
+ *
+ * NOT a `"use server"` module: these helpers are invoked directly from the
+ * Production dashboard Server Component during render (not as client-callable
+ * actions). The import of `withOrgContext` (Node-only pg pools) keeps the module
+ * server-only in practice.
+ */
+import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
+
+type QueryClient = {
+  query<T = Record<string, unknown>>(
+    sql: string,
+    params?: readonly unknown[],
+  ): Promise<{ rows: T[]; rowCount?: number | null }>;
+};
+
+/** The production view permission (migration 185 — org-admin/operator/supervisor). */
+const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';
+
+/** Materialized execution-lifecycle states (wo_executions.status). */
+export type WoExecStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'cancelled';
+
+/** One WO row surfaced on the dashboard WO list (live, org-scoped). */
+export type WoListRow = {
+  id: string;
+  woNumber: string;
+  /** Execution lifecycle status (folded from wo_events); falls back to the planning status. */
+  status: WoExecStatus;
+  lineId: string | null;
+  plannedKg: number;
+  producedKg: number | null;
+  /** 0..100 progress = produced/planned, clamped. Null when planned is 0. */
+  progressPct: number | null;
+  /** True when the WO carries an allergen profile snapshot (changeover gate may apply). */
+  allergenGate: boolean;
+};
+
+export type ProductionDashboardKpis = {
+  /** count(wo_executions WHERE status='in_progress') */
+  woInProgress: number;
+  /** count(wo_executions WHERE status IN ('planned','in_progress','paused')) — the denominator. */
+  woActiveTotal: number;
+  /** sum(wo_outputs.qty_kg WHERE registered_at::date = current_date), in kg. */
+  outputTodayKg: number;
+  /** Latest oee_snapshots.oee_pct (most recent snapshot_minute); null = no snapshot yet. */
+  oeeCurrentPct: number | null;
+  /** count(downtime_events WHERE ended_at IS NULL) — currently-open downtime. */
+  openDowntime: number;
+  /** Per-status counts for the WO-list status tabs. */
+  statusCounts: Record<WoExecStatus, number>;
+  /** Live WO rows (newest scheduled first, capped). */
+  woRows: WoListRow[];
+};
+
+const ALL_STATUSES: WoExecStatus[] = [
+  'planned',
+  'in_progress',
+  'paused',
+  'completed',
+  'closed',
+  'cancelled',
+];
+
+/** Resolves whether the caller holds a permission, org-scoped under RLS. */
+async function hasPermission(
+  c: QueryClient,
+  userId: string,
+  orgId: string,
+  permission: string,
+): Promise<boolean> {
+  const { rows } = await c.query<{ ok: boolean }>(
+    `select true as ok
+       from public.user_roles ur
+       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
+       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
+      where ur.user_id = $1::uuid
+        and ur.org_id = $2::uuid
+        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
+      limit 1`,
+    [userId, orgId, permission],
+  );
+  return rows.length > 0;
+}
+
+/**
+ * Result wrapper:
+ *   - `ok:true`              → KPIs + WO rows.
+ *   - `ok:false, reason:'forbidden'` → caller lacks production.oee.read (permission-denied UI).
+ *   - `ok:false, reason:'error'`     → live read failed (error banner, never a 500).
+ */
+export type ProductionDashboardResult =
+  | { ok: true; data: ProductionDashboardKpis }
+  | { ok: false; reason: 'forbidden' | 'error' };
+
+/**
+ * Aggregates all KPI tiles + the WO list in a SINGLE org-context transaction.
+ * Queries run sequentially on the one pooled pg client (node-pg does not run
+ * concurrent queries on a single connection).
+ */
+export async function getProductionDashboard(): Promise<ProductionDashboardResult> {
+  try {
+    return await withOrgContext(async ({ userId, orgId, client }): Promise<ProductionDashboardResult> => {
+      const c = client as QueryClient;
+
+      // ── RBAC gate (server-side, never trust the client) ──────────────────────
+      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
+      if (!allowed) {
+        return { ok: false, reason: 'forbidden' };
+      }
+
+      const countOf = async (sql: string, params?: readonly unknown[]): Promise<number> => {
+        const res = await c.query<{ n: number }>(sql, params);
+        return res.rows[0]?.n ?? 0;
+      };
+
+      // KPI 1 — WOs in progress (executions materialized state).
+      const woInProgress = await countOf(
+        `select count(*)::int as n
+           from public.wo_executions
+          where org_id = app.current_org_id()
+            and status = 'in_progress'`,
+      );
+
+      // Denominator — active executions (planned + running + paused).
+      const woActiveTotal = await countOf(
+        `select count(*)::int as n
+           from public.wo_executions
+          where org_id = app.current_org_id()
+            and status in ('planned', 'in_progress', 'paused')`,
+      );
+
+      // KPI 2 — Output today (kg): sum of canonical wo_outputs registered today.
+      const outputRes = await c.query<{ kg: string | number | null }>(
+        `select coalesce(sum(qty_kg), 0) as kg
+           from public.wo_outputs
+          where org_id = app.current_org_id()
+            and registered_at >= date_trunc('day', now())
+            and registered_at < date_trunc('day', now()) + interval '1 day'`,
+      );
+      const outputTodayKg = Number(outputRes.rows[0]?.kg ?? 0);
+
+      // KPI 3 — OEE current: most recent snapshot's oee_pct (08 is the sole producer).
+      const oeeRes = await c.query<{ oee_pct: string | number | null }>(
+        `select oee_pct
+           from public.oee_snapshots
+          where org_id = app.current_org_id()
+          order by snapshot_minute desc
+          limit 1`,
+      );
+      const rawOee = oeeRes.rows[0]?.oee_pct;
+      const oeeCurrentPct = rawOee === undefined || rawOee === null ? null : Number(rawOee);
+
+      // KPI 4 — Open downtime: events with no end (V-PROD-06 open-event semantics).
+      const openDowntime = await countOf(
+        `select count(*)::int as n
+           from public.downtime_events
+          where org_id = app.current_org_id()
+            and ended_at is null`,
+      );
+
+      // Status-tab counts (GROUP BY execution status).
+      const statusRes = await c.query<{ status: string; n: number }>(
+        `select status, count(*)::int as n
+           from public.wo_executions
+          where org_id = app.current_org_id()
+          group by status`,
+      );
+      const statusCounts = ALL_STATUSES.reduce(
+        (acc, s) => {
+          acc[s] = 0;
+          return acc;
+        },
+        {} as Record<WoExecStatus, number>,
+      );
+      for (const r of statusRes.rows) {
+        if ((ALL_STATUSES as string[]).includes(r.status)) {
+          statusCounts[r.status as WoExecStatus] = r.n;
+        }
+      }
+
+      // WO list — join executions to the planning work_orders for number/line/qty.
+      // Executions own the live status; planning owns the WO header. LEFT JOIN keeps
+      // any execution whose planning row was archived from silently vanishing.
+      const woRes = await c.query<{
+        id: string;
+        wo_number: string | null;
+        status: string;
+        production_line_id: string | null;
+        planned_quantity: string | number | null;
+        produced_quantity: string | number | null;
+        has_allergen: boolean;
+      }>(
+        `select e.wo_id::text as id,
+                w.wo_number,
+                e.status,
+                w.production_line_id::text as production_line_id,
+                w.planned_quantity,
+                w.produced_quantity,
+                (w.allergen_profile_snapshot is not null) as has_allergen
+           from public.wo_executions e
+           left join public.work_orders w
+             on w.id = e.wo_id and w.org_id = e.org_id
+          where e.org_id = app.current_org_id()
+          order by w.scheduled_start_time desc nulls last, e.created_at desc
+          limit 25`,
+      );
+
+      const woRows: WoListRow[] = woRes.rows.map((r) => {
+        const plannedKg = Number(r.planned_quantity ?? 0);
+        const producedKg = r.produced_quantity === null || r.produced_quantity === undefined
+          ? null
+          : Number(r.produced_quantity);
+        const progressPct =
+          plannedKg > 0 && producedKg !== null
+            ? Math.min(100, Math.round((producedKg / plannedKg) * 100))
+            : plannedKg > 0
+              ? 0
+              : null;
+        const status = (ALL_STATUSES as string[]).includes(r.status)
+          ? (r.status as WoExecStatus)
+          : 'planned';
+        return {
+          id: r.id,
+          woNumber: r.wo_number ?? r.id.slice(0, 8),
+          status,
+          lineId: r.production_line_id,
+          plannedKg,
+          producedKg,
+          progressPct,
+          allergenGate: Boolean(r.has_allergen),
+        };
+      });
+
+      return {
+        ok: true,
+        data: {
+          woInProgress,
+          woActiveTotal,
+          outputTodayKg,
+          oeeCurrentPct,
+          openDowntime,
+          statusCounts,
+          woRows,
+        },
+      };
+    });
+  } catch (error) {
+    console.error('[production/dashboard] KPI aggregate read failed:', error);
+    return { ok: false, reason: 'error' };
+  }
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/_components/kpi-strip.tsx b/apps/web/app/[locale]/(app)/(modules)/production/_components/kpi-strip.tsx
new file mode 100644
index 00000000..fe100e0c
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/_components/kpi-strip.tsx
@@ -0,0 +1,81 @@
+/**
+ * T-046 — SCR-08-01 Production Dashboard: KPI strip (4 live tiles).
+ *
+ * Prototype parity: prototypes/design/Monopilot Design System/production/
+ * dashboard.jsx:71-107 (the `kpi-row` of 6 KPI cards). The dashboard-landing scope
+ * surfaces the 4 data-backed tiles wired to real Supabase reads (WOs in progress,
+ * output today, OEE current shift, open downtime); the prototype's "QA holds" and
+ * "Next changeover" tiles are owned by the 09-quality holdsGuard view and the
+ * T-048 allergen-changeover surface respectively (deviation logged — out of scope
+ * for this dashboard landing, see closeout).
+ *
+ * Presentational only — all strings arrive as props (i18n resolved by the RSC page
+ * via next-intl), all numbers from real Supabase reads. Tone is never the sole
+ * signal: each tone renders both a colored value and a Badge dot, plus the label.
+ */
+import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
+import { Card } from '@monopilot/ui/Card';
+
+export type KpiTone = 'default' | 'info' | 'warning' | 'danger' | 'success';
+
+export type KpiTile = {
+  /** Stable key used for the testid + React key. */
+  key: string;
+  label: string;
+  /** Rendered value — a formatted count / kg / percentage. */
+  value: string;
+  sub: string;
+  tone: KpiTone;
+};
+
+const TONE_TO_VARIANT: Record<KpiTone, BadgeVariant> = {
+  default: 'muted',
+  info: 'info',
+  warning: 'warning',
+  danger: 'danger',
+  success: 'success',
+};
+
+const TONE_VALUE_CLASS: Record<KpiTone, string> = {
+  default: 'text-slate-900',
+  info: 'text-sky-600',
+  warning: 'text-amber-600',
+  danger: 'text-red-600',
+  success: 'text-emerald-600',
+};
+
+function Tile({ tile }: { tile: KpiTile }) {
+  return (
+    <Card
+      data-testid={`production-kpi-${tile.key}`}
+      data-tone={tile.tone}
+      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
+    >
+      <div className="flex items-center justify-between gap-2">
+        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</span>
+        {tile.tone !== 'default' ? (
+          <Badge variant={TONE_TO_VARIANT[tile.tone]} className="shrink-0">
+            <span aria-hidden>●</span>
+          </Badge>
+        ) : null}
+      </div>
+      <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${TONE_VALUE_CLASS[tile.tone]}`}>
+        {tile.value}
+      </div>
+      <div className="mt-1 text-xs text-slate-500">{tile.sub}</div>
+    </Card>
+  );
+}
+
+export function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
+  return (
+    <div
+      data-testid="production-kpi-strip"
+      className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
+    >
+      {tiles.map((tile) => (
+        <Tile key={tile.key} tile={tile} />
+      ))}
+    </div>
+  );
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/_components/wo-list-table.tsx b/apps/web/app/[locale]/(app)/(modules)/production/_components/wo-list-table.tsx
new file mode 100644
index 00000000..50ac63a1
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/_components/wo-list-table.tsx
@@ -0,0 +1,157 @@
+/**
+ * T-046 — SCR-08-02 Production WO list (dashboard panel).
+ *
+ * Prototype parity: prototypes/design/Monopilot Design System/production/
+ * wo-list.jsx:52-101 (the WO table: WO number + allergen badge, item/product,
+ * line, status badge, planned kg, progress bar, output). Translated to the
+ * @monopilot/ui Table + Badge primitives; the prototype's WOS mock array + raw
+ * `<table>` are replaced by real wo_executions⨝work_orders rows (RLS-scoped) and
+ * shadcn primitives. The inline progress `<span>` becomes an accessible
+ * `role="progressbar"` bar. Per-row Start/Pause/Resume actions are out of scope
+ * for the landing panel (T-047 owns row actions / the Start WO modal); a blocked
+ * (planned) row carries a Planning deep-link instead of an in-Production Release
+ * control — the deprecated `release_wo_modal` is never rendered.
+ *
+ * Presentational only — strings (headers, status labels, empty copy) arrive as
+ * props so the panel is RTL-testable and i18n is owned by the page.
+ */
+import Link from 'next/link';
+
+import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
+import { Card } from '@monopilot/ui/Card';
+import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
+
+import type { WoExecStatus } from '../_actions/dashboard-data';
+
+export type WoRowView = {
+  id: string;
+  woNumber: string;
+  status: WoExecStatus;
+  statusLabel: string;
+  lineLabel: string;
+  plannedLabel: string;
+  producedLabel: string;
+  progressPct: number | null;
+  allergenGate: boolean;
+  /** Deep-link to the Planning release queue for not-yet-startable (planned) WOs. */
+  planningHref: string | null;
+};
+
+const STATUS_VARIANT: Record<WoExecStatus, BadgeVariant> = {
+  planned: 'muted',
+  in_progress: 'info',
+  paused: 'warning',
+  completed: 'success',
+  closed: 'secondary',
+  cancelled: 'danger',
+};
+
+export type WoListLabels = {
+  title: string;
+  emptyCopy: string;
+  allergenBadge: string;
+  planningLink: string;
+  col: {
+    wo: string;
+    line: string;
+    status: string;
+    planned: string;
+    progress: string;
+    output: string;
+  };
+};
+
+function ProgressBar({ pct, label }: { pct: number; label: string }) {
+  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-sky-500' : 'bg-amber-500';
+  return (
+    <div
+      role="progressbar"
+      aria-valuenow={pct}
+      aria-valuemin={0}
+      aria-valuemax={100}
+      aria-label={label}
+      className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"
+    >
+      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
+    </div>
+  );
+}
+
+export function WoListTable({ rows, labels }: { rows: WoRowView[]; labels: WoListLabels }) {
+  return (
+    <Card
+      data-testid="production-wo-list"
+      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
+    >
+      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
+        {labels.title}
+      </div>
+      {rows.length === 0 ? (
+        <p data-testid="production-wo-list-empty" className="px-4 py-8 text-center text-sm text-slate-500">
+          {labels.emptyCopy}
+        </p>
+      ) : (
+        <Table aria-label={labels.title}>
+          <TableHeader>
+            <TableRow>
+              <TableHead scope="col">{labels.col.wo}</TableHead>
+              <TableHead scope="col">{labels.col.line}</TableHead>
+              <TableHead scope="col">{labels.col.status}</TableHead>
+              <TableHead scope="col" className="text-right">{labels.col.planned}</TableHead>
+              <TableHead scope="col">{labels.col.progress}</TableHead>
+              <TableHead scope="col" className="text-right">{labels.col.output}</TableHead>
+            </TableRow>
+          </TableHeader>
+          <TableBody>
+            {rows.map((row) => (
+              <TableRow key={row.id} data-testid={`production-wo-row-${row.id}`}>
+                <TableCell className="font-mono text-sm font-semibold text-slate-900">
+                  <span className="inline-flex items-center gap-2">
+                    {row.woNumber}
+                    {row.allergenGate ? (
+                      <Badge
+                        variant="warning"
+                        data-testid={`production-wo-allergen-${row.id}`}
+                        className="text-[10px]"
+                      >
+                        {labels.allergenBadge}
+                      </Badge>
+                    ) : null}
+                  </span>
+                </TableCell>
+                <TableCell className="font-mono text-xs text-slate-500">{row.lineLabel}</TableCell>
+                <TableCell>
+                  <Badge variant={STATUS_VARIANT[row.status]}>{row.statusLabel}</Badge>
+                </TableCell>
+                <TableCell className="text-right font-mono text-sm tabular-nums">{row.plannedLabel}</TableCell>
+                <TableCell>
+                  {row.progressPct === null ? (
+                    <span className="text-xs text-slate-400">—</span>
+                  ) : (
+                    <div className="flex flex-col gap-1">
+                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">{row.progressPct}%</span>
+                      <ProgressBar pct={row.progressPct} label={`${labels.col.progress} ${row.progressPct}%`} />
+                    </div>
+                  )}
+                </TableCell>
+                <TableCell className="text-right font-mono text-xs tabular-nums">
+                  {row.status === 'planned' && row.planningHref ? (
+                    <Link
+                      href={row.planningHref}
+                      data-testid={`production-wo-planning-link-${row.id}`}
+                      className="text-sky-600 hover:text-sky-700"
+                    >
+                      {labels.planningLink}
+                    </Link>
+                  ) : (
+                    row.producedLabel
+                  )}
+                </TableCell>
+              </TableRow>
+            ))}
+          </TableBody>
+        </Table>
+      )}
+    </Card>
+  );
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/page.tsx b/apps/web/app/[locale]/(app)/(modules)/production/page.tsx
index c4e239a5..fd940a4b 100644
--- a/apps/web/app/[locale]/(app)/(modules)/production/page.tsx
+++ b/apps/web/app/[locale]/(app)/(modules)/production/page.tsx
@@ -1,30 +1,233 @@
-import { getTranslations } from "next-intl/server";
+/**
+ * T-046 — SCR-08-01 Production Dashboard (08-production module landing page).
+ *
+ * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
+ *   - dashboard.jsx:3-146 (production_dashboard) — page head + KPI strip + Lines/
+ *     WO area + quick-nav. Structural correspondence:
+ *       PageHeader "Production" + breadcrumb            → dashboard.jsx:48-59
+ *       KPI strip (live tiles)                          → dashboard.jsx:71-107
+ *       WO list panel                                   → wo-list.jsx:52-101
+ *       nav cards → production sub-areas                → dashboard.jsx:145-156 (quick actions)
+ *   - wo-list.jsx:3-104 (wo_list) — the WO table + status-tab counts.
+ *
+ * The prototype's LINES / EVENTS_FEED / WOS mock arrays are replaced 1:1 with real
+ * Supabase reads (wo_executions, wo_outputs, downtime_events, oee_snapshots,
+ * work_orders) via withOrgContext — RLS-scoped, no mocks. The deprecated
+ * `release_wo_modal` / "+ Release WO" control is never rendered (release lives in
+ * 04-planning); planned WOs carry a Planning deep-link instead.
+ *
+ * UI states: loading (Suspense skeleton, no CLS), empty (zero KPIs + empty WO-list
+ * copy), error (failed read → error banner), permission-denied (production.oee.read
+ * gated → denied panel, action hidden not disabled), optimistic — N/A (read-only).
+ *
+ * RBAC: server-resolved `production.oee.read` (migration 185). The client never
+ * re-queries and never trusts a client-side permission flag.
+ *
+ * See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
+ */
+import Link from 'next/link';
+import { Suspense } from 'react';
+import { getTranslations } from 'next-intl/server';
 
-import { getModuleCount } from "../_actions/skeleton-data";
-import { ModuleDataPanel } from "../_components/module-data-panel";
+import { Card } from '@monopilot/ui/Card';
+import { PageHeader } from '@monopilot/ui/PageHeader';
+
+import {
+  getProductionDashboard,
+  type WoExecStatus,
+  type WoListRow,
+} from './_actions/dashboard-data';
+import { KpiStrip, type KpiTile, type KpiTone } from './_components/kpi-strip';
+import { WoListTable, type WoListLabels, type WoRowView } from './_components/wo-list-table';
 
 // Org-scoped DB read per request — never statically prerendered.
-export const dynamic = "force-dynamic";
+export const dynamic = 'force-dynamic';
+
+type NavCard = { key: string; href: string };
+
+// Nav cards → the Production sub-areas + cross-module reads. The WO-list / detail /
+// waste / downtime / shifts / analytics routes are owned by sibling agents
+// (T-047..T-051) — this landing page only links to them. OEE / Quality / Planning
+// are cross-module landings that already exist.
+const NAV_CARDS: NavCard[] = [
+  { key: 'workOrders', href: '/production/wos' },
+  { key: 'downtime', href: '/production/downtime' },
+  { key: 'waste', href: '/production/waste' },
+  { key: 'changeover', href: '/production/changeover' },
+  { key: 'shifts', href: '/production/shifts' },
+  { key: 'analytics', href: '/production/analytics' },
+  { key: 'oee', href: '/oee' },
+  { key: 'quality', href: '/quality' },
+];
+
+/** Deep-link target for not-yet-startable (planned) WOs — Planning owns release. */
+const PLANNING_RELEASE_HREF = '/planning/work-orders';
 
-export default async function ProductionRoutePage() {
-  const t = await getTranslations("Navigation.app.items");
-  const s = await getTranslations("Skeleton");
-  const result = await getModuleCount("work_order");
+const KG_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
 
+/** Skeleton placeholder matching the eventual layout (no CLS). */
+function DashboardSkeleton() {
   return (
-    <section data-testid="module-landing-production" className="p-8" aria-labelledby="module-landing-production-title">
-      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
-        <h1 id="module-landing-production-title" className="text-3xl font-semibold tracking-tight text-slate-950">
-          {t("production")}
-        </h1>
-        <ModuleDataPanel
-          liveBadge={s("liveBadge")}
-          rlsNote={s("rlsNote")}
-          unavailableLabel={s("unavailable")}
-          formatCount={(count) => s("records", { count })}
-          result={result}
-        />
+    <div data-testid="production-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
+      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
+        {Array.from({ length: 4 }).map((_, i) => (
+          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
+        ))}
       </div>
-    </section>
+      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
+    </div>
+  );
+}
+
+async function DashboardContent() {
+  const t = await getTranslations('production.dashboard');
+  const result = await getProductionDashboard();
+
+  // ── Permission-denied state (server-resolved; action hidden, not disabled) ───
+  if (!result.ok && result.reason === 'forbidden') {
+    return (
+      <div
+        role="note"
+        data-testid="production-dashboard-denied"
+        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
+      >
+        {t('denied')}
+      </div>
+    );
+  }
+
+  // ── Error state (failed live read → banner, never a 500) ─────────────────────
+  if (!result.ok) {
+    return (
+      <div
+        role="alert"
+        data-testid="production-dashboard-error"
+        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
+      >
+        {t('error')}
+      </div>
+    );
+  }
+
+  const data = result.data;
+
+  // ── KPI tiles (4 live, in prototype order) ──────────────────────────────────
+  const outputVal = `${KG_FMT.format(Math.round(data.outputTodayKg))} kg`;
+  const oeeVal = data.oeeCurrentPct === null ? t('kpi.oee.none') : `${data.oeeCurrentPct.toFixed(1)}%`;
+
+  const tiles: KpiTile[] = [
+    {
+      key: 'wo-in-progress',
+      label: t('kpi.woInProgress.label'),
+      value: `${data.woInProgress} / ${data.woActiveTotal}`,
+      sub: t('kpi.woInProgress.sub'),
+      tone: data.woInProgress > 0 ? 'info' : 'default',
+    },
+    {
+      key: 'output-today',
+      label: t('kpi.outputToday.label'),
+      value: outputVal,
+      sub: t('kpi.outputToday.sub'),
+      tone: data.outputTodayKg > 0 ? 'success' : 'default',
+    },
+    {
+      key: 'oee-current',
+      label: t('kpi.oee.label'),
+      value: oeeVal,
+      sub: t('kpi.oee.sub'),
+      tone: oeeTone(data.oeeCurrentPct),
+    },
+    {
+      key: 'open-downtime',
+      label: t('kpi.downtime.label'),
+      value: String(data.openDowntime),
+      sub: t('kpi.downtime.sub'),
+      tone: data.openDowntime > 0 ? 'danger' : 'default',
+    },
+  ];
+
+  // ── WO list rows (view models; i18n + formatting owned here) ─────────────────
+  const statusLabel = (s: WoExecStatus): string => t(`woStatus.${s}`);
+  const woLabels: WoListLabels = {
+    title: t('woList.title', { count: data.woRows.length }),
+    emptyCopy: t('woList.empty'),
+    allergenBadge: t('woList.allergenBadge'),
+    planningLink: t('woList.planningLink'),
+    col: {
+      wo: t('woList.col.wo'),
+      line: t('woList.col.line'),
+      status: t('woList.col.status'),
+      planned: t('woList.col.planned'),
+      progress: t('woList.col.progress'),
+      output: t('woList.col.output'),
+    },
+  };
+  const woRows: WoRowView[] = data.woRows.map((r: WoListRow) => ({
+    id: r.id,
+    woNumber: r.woNumber,
+    status: r.status,
+    statusLabel: statusLabel(r.status),
+    lineLabel: r.lineId ? r.lineId.slice(0, 8) : '—',
+    plannedLabel: `${KG_FMT.format(Math.round(r.plannedKg))} kg`,
+    producedLabel: r.producedKg === null ? '—' : `${KG_FMT.format(Math.round(r.producedKg))} kg`,
+    progressPct: r.progressPct,
+    allergenGate: r.allergenGate,
+    planningHref: PLANNING_RELEASE_HREF,
+  }));
+
+  return (
+    <div className="flex flex-col gap-6">
+      <KpiStrip tiles={tiles} />
+
+      <WoListTable rows={woRows} labels={woLabels} />
+
+      {/* Nav cards → Production sub-areas + cross-module reads */}
+      <nav aria-label={t('nav.label')} className="border-t border-slate-200 pt-6">
+        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
+          {NAV_CARDS.map((card) => (
+            <li key={card.key}>
+              <Link
+                href={card.href}
+                data-testid={`production-nav-${card.key}`}
+                className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
+              >
+                <span className="text-base font-semibold text-slate-950">{t(`nav.${card.key}.title`)}</span>
+                <span className="mt-1 text-sm text-slate-600">{t(`nav.${card.key}.desc`)}</span>
+              </Link>
+            </li>
+          ))}
+        </ul>
+      </nav>
+    </div>
+  );
+}
+
+/** OEE tone: world-class ≥85 success, ≥60 info, ≥40 warning, else danger; null neutral. */
+function oeeTone(pct: number | null): KpiTone {
+  if (pct === null) return 'default';
+  if (pct >= 85) return 'success';
+  if (pct >= 60) return 'info';
+  if (pct >= 40) return 'warning';
+  return 'danger';
+}
+
+export default async function ProductionDashboardPage() {
+  const t = await getTranslations('production.dashboard');
+
+  return (
+    <main
+      data-screen="production-dashboard"
+      data-prototype-label="production_dashboard"
+      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
+    >
+      <PageHeader
+        title={t('title')}
+        subtitle={t('subtitle')}
+        breadcrumb={[{ label: t('breadcrumb.production') }, { label: t('breadcrumb.dashboard') }]}
+      />
+      <Suspense fallback={<DashboardSkeleton />}>
+        <DashboardContent />
+      </Suspense>
+    </main>
   );
 }
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/_actions/route-helpers.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/_actions/route-helpers.ts
new file mode 100644
index 00000000..100c3dcc
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/_actions/route-helpers.ts
@@ -0,0 +1,70 @@
+/**
+ * 08-Production E1 — route-handler glue for the WO-lifecycle services.
+ *
+ * NOT a `'use server'` module (it exports helpers + types). Each transition
+ * route handler:
+ *   1. validates the request body with zod (→ 422 invalid_input),
+ *   2. opens `withOrgContext(...)` (the only place a DB txn opens),
+ *   3. calls the matching service with the txn-bound ctx,
+ *   4. maps the ProductionResult discriminated union to a NextResponse with the
+ *      service's canonical HTTP status.
+ *
+ * The service owns RBAC, the state machine, outbox-in-txn, and e-sign. The route
+ * is a thin transport adapter — no business logic leaks here.
+ */
+
+import { NextResponse } from 'next/server';
+import type { z } from 'zod';
+
+import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
+import type { ProductionContext, ProductionResult } from '../../../../../../../../lib/production/shared';
+
+/** Map a ProductionResult to a NextResponse using the service's status. */
+export function toResponse<T>(result: ProductionResult<T>): NextResponse {
+  if (result.ok) {
+    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
+  }
+  return NextResponse.json(
+    { ok: false, error: result.error, message: result.message, details: result.details },
+    { status: result.status },
+  );
+}
+
+/**
+ * Parse + validate the JSON body, run the service inside withOrgContext, and
+ * return the mapped NextResponse. On a malformed body → 422 invalid_input.
+ */
+export async function runTransition<TSchema extends z.ZodTypeAny, TData>(
+  request: Request,
+  schema: TSchema,
+  service: (ctx: ProductionContext, input: z.infer<TSchema>) => Promise<ProductionResult<TData>>,
+): Promise<NextResponse> {
+  let raw: unknown;
+  try {
+    raw = await request.json();
+  } catch {
+    return NextResponse.json({ ok: false, error: 'invalid_input', message: 'malformed JSON body' }, { status: 422 });
+  }
+
+  const parsed = schema.safeParse(raw);
+  if (!parsed.success) {
+    return NextResponse.json(
+      { ok: false, error: 'invalid_input', details: parsed.error.flatten() },
+      { status: 422 },
+    );
+  }
+
+  try {
+    const result = await withOrgContext((ctx) => service(ctx, parsed.data));
+    return toResponse(result);
+  } catch (err) {
+    // withOrgContext throws on auth/lookup failure (treat as 401/403 surface) or
+    // an unexpected DB error (the txn already rolled back).
+    const message = err instanceof Error ? err.message : String(err);
+    const isAuth = /JWT|org_id|users row|verification/i.test(message);
+    return NextResponse.json(
+      { ok: false, error: isAuth ? 'forbidden' : 'persistence_failed', message },
+      { status: isAuth ? 403 : 500 },
+    );
+  }
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/cancel/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/cancel/route.ts
new file mode 100644
index 00000000..4a1d90da
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/cancel/route.ts
@@ -0,0 +1,18 @@
+import { z } from 'zod';
+
+import { cancelWo } from '../../../../../../../../lib/production/complete-cancel-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const CancelBody = z.object({
+  transactionId: z.string().uuid(),
+  reasonCode: z.string().min(1).max(64),
+  notes: z.string().max(2000).optional().nullable(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, CancelBody, (ctx, input) => cancelWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/close/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/close/route.ts
new file mode 100644
index 00000000..c9851452
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/close/route.ts
@@ -0,0 +1,20 @@
+import { z } from 'zod';
+
+import { closeWo } from '../../../../../../../../lib/production/close-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const CloseBody = z.object({
+  transactionId: z.string().uuid(),
+  signerUserId: z.string().uuid(),
+  pin: z.string().min(1).max(64),
+  reason: z.string().min(1).max(2000),
+  nonce: z.string().min(1).max(128).optional(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, CloseBody, (ctx, input) => closeWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/complete/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/complete/route.ts
new file mode 100644
index 00000000..cac344a8
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/complete/route.ts
@@ -0,0 +1,17 @@
+import { z } from 'zod';
+
+import { completeWo } from '../../../../../../../../lib/production/complete-cancel-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const CompleteBody = z.object({
+  transactionId: z.string().uuid(),
+  overrideReasonCode: z.string().min(1).max(64).optional().nullable(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, CompleteBody, (ctx, input) => completeWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts
new file mode 100644
index 00000000..a050fa61
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/outputs/route.ts
@@ -0,0 +1,81 @@
+/**
+ * T-028 / T-032 — POST /:locale/.../production/work-orders/:id/outputs
+ *
+ * Registers a primary / co_product / by_product output into the canonical
+ * wo_outputs table (08-production owns this — NOT 04-planning). Catch-weight
+ * details (T-032) are captured when the item's weight_mode='catch'.
+ *
+ * withOrgContext (RLS + org scope) → registerOutput service → wo_outputs INSERT
+ * + production.output.recorded outbox event, all in one transaction. The quality
+ * consume gate (holdsGuard) runs FIRST; an active hold ⇒ 409 +
+ * production.consume.blocked.
+ *
+ * Red lines (MON-domain-production): no duplicate wo_outputs table, no direct
+ * wo_executions.status write (read-only seam), no inline D365 calls, outbox INSERT
+ * inside the state-change txn.
+ */
+import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
+import {
+  ProductionActionError,
+  QualityHoldError,
+  emitConsumeBlocked,
+  type OrgContextLike,
+  type QueryClient,
+} from '../../../../../../../../lib/production/shared';
+import { registerOutput } from '../../../../../../../../lib/production/output/register-output';
+
+function json(body: unknown, status: number): Response {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { 'content-type': 'application/json' },
+  });
+}
+
+export async function POST(
+  req: Request,
+  ctx: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id: woId } = await ctx.params;
+
+  let body: unknown;
+  try {
+    body = await req.json();
+  } catch {
+    return json({ error: 'invalid_input' }, 422);
+  }
+
+  try {
+    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
+      const orgCtx: OrgContextLike = { userId, orgId, client: client as unknown as QueryClient };
+      const result = await registerOutput(orgCtx, woId, body);
+      return json({ data: result }, 200);
+    });
+  } catch (err) {
+    // Active quality hold: the mutating txn rolled back; emit the blocked audit
+    // event on a fresh committed txn, then surface 409.
+    if (err instanceof QualityHoldError) {
+      try {
+        await withOrgContext(async ({ userId, orgId, client }) => {
+          await emitConsumeBlocked(
+            { userId, orgId, client: client as unknown as QueryClient },
+            err,
+          );
+        });
+      } catch (emitErr) {
+        console.error('[production/outputs] consume_blocked_emit_failed', {
+          woId,
+          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
+        });
+      }
+      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
+    }
+    if (err instanceof ProductionActionError) {
+      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
+    }
+    console.error('[production/outputs] POST persistence_failed', {
+      woId,
+      err: err instanceof Error ? err.message : String(err),
+    });
+    return json({ error: 'persistence_failed' }, 500);
+  }
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/pause/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/pause/route.ts
new file mode 100644
index 00000000..5cf4df69
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/pause/route.ts
@@ -0,0 +1,20 @@
+import { z } from 'zod';
+
+import { pauseWo } from '../../../../../../../../lib/production/pause-resume-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const PauseBody = z.object({
+  transactionId: z.string().uuid(),
+  reasonCategoryId: z.string().uuid(),
+  lineId: z.string().min(1).max(64),
+  shiftId: z.string().min(1).max(64).optional().nullable(),
+  notes: z.string().max(2000).optional().nullable(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, PauseBody, (ctx, input) => pauseWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/resume/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/resume/route.ts
new file mode 100644
index 00000000..7607c1e0
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/resume/route.ts
@@ -0,0 +1,17 @@
+import { z } from 'zod';
+
+import { resumeWo } from '../../../../../../../../lib/production/pause-resume-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const ResumeBody = z.object({
+  transactionId: z.string().uuid(),
+  actualDurationMin: z.number().int().positive().optional().nullable(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, ResumeBody, (ctx, input) => resumeWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/route.ts
new file mode 100644
index 00000000..8df0270e
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/route.ts
@@ -0,0 +1,24 @@
+import { NextResponse } from 'next/server';
+
+import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
+import { getWoRuntimeState } from '../../../../../../../lib/production/get-wo-runtime-state';
+import { toResponse } from './_actions/route-helpers';
+
+/** GET WO detail / runtime state (T-016 + T-021). Read-only, RLS-scoped. */
+export async function GET(
+  _request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  try {
+    const result = await withOrgContext((ctx) => getWoRuntimeState(ctx, id));
+    return toResponse(result);
+  } catch (err) {
+    const message = err instanceof Error ? err.message : String(err);
+    const isAuth = /JWT|org_id|users row|verification/i.test(message);
+    return NextResponse.json(
+      { ok: false, error: isAuth ? 'forbidden' : 'persistence_failed', message },
+      { status: isAuth ? 403 : 500 },
+    );
+  }
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/start/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/start/route.ts
new file mode 100644
index 00000000..3170c8e1
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/start/route.ts
@@ -0,0 +1,18 @@
+import { z } from 'zod';
+
+import { startWo } from '../../../../../../../../lib/production/start-wo';
+import { runTransition } from '../_actions/route-helpers';
+
+const StartBody = z.object({
+  transactionId: z.string().uuid(),
+  lineId: z.string().min(1).max(64).optional().nullable(),
+  shiftId: z.string().min(1).max(64).optional().nullable(),
+});
+
+export async function POST(
+  request: Request,
+  { params }: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id } = await params;
+  return runTransition(request, StartBody, (ctx, input) => startWo(ctx, { woId: id, ...input }));
+}
diff --git a/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/waste/route.ts b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/waste/route.ts
new file mode 100644
index 00000000..1a78c7c5
--- /dev/null
+++ b/apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/waste/route.ts
@@ -0,0 +1,73 @@
+/**
+ * POST /:locale/.../production/work-orders/:id/waste
+ *
+ * Records a categorized waste row into wo_waste_log and emits
+ * production.waste.recorded (feeds the yield gate, finance loss, reporting).
+ *
+ * withOrgContext (RLS + org scope) → recordWaste service → wo_waste_log INSERT +
+ * outbox event in one transaction. The quality consume gate (holdsGuard) runs
+ * FIRST; an active hold ⇒ 409 + production.consume.blocked.
+ */
+import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
+import {
+  ProductionActionError,
+  QualityHoldError,
+  emitConsumeBlocked,
+  type OrgContextLike,
+  type QueryClient,
+} from '../../../../../../../../lib/production/shared';
+import { recordWaste } from '../../../../../../../../lib/production/waste/record-waste';
+
+function json(body: unknown, status: number): Response {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { 'content-type': 'application/json' },
+  });
+}
+
+export async function POST(
+  req: Request,
+  ctx: { params: Promise<{ id: string }> },
+): Promise<Response> {
+  const { id: woId } = await ctx.params;
+
+  let body: unknown;
+  try {
+    body = await req.json();
+  } catch {
+    return json({ error: 'invalid_input' }, 422);
+  }
+
+  try {
+    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
+      const orgCtx: OrgContextLike = { userId, orgId, client: client as unknown as QueryClient };
+      const result = await recordWaste(orgCtx, woId, body);
+      return json({ data: result }, 200);
+    });
+  } catch (err) {
+    if (err instanceof QualityHoldError) {
+      try {
+        await withOrgContext(async ({ userId, orgId, client }) => {
+          await emitConsumeBlocked(
+            { userId, orgId, client: client as unknown as QueryClient },
+            err,
+          );
+        });
+      } catch (emitErr) {
+        console.error('[production/waste] consume_blocked_emit_failed', {
+          woId,
+          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
+        });
+      }
+      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
+    }
+    if (err instanceof ProductionActionError) {
+      return json({ error: err.code, ...(err.details ?? {}) }, err.status);
+    }
+    console.error('[production/waste] POST persistence_failed', {
+      woId,
+      err: err instanceof Error ? err.message : String(err),
+    });
+    return json({ error: 'persistence_failed' }, 500);
+  }
+}
diff --git a/apps/web/i18n/en.json b/apps/web/i18n/en.json
index 70e8b949..e8166320 100644
--- a/apps/web/i18n/en.json
+++ b/apps/web/i18n/en.json
@@ -3346,5 +3346,93 @@
         "denied": "You do not have permission to view sensory evaluations."
       }
     }
+  },
+  "production": {
+    "dashboard": {
+      "title": "Production",
+      "subtitle": "Live shift view — work orders, output, OEE and downtime.",
+      "breadcrumb": {
+        "production": "Production",
+        "dashboard": "Dashboard"
+      },
+      "error": "Live production data is currently unavailable. Please retry shortly.",
+      "denied": "You do not have permission to view the production dashboard.",
+      "kpi": {
+        "woInProgress": {
+          "label": "WOs in progress",
+          "sub": "Running / active"
+        },
+        "outputToday": {
+          "label": "Output · today",
+          "sub": "Registered output (kg)"
+        },
+        "oee": {
+          "label": "OEE · current",
+          "sub": "Latest snapshot",
+          "none": "No data"
+        },
+        "downtime": {
+          "label": "Open downtime",
+          "sub": "Events not yet ended"
+        }
+      },
+      "woStatus": {
+        "planned": "Planned",
+        "in_progress": "In progress",
+        "paused": "Paused",
+        "completed": "Completed",
+        "closed": "Closed",
+        "cancelled": "Cancelled"
+      },
+      "woList": {
+        "title": "Work orders ({count})",
+        "empty": "No work orders yet — released work orders from Planning appear here.",
+        "allergenBadge": "Allergen",
+        "planningLink": "Open in Planning",
+        "col": {
+          "wo": "WO",
+          "line": "Line",
+          "status": "Status",
+          "planned": "Planned",
+          "progress": "Progress",
+          "output": "Output"
+        }
+      },
+      "nav": {
+        "label": "Production areas",
+        "workOrders": {
+          "title": "Work orders",
+          "desc": "Browse and execute work orders"
+        },
+        "downtime": {
+          "title": "Downtime",
+          "desc": "Record and analyse downtime events"
+        },
+        "waste": {
+          "title": "Waste",
+          "desc": "Log categorised production waste"
+        },
+        "changeover": {
+          "title": "Changeover",
+          "desc": "Allergen changeover gate & sign-off"
+        },
+        "shifts": {
+          "title": "Shifts",
+          "desc": "Crew, handovers and sign-offs"
+        },
+        "analytics": {
+          "title": "Analytics",
+          "desc": "Yield, output and downtime trends"
+        },
+        "oee": {
+          "title": "OEE",
+          "desc": "Availability · Performance · Quality"
+        },
+        "quality": {
+          "title": "Quality",
+          "desc": "Holds, NCRs and consume gate"
+        }
+      }
+    }
   }
 }
diff --git a/apps/web/i18n/pl.json b/apps/web/i18n/pl.json
index 28f1e511..9a257b1f 100644
--- a/apps/web/i18n/pl.json
+++ b/apps/web/i18n/pl.json
@@ -3346,5 +3346,93 @@
         "denied": "Nie masz uprawnień do przeglądania ocen sensorycznych."
       }
     }
+  },
+  "production": {
+    "dashboard": {
+      "title": "Produkcja",
+      "subtitle": "Widok zmiany na żywo — zlecenia, produkcja, OEE i przestoje.",
+      "breadcrumb": {
+        "production": "Produkcja",
+        "dashboard": "Pulpit"
+      },
+      "error": "Dane produkcyjne na żywo są obecnie niedostępne. Spróbuj ponownie za chwilę.",
+      "denied": "Nie masz uprawnień do wyświetlenia pulpitu produkcji.",
+      "kpi": {
+        "woInProgress": {
+          "label": "Zlecenia w toku",
+          "sub": "Uruchomione / aktywne"
+        },
+        "outputToday": {
+          "label": "Produkcja · dziś",
+          "sub": "Zarejestrowana produkcja (kg)"
+        },
+        "oee": {
+          "label": "OEE · bieżące",
+          "sub": "Najnowszy odczyt",
+          "none": "Brak danych"
+        },
+        "downtime": {
+          "label": "Otwarte przestoje",
+          "sub": "Zdarzenia niezakończone"
+        }
+      },
+      "woStatus": {
+        "planned": "Zaplanowane",
+        "in_progress": "W toku",
+        "paused": "Wstrzymane",
+        "completed": "Zakończone",
+        "closed": "Zamknięte",
+        "cancelled": "Anulowane"
+      },
+      "woList": {
+        "title": "Zlecenia produkcyjne ({count})",
+        "empty": "Brak zleceń — zwolnione zlecenia z Planowania pojawią się tutaj.",
+        "allergenBadge": "Alergen",
+        "planningLink": "Otwórz w Planowaniu",
+        "col": {
+          "wo": "Zlecenie",
+          "line": "Linia",
+          "status": "Status",
+          "planned": "Plan",
+          "progress": "Postęp",
+          "output": "Produkcja"
+        }
+      },
+      "nav": {
+        "label": "Obszary produkcji",
+        "workOrders": {
+          "title": "Zlecenia",
+          "desc": "Przeglądaj i realizuj zlecenia"
+        },
+        "downtime": {
+          "title": "Przestoje",
+          "desc": "Rejestruj i analizuj przestoje"
+        },
+        "waste": {
+          "title": "Odpady",
+          "desc": "Rejestruj skategoryzowane odpady"
+        },
+        "changeover": {
+          "title": "Przezbrojenie",
+          "desc": "Bramka alergenowa i podpisy"
+        },
+        "shifts": {
+          "title": "Zmiany",
+          "desc": "Załoga, przekazania i podpisy"
+        },
+        "analytics": {
+          "title": "Analityka",
+          "desc": "Trendy wydajności i przestojów"
+        },
+        "oee": {
+          "title": "OEE",
+          "desc": "Dostępność · Wydajność · Jakość"
+        },
+        "quality": {
+          "title": "Jakość",
+          "desc": "Blokady, NCR i bramka zużycia"
+        }
+      }
+    }
   }
 }
diff --git a/apps/web/i18n/ro.json b/apps/web/i18n/ro.json
index ce863832..b02d466e 100644
--- a/apps/web/i18n/ro.json
+++ b/apps/web/i18n/ro.json
@@ -3346,5 +3346,93 @@
         "denied": "Nu aveți permisiunea de a vizualiza evaluările senzoriale."
       }
     }
+  },
+  "production": {
+    "dashboard": {
+      "title": "Producție",
+      "subtitle": "Vedere live a turei — comenzi, producție, OEE și timpi de oprire.",
+      "breadcrumb": {
+        "production": "Producție",
+        "dashboard": "Tablou de bord"
+      },
+      "error": "Datele de producție live sunt momentan indisponibile. Reîncercați în scurt timp.",
+      "denied": "Nu aveți permisiunea de a vizualiza tabloul de bord al producției.",
+      "kpi": {
+        "woInProgress": {
+          "label": "Comenzi în lucru",
+          "sub": "În execuție / active"
+        },
+        "outputToday": {
+          "label": "Producție · azi",
+          "sub": "Producție înregistrată (kg)"
+        },
+        "oee": {
+          "label": "OEE · curent",
+          "sub": "Ultimul instantaneu",
+          "none": "Fără date"
+        },
+        "downtime": {
+          "label": "Opriri deschise",
+          "sub": "Evenimente neîncheiate"
+        }
+      },
+      "woStatus": {
+        "planned": "Planificat",
+        "in_progress": "În lucru",
+        "paused": "Întrerupt",
+        "completed": "Finalizat",
+        "closed": "Închis",
+        "cancelled": "Anulat"
+      },
+      "woList": {
+        "title": "Comenzi de lucru ({count})",
+        "empty": "Nicio comandă încă — comenzile eliberate din Planificare apar aici.",
+        "allergenBadge": "Alergen",
+        "planningLink": "Deschide în Planificare",
+        "col": {
+          "wo": "Comandă",
+          "line": "Linie",
+          "status": "Stare",
+          "planned": "Planificat",
+          "progress": "Progres",
+          "output": "Producție"
+        }
+      },
+      "nav": {
+        "label": "Zone de producție",
+        "workOrders": {
+          "title": "Comenzi",
+          "desc": "Răsfoiți și executați comenzi"
+        },
+        "downtime": {
+          "title": "Opriri",
+          "desc": "Înregistrați și analizați opririle"
+        },
+        "waste": {
+          "title": "Deșeuri",
+          "desc": "Înregistrați deșeurile pe categorii"
+        },
+        "changeover": {
+          "title": "Schimbare",
+          "desc": "Poarta de alergeni și semnături"
+        },
+        "shifts": {
+          "title": "Ture",
+          "desc": "Echipă, predări și semnături"
+        },
+        "analytics": {
+          "title": "Analiză",
+          "desc": "Tendințe randament și opriri"
+        },
+        "oee": {
+          "title": "OEE",
+          "desc": "Disponibilitate · Performanță · Calitate"
+        },
+        "quality": {
+          "title": "Calitate",
+          "desc": "Rețineri, NCR și poarta de consum"
+        }
+      }
+    }
   }
 }
diff --git a/apps/web/i18n/uk.json b/apps/web/i18n/uk.json
index d4ca4efe..5890e05c 100644
--- a/apps/web/i18n/uk.json
+++ b/apps/web/i18n/uk.json
@@ -3346,5 +3346,93 @@
         "denied": "У вас немає дозволу переглядати сенсорні оцінки."
       }
     }
+  },
+  "production": {
+    "dashboard": {
+      "title": "Виробництво",
+      "subtitle": "Живий огляд зміни — замовлення, випуск, OEE та простої.",
+      "breadcrumb": {
+        "production": "Виробництво",
+        "dashboard": "Панель"
+      },
+      "error": "Живі дані виробництва наразі недоступні. Повторіть спробу незабаром.",
+      "denied": "У вас немає дозволу переглядати панель виробництва.",
+      "kpi": {
+        "woInProgress": {
+          "label": "Замовлення в роботі",
+          "sub": "Виконуються / активні"
+        },
+        "outputToday": {
+          "label": "Випуск · сьогодні",
+          "sub": "Зареєстрований випуск (кг)"
+        },
+        "oee": {
+          "label": "OEE · поточний",
+          "sub": "Останній знімок",
+          "none": "Немає даних"
+        },
+        "downtime": {
+          "label": "Відкриті простої",
+          "sub": "Незавершені події"
+        }
+      },
+      "woStatus": {
+        "planned": "Заплановано",
+        "in_progress": "В роботі",
+        "paused": "Призупинено",
+        "completed": "Завершено",
+        "closed": "Закрито",
+        "cancelled": "Скасовано"
+      },
+      "woList": {
+        "title": "Виробничі замовлення ({count})",
+        "empty": "Замовлень ще немає — випущені замовлення з Планування з’являться тут.",
+        "allergenBadge": "Алерген",
+        "planningLink": "Відкрити в Плануванні",
+        "col": {
+          "wo": "Замовлення",
+          "line": "Лінія",
+          "status": "Статус",
+          "planned": "План",
+          "progress": "Прогрес",
+          "output": "Випуск"
+        }
+      },
+      "nav": {
+        "label": "Зони виробництва",
+        "workOrders": {
+          "title": "Замовлення",
+          "desc": "Перегляд і виконання замовлень"
+        },
+        "downtime": {
+          "title": "Простої",
+          "desc": "Реєстрація та аналіз простоїв"
+        },
+        "waste": {
+          "title": "Відходи",
+          "desc": "Облік категоризованих відходів"
+        },
+        "changeover": {
+          "title": "Переналадка",
+          "desc": "Алергенний шлюз і підписи"
+        },
+        "shifts": {
+          "title": "Зміни",
+          "desc": "Бригада, передачі та підписи"
+        },
+        "analytics": {
+          "title": "Аналітика",
+          "desc": "Тренди виходу та простоїв"
+        },
+        "oee": {
+          "title": "OEE",
+          "desc": "Доступність · Продуктивність · Якість"
+        },
+        "quality": {
+          "title": "Якість",
+          "desc": "Утримання, NCR і шлюз споживання"
+        }
+      }
+    }
   }
 }
diff --git a/apps/web/lib/production/__tests__/output-waste.integration.test.ts b/apps/web/lib/production/__tests__/output-waste.integration.test.ts
new file mode 100644
index 00000000..70323f8a
--- /dev/null
+++ b/apps/web/lib/production/__tests__/output-waste.integration.test.ts
@@ -0,0 +1,396 @@
+/**
+ * 08-Production E3 — REAL DB integration tests for output (T-028 + T-032 catch-weight)
+ * and waste recording. Drives the services through the real app_user RLS
+ * transaction (withAppOrg). Owner SQL is used only for seed/cleanup/assertions.
+ *
+ * Gated on DATABASE_URL (skip when no local Postgres) — same convention as the
+ * NPD integration suites.
+ *
+ * Coverage:
+ *   - output → wo_outputs row + production.output.recorded outbox event
+ *   - batch_number = {wo_number}-OUT-NNN, expiry = today + shelf_life_days (V-PROD-04)
+ *   - sequential batch increment (OUT-001, OUT-002)
+ *   - qty_kg=0 → invalid_input (V-PROD-03), NUMERIC-exact persistence
+ *   - catch-weight: warning false/true + missing-array 422 (T-032)
+ *   - waste → wo_waste_log row + production.waste.recorded outbox event
+ *   - holdsGuard seam: active hold ⇒ quality_hold_active + production.consume.blocked
+ *   - RBAC: caller without production.output.write ⇒ forbidden
+ */
+import { randomUUID } from 'node:crypto';
+import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
+import pg from 'pg';
+
+import {
+  databaseUrl,
+  ensureAppUser,
+  makeAppUserConnectionString,
+  withAppOrg,
+} from '../../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';
+import { registerOutput } from '../output/register-output';
+import { recordWaste } from '../waste/record-waste';
+import {
+  ProductionActionError,
+  QualityHoldError,
+  emitConsumeBlocked,
+  type OrgContextLike,
+  type QueryClient,
+} from '../shared';
+
+const run = databaseUrl ? describe : describe.skip;
+
+const seed = {
+  tenantId: randomUUID(),
+  orgId: randomUUID(),
+  adminRoleId: randomUUID(),
+  noPermRoleId: randomUUID(),
+  adminUserId: randomUUID(),
+  noPermUserId: randomUUID(),
+  productId: randomUUID(),
+  catchProductId: randomUUID(),
+  wasteCategoryId: randomUUID(),
+};
+
+let owner: pg.Pool;
+let app: pg.Pool;
+
+function ctxFor(client: pg.PoolClient, userId: string): OrgContextLike {
+  return { userId, orgId: seed.orgId, client: client as unknown as QueryClient };
+}
+
+async function seedAll(): Promise<void> {
+  await ensureAppUser(owner);
+  await owner.query(
+    `insert into public.tenants (id, name, region_cluster, data_plane_url)
+     values ($1, 'E3 Tenant', 'eu', 'https://e3.example.test') on conflict (id) do nothing`,
+    [seed.tenantId],
+  );
+  await owner.query(
+    `insert into public.organizations (id, tenant_id, slug, name, industry_code)
+     values ($1, $2, $3, 'E3 Org', 'fmcg') on conflict (id) do nothing`,
+    [seed.orgId, seed.tenantId, `e3-${seed.orgId.slice(0, 8)}`],
+  );
+  // admin role with the production output+waste write perms
+  await owner.query(
+    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
+     values ($1, $2, $3, false, $3, 'E3 Admin', '["production.output.write","production.waste.write"]'::jsonb, false, 10)
+     on conflict (id) do nothing`,
+    [seed.adminRoleId, seed.orgId, `e3-admin-${seed.adminRoleId.slice(0, 8)}`],
+  );
+  await owner.query(
+    `insert into public.role_permissions (role_id, permission)
+     values ($1, 'production.output.write'), ($1, 'production.waste.write')
+     on conflict (role_id, permission) do nothing`,
+    [seed.adminRoleId],
+  );
+  // role WITHOUT production perms
+  await owner.query(
+    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
+     values ($1, $2, $3, false, $3, 'E3 NoPerm', '[]'::jsonb, false, 20)
+     on conflict (id) do nothing`,
+    [seed.noPermRoleId, seed.orgId, `e3-noperm-${seed.noPermRoleId.slice(0, 8)}`],
+  );
+  await owner.query(
+    `insert into public.users (id, org_id, email, display_name, name, role_id)
+     values ($1, $2, $3, 'E3 Admin', 'E3 Admin', $4), ($5, $2, $6, 'E3 NoPerm', 'E3 NoPerm', $7)
+     on conflict (id) do nothing`,
+    [
+      seed.adminUserId, seed.orgId, `e3-admin-${seed.adminUserId.slice(0, 8)}@x.test`, seed.adminRoleId,
+      seed.noPermUserId, `e3-noperm-${seed.noPermUserId.slice(0, 8)}@x.test`, seed.noPermRoleId,
+    ],
+  );
+  await owner.query(
+    `insert into public.user_roles (user_id, role_id, org_id)
+     values ($1, $2, $3), ($4, $5, $3) on conflict (user_id, role_id) do nothing`,
+    [seed.adminUserId, seed.adminRoleId, seed.orgId, seed.noPermUserId, seed.noPermRoleId],
+  );
+  // items: a fixed-weight FG (shelf_life 30) and a catch-weight item (nominal 1.0)
+  await owner.query(
+    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days)
+     values ($1, $2, $3, 'fg', 'E3 FG', 'kg', 'fixed', 30) on conflict (id) do nothing`,
+    [seed.productId, seed.orgId, `E3FG-${seed.productId.slice(0, 8)}`],
+  );
+  await owner.query(
+    `insert into public.items (id, org_id, item_code, item_type, name, uom_base, weight_mode, shelf_life_days, nominal_weight, variance_tolerance_pct)
+     values ($1, $2, $3, 'fg', 'E3 Catch FG', 'kg', 'catch', 30, 1.0, 10.00) on conflict (id) do nothing`,
+    [seed.catchProductId, seed.orgId, `E3CATCH-${seed.catchProductId.slice(0, 8)}`],
+  );
+  // waste category
+  await owner.query(
+    `insert into public.waste_categories (id, org_id, code, name) values ($1, $2, 'TRIM', 'Trim waste')
+     on conflict (id) do nothing`,
+    [seed.wasteCategoryId, seed.orgId],
+  );
+}
+
+/** Create a WO + its wo_executions row in the given status. Returns the new ids. */
+async function makeWo(status: string, productId = seed.productId): Promise<{ woId: string; woNumber: string }> {
+  const woId = randomUUID();
+  const woNumber = `WO${Math.floor(Math.random() * 1_000_000_000)}`;
+  await owner.query(
+    `insert into public.work_orders
+       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status)
+     values ($1, $2, $3, $4, 'fg', 100, 'kg', 'RELEASED')`,
+    [woId, seed.orgId, woNumber, productId],
+  );
+  await owner.query(
+    `insert into public.wo_executions (org_id, wo_id, status) values ($1, $2, $3)`,
+    [seed.orgId, woId, status],
+  );
+  return { woId, woNumber };
+}
+
+async function cleanupWoData(): Promise<void> {
+  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
+  await owner.query(`delete from public.wo_outputs where org_id = $1`, [seed.orgId]);
+  await owner.query(`delete from public.wo_waste_log where org_id = $1`, [seed.orgId]);
+  await owner.query(`delete from public.wo_executions where org_id = $1`, [seed.orgId]);
+  await owner.query(`delete from public.work_orders where org_id = $1`, [seed.orgId]);
+}
+
+run('08-Production E3 output + waste (integration)', () => {
+  beforeAll(async () => {
+    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert; service uses withAppOrg app_user pool
+    owner = new pg.Pool({ connectionString: databaseUrl });
+    // eslint-disable-next-line no-restricted-syntax -- direct app_user RLS pool for real org-scoped service execution
+    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
+    await seedAll();
+  }, 120_000);
+
+  afterEach(async () => {
+    await cleanupWoData();
+  });
+
+  afterAll(async () => {
+    await owner.query(`delete from public.items where org_id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.waste_categories where org_id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.role_permissions where role_id in ($1,$2)`, [seed.adminRoleId, seed.noPermRoleId]);
+    await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
+    await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
+    await app.end();
+    await owner.end();
+  });
+
+  it('T-028 AC1: primary output → wo_outputs row + batch OUT-001 + expiry today+30 + outbox', async () => {
+    const { woId, woNumber } = await makeWo('in_progress');
+    const txId = randomUUID();
+    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
+      registerOutput(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: txId,
+        output_type: 'primary',
+        product_id: seed.productId,
+        qty_kg: '100',
+      }),
+    );
+    expect(result.batch_number).toBe(`${woNumber}-OUT-001`);
+    // expiry = today + 30d
+    const expected = new Date();
+    expected.setUTCDate(expected.getUTCDate() + 30);
+    expect(result.expiry_date).toBe(expected.toISOString().slice(0, 10));
+
+    const { rows } = await owner.query<{ qty_kg: string; output_type: string }>(
+      `select qty_kg, output_type from public.wo_outputs where wo_id = $1`,
+      [woId],
+    );
+    expect(rows).toHaveLength(1);
+    expect(rows[0]!.qty_kg).toBe('100.000'); // NUMERIC-exact
+    expect(rows[0]!.output_type).toBe('primary');
+
+    const ob = await owner.query<{ event_type: string }>(
+      `select event_type from public.outbox_events where org_id = $1 and event_type = 'production.output.recorded'`,
+      [seed.orgId],
+    );
+    expect(ob.rows).toHaveLength(1);
+  });
+
+  it('T-028 AC2: two sequential primary outputs → OUT-001 then OUT-002', async () => {
+    const { woId, woNumber } = await makeWo('in_progress');
+    const r1 = await withAppOrg(owner, app, seed.orgId, (client) =>
+      registerOutput(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '50',
+      }),
+    );
+    const r2 = await withAppOrg(owner, app, seed.orgId, (client) =>
+      registerOutput(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '50',
+      }),
+    );
+    expect(r1.batch_number).toBe(`${woNumber}-OUT-001`);
+    expect(r2.batch_number).toBe(`${woNumber}-OUT-002`);
+  });
+
+  it('T-028 AC3: qty_kg=0 → invalid_input (V-PROD-03), no row written', async () => {
+    const { woId } = await makeWo('in_progress');
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        registerOutput(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '0',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'invalid_input' });
+    const { rows } = await owner.query(`select 1 from public.wo_outputs where wo_id = $1`, [woId]);
+    expect(rows).toHaveLength(0);
+  });
+
+  it('RBAC: caller without production.output.write → forbidden', async () => {
+    const { woId } = await makeWo('in_progress');
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        registerOutput(ctxFor(client, seed.noPermUserId), woId, {
+          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '10',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'forbidden' });
+  });
+
+  it('WO not in recordable state (planned) → wo_not_recordable', async () => {
+    const { woId } = await makeWo('planned');
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        registerOutput(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.productId, qty_kg: '10',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'wo_not_recordable' });
+  });
+
+  it('T-032 AC1: catch-weight near reference → warning=false; details persisted', async () => {
+    const { woId } = await makeWo('in_progress', seed.catchProductId);
+    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
+      registerOutput(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId,
+        qty_kg: '3', catch_weight_kg_per_unit: ['1.0', '1.05', '0.95'],
+      }),
+    );
+    expect(result.catch_weight_summary?.avg_kg).toBe('1.000');
+    expect(result.catch_weight_summary?.warning).toBe(false);
+    const { rows } = await owner.query<{ catch_weight_details: { variance_warning: boolean } }>(
+      `select catch_weight_details from public.wo_outputs where wo_id = $1`,
+      [woId],
+    );
+    expect(rows[0]!.catch_weight_details.variance_warning).toBe(false);
+  });
+
+  it('T-032 AC2: catch-weight >10% variance → warning=true, variance_pct=1.0', async () => {
+    const { woId } = await makeWo('in_progress', seed.catchProductId);
+    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
+      registerOutput(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId,
+        qty_kg: '6', catch_weight_kg_per_unit: ['2.0', '2.0', '2.0'],
+      }),
+    );
+    expect(result.catch_weight_summary?.warning).toBe(true);
+    expect(result.catch_weight_summary?.variance_pct).toBe('1.0000');
+  });
+
+  it('T-032 AC3: catch item missing per-unit array → invalid_input listing catch_weight_kg_per_unit', async () => {
+    const { woId } = await makeWo('in_progress', seed.catchProductId);
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        registerOutput(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: randomUUID(), output_type: 'primary', product_id: seed.catchProductId, qty_kg: '3',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'invalid_input', details: { fields: ['catch_weight_kg_per_unit'] } });
+  });
+
+  it('waste → wo_waste_log row + production.waste.recorded outbox event', async () => {
+    const { woId } = await makeWo('in_progress');
+    const result = await withAppOrg(owner, app, seed.orgId, (client) =>
+      recordWaste(ctxFor(client, seed.adminUserId), woId, {
+        transaction_id: randomUUID(), category_code: 'TRIM', qty_kg: '2.5',
+        reason_code: 'SPILL', shift_id: 'A',
+      }),
+    );
+    expect(result.category_code).toBe('TRIM');
+    const { rows } = await owner.query<{ qty_kg: string; category_id: string }>(
+      `select qty_kg, category_id from public.wo_waste_log where wo_id = $1`,
+      [woId],
+    );
+    expect(rows).toHaveLength(1);
+    expect(rows[0]!.qty_kg).toBe('2.500'); // NUMERIC-exact
+    expect(rows[0]!.category_id).toBe(seed.wasteCategoryId);
+    const ob = await owner.query(
+      `select 1 from public.outbox_events where org_id = $1 and event_type = 'production.waste.recorded'`,
+      [seed.orgId],
+    );
+    expect(ob.rows).toHaveLength(1);
+  });
+
+  it('waste qty_kg<=0 → invalid_input (V-PROD-05)', async () => {
+    const { woId } = await makeWo('in_progress');
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        recordWaste(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: randomUUID(), category_code: 'TRIM', qty_kg: '0', shift_id: 'A',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'invalid_input' });
+  });
+
+  it('waste unknown category_code → invalid_reference (V-PROD-05)', async () => {
+    const { woId } = await makeWo('in_progress');
+    await expect(
+      withAppOrg(owner, app, seed.orgId, (client) =>
+        recordWaste(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: randomUUID(), category_code: 'NOPE', qty_kg: '1', shift_id: 'A',
+        }),
+      ),
+    ).rejects.toMatchObject({ code: 'invalid_reference' });
+  });
+
+  it('holdsGuard seam: with v_active_holds present + active hold → quality_hold_active + production.consume.blocked', async () => {
+    // Build a minimal v_active_holds view so the seam engages, then assert the
+    // output path is blocked and emits the blocked event. This proves the gate
+    // wiring without depending on the (unbuilt) 09-quality module.
+    const lpId = randomUUID();
+    // DDL cannot use bind params — inline the literal uuid.
+    // Stub mirrors the SHIPPED v_active_holds (migration 197): polymorphic
+    // (reference_type, reference_id) read model with hold_id + priority — NOT the
+    // legacy lp_id/lot_id shape. The local seam keys lpId → reference_type='lp'.
+    await owner.query(
+      `create or replace view public.v_active_holds as
+         select gen_random_uuid() as hold_id, app.current_org_id() as org_id,
+                'lp'::text as reference_type, '${lpId}'::uuid as reference_id,
+                'high'::text as priority, 'open'::text as hold_status`,
+    );
+    await owner.query(`grant select on public.v_active_holds to app_user`);
+    try {
+      const { woId } = await makeWo('in_progress');
+      const txId = randomUUID();
+      // The mutating txn throws QualityHoldError and rolls back (no output row).
+      let caught: unknown;
+      await withAppOrg(owner, app, seed.orgId, (client) =>
+        registerOutput(ctxFor(client, seed.adminUserId), woId, {
+          transaction_id: txId, output_type: 'primary', product_id: seed.productId,
+          qty_kg: '10', lp_id: lpId,
+        }),
+      ).catch((e) => { caught = e; });
+      expect(caught).toBeInstanceOf(QualityHoldError);
+
+      // No output row was written (rolled back).
+      const out = await owner.query(`select 1 from public.wo_outputs where wo_id = $1`, [woId]);
+      expect(out.rows).toHaveLength(0);
+
+      // Route's catch path emits production.consume.blocked on a committed txn.
+      await withAppOrg(owner, app, seed.orgId, (client) =>
+        emitConsumeBlocked(ctxFor(client, seed.adminUserId), caught as QualityHoldError),
+      );
+      const ob = await owner.query(
+        `select 1 from public.outbox_events where org_id = $1 and event_type = 'production.consume.blocked'`,
+        [seed.orgId],
+      );
+      expect(ob.rows).toHaveLength(1);
+    } finally {
+      await owner.query(`drop view if exists public.v_active_holds`);
+    }
+  });
+
+  it('ProductionActionError carries an HTTP status', () => {
+    const e = new ProductionActionError('forbidden', 403);
+    expect(e.status).toBe(403);
+    expect(e.code).toBe('forbidden');
+  });
+});
diff --git a/apps/web/lib/production/__tests__/wo-lifecycle.integration.test.ts b/apps/web/lib/production/__tests__/wo-lifecycle.integration.test.ts
new file mode 100644
index 00000000..88df54c0
--- /dev/null
+++ b/apps/web/lib/production/__tests__/wo-lifecycle.integration.test.ts
@@ -0,0 +1,435 @@
+/**
+ * 08-Production E1 — REAL DB-backed integration tests for the WO lifecycle.
+ *
+ * Exercises the state machine + transition services through the real
+ * withOrgContext app-role transaction and RLS. Requires DATABASE_URL; skipped in
+ * no-DB CI.
+ *
+ * Coverage (orchestrator GATE list):
+ *   - each transition: start → pause → resume → complete → close (+ cancel)
+ *   - optimistic-lock conflict (two concurrent transitions, exactly one wins)
+ *   - invalid-transition reject (pause a planned WO → 409)
+ *   - wo_outputs materialization at start (schedule_outputs → wo_outputs 1:1)
+ *   - e-sign on close (supervisor PIN, e_sign_log + paired audit_events row)
+ *   - production.* outbox events emitted in-txn
+ */
+
+import { randomUUID } from 'node:crypto';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import pg from 'pg';
+
+import { setPin } from '../../../../../packages/auth/src/verify-pin';
+import { withOrgContext } from '../../auth/with-org-context';
+import { startWo } from '../start-wo';
+import { pauseWo, resumeWo } from '../pause-resume-wo';
+import { completeWo, cancelWo } from '../complete-cancel-wo';
+import { closeWo } from '../close-wo';
+import { applyTransition } from '../wo-state-machine';
+import type { ProductionContext } from '../shared';
+
+const databaseUrl = process.env.DATABASE_URL;
+const run = databaseUrl ? describe : describe.skip;
+
+const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
+const tenantId = randomUUID();
+const orgId = randomUUID();
+const userId = randomUUID();
+const roleId = randomUUID();
+const bomHeaderId = randomUUID();
+const factorySpecId = randomUUID();
+const SUPERVISOR_PIN = '824193';
+
+let owner: pg.Pool;
+
+async function ensureAppUser(): Promise<void> {
+  await owner.query(`
+    do $$
+    begin
+      if not exists (select 1 from pg_roles where rolname = 'app_user') then
+        create role app_user login password '${appUserPassword}';
+      else
+        alter role app_user login password '${appUserPassword}';
+      end if;
+    end
+    $$;
+  `);
+}
+
+async function baseSeed(): Promise<void> {
+  await ensureAppUser();
+  await owner.query(
+    `insert into public.tenants (id, name, region_cluster, data_plane_url)
+     values ($1, 'E1 IT Tenant', 'eu', 'https://e1-it.example.test')
+     on conflict (id) do nothing`,
+    [tenantId],
+  );
+  await owner.query(
+    `insert into public.organizations (id, tenant_id, name, industry_code)
+     values ($1, $2, 'E1 IT Org', 'bakery') on conflict (id) do nothing`,
+    [orgId, tenantId],
+  );
+  // org-admin role: the migration-185 backfill ran at migrate-time BEFORE this org
+  // existed, so seed the production.* grants explicitly on this role.
+  await owner.query(
+    `insert into public.roles (id, org_id, code, slug, name, permissions)
+     values ($1, $2, 'admin', 'admin', 'E1 Admin', '[]'::jsonb) on conflict (id) do nothing`,
+    [roleId, orgId],
+  );
+  await owner.query(`select public.seed_production_permissions_for_org($1)`, [orgId]);
+  await owner.query(
+    `insert into public.users (id, org_id, email, name, role_id)
+     values ($1, $2, 'e1-action@example.test', 'E1 Action User', $3) on conflict (id) do nothing`,
+    [userId, orgId, roleId],
+  );
+  await owner.query(
+    `insert into public.user_roles (org_id, user_id, role_id)
+     values ($1, $2, $3) on conflict do nothing`,
+    [orgId, userId, roleId],
+  );
+  // BOM header + line so the T-025 snapshot service can freeze a recipe at start.
+  await owner.query(
+    `insert into public.bom_headers (id, org_id, product_id, origin_module, status, version)
+     values ($1, $2, $3, 'technical', 'active', 1) on conflict (id) do nothing`,
+    [bomHeaderId, orgId, randomUUID()],
+  );
+  await owner.query(
+    `insert into public.bom_lines (org_id, bom_header_id, line_no, component_code, quantity, uom)
+     values ($1, $2, 1, 'RM-E1-A', 1.000, 'kg')`,
+    [orgId, bomHeaderId],
+  );
+  // Seed the supervisor PIN for the close e-sign (argon2id via setPin).
+  await setPin(userId, SUPERVISOR_PIN);
+}
+
+/** Create a fresh WO (with its schedule_outputs + materials) and return its id. */
+async function seedWorkOrder(opts?: { withSegregation?: boolean }): Promise<{ woId: string; componentId: string }> {
+  const woId = randomUUID();
+  const productId = randomUUID();
+  const componentId = randomUUID();
+  const allergen = opts?.withSegregation ? `'{"segregation_required": true}'::jsonb` : 'null';
+  await owner.query(
+    `insert into public.work_orders
+       (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom,
+        status, active_bom_header_id, active_factory_spec_id, allergen_profile_snapshot)
+     values ($1, $2, $3, $4, 'fg', 100.000, 'kg', 'RELEASED', $5, $6, ${allergen})`,
+    [woId, orgId, `WO-${woId.slice(0, 8)}`, productId, bomHeaderId, factorySpecId],
+  );
+  // One primary + one byproduct schedule_output (planning projection → wo_outputs).
+  await owner.query(
+    `insert into public.schedule_outputs
+       (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct)
+     values ($1, $2, $3, 'primary', 90.000, 'kg', 90.00),
+            ($1, $2, $4, 'byproduct', 10.000, 'kg', 10.00)`,
+    [orgId, woId, productId, randomUUID()],
+  );
+  // One BOM-snapshot consumption component (for completion / progress reads).
+  await owner.query(
+    `insert into public.wo_materials
+       (org_id, wo_id, product_id, material_name, required_qty, consumed_qty, uom)
+     values ($1, $2, $3, 'RM-E1-A', 50.000, 0.000, 'kg')`,
+    [orgId, woId, componentId],
+  );
+  return { woId, componentId };
+}
+
+/** Seed a downtime category for the pause side-effect. */
+async function seedDowntimeCategory(): Promise<string> {
+  const id = randomUUID();
+  await owner.query(
+    `insert into public.downtime_categories (id, org_id, code, name, kind)
+     values ($1, $2, $3, 'Mechanical', 'unplanned')`,
+    [id, orgId, `DT-${id.slice(0, 6)}`],
+  );
+  return id;
+}
+
+async function cleanup(): Promise<void> {
+  for (const t of [
+    'wo_events',
+    'wo_executions',
+    'wo_outputs',
+    'wo_material_consumption',
+    'downtime_events',
+    'downtime_categories',
+    'schedule_outputs',
+    'wo_materials',
+    'work_orders',
+    'outbox_events',
+    'e_sign_log',
+    'audit_events',
+    'bom_snapshots',
+    'bom_lines',
+    'bom_headers',
+  ]) {
+    await owner.query(`delete from public.${t} where org_id = $1`, [orgId]).catch(() => undefined);
+  }
+}
+
+async function outboxTypes(woId: string): Promise<string[]> {
+  const res = await owner.query<{ event_type: string }>(
+    `select event_type from public.outbox_events where org_id = $1 and aggregate_id = $2 order by id`,
+    [orgId, woId],
+  );
+  return res.rows.map((r) => r.event_type);
+}
+
+run('08-production E1 — WO lifecycle (REAL DB integration)', () => {
+  beforeAll(async () => {
+    // eslint-disable-next-line no-restricted-syntax -- owner pool is test setup/assertion only; services use withOrgContext app_user + RLS
+    owner = new pg.Pool({ connectionString: databaseUrl });
+    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
+    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
+    await cleanup().catch(() => undefined);
+    await owner.query(`delete from public.user_pins where user_id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.user_roles where user_id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.users where id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
+    await owner.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
+    await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
+    await baseSeed();
+  }, 120000);
+
+  afterAll(async () => {
+    await cleanup();
+    await owner.query(`delete from public.user_pins where user_id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.user_roles where user_id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.users where id = $1`, [userId]).catch(() => undefined);
+    await owner.query(`delete from public.roles where id = $1`, [roleId]).catch(() => undefined);
+    await owner.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
+    await owner.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
+    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
+    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
+    await owner.end();
+  });
+
+  beforeEach(async () => {
+    // Reset per-test transactional state (keep org/role/user/bom/pin).
+    for (const t of [
+      'wo_events',
+      'wo_executions',
+      'wo_outputs',
+      'wo_material_consumption',
+      'downtime_events',
+      'downtime_categories',
+      'schedule_outputs',
+      'wo_materials',
+      'work_orders',
+      'outbox_events',
+    ]) {
+      await owner.query(`delete from public.${t} where org_id = $1`, [orgId]);
+    }
+  });
+
+  it('start materializes wo_outputs from schedule_outputs and emits production.wo.started', async () => {
+    const { woId } = await seedWorkOrder();
+    const result = await withOrgContext((ctx: ProductionContext) =>
+      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'LINE-1', shiftId: 'A' }),
+    );
+    expect(result.ok).toBe(true);
+    if (!result.ok) throw new Error('start failed');
+    expect(result.data.status).toBe('in_progress');
+    expect(result.data.outputsMaterialized).toBe(2);
+
+    const outputs = await owner.query<{ output_type: string }>(
+      `select output_type from public.wo_outputs where org_id = $1 and wo_id = $2 order by output_type`,
+      [orgId, woId],
+    );
+    // planning 'byproduct' → production 'by_product'; 'primary' stays.
+    expect(outputs.rows.map((r) => r.output_type).sort()).toEqual(['by_product', 'primary']);
+
+    const exec = await owner.query<{ status: string; version: number }>(
+      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
+      [orgId, woId],
+    );
+    expect(exec.rows[0]?.status).toBe('in_progress');
+    expect(Number(exec.rows[0]?.version)).toBe(1);
+
+    expect(await outboxTypes(woId)).toContain('production.wo.started');
+
+    const snap = await owner.query(
+      `select 1 from public.bom_snapshots where org_id = $1 and work_order_id = $2`,
+      [orgId, woId],
+    );
+    expect(snap.rowCount).toBe(1);
+  });
+
+  it('rejects an invalid transition (pause a planned WO → invalid_state_transition)', async () => {
+    const { woId } = await seedWorkOrder();
+    const catId = await seedDowntimeCategory();
+    const result = await withOrgContext((ctx: ProductionContext) =>
+      pauseWo(ctx, { woId, transactionId: randomUUID(), reasonCategoryId: catId, lineId: 'LINE-1' }),
+    );
+    expect(result.ok).toBe(false);
+    if (result.ok) throw new Error('expected failure');
+    expect(result.error).toBe('invalid_state_transition');
+    expect(result.status).toBe(409);
+  });
+
+  it('runs the full happy path start → pause → resume → complete → close with e-sign', async () => {
+    const { woId } = await seedWorkOrder();
+    const catId = await seedDowntimeCategory();
+
+    const started = await withOrgContext((ctx: ProductionContext) =>
+      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'LINE-1' }),
+    );
+    expect(started.ok).toBe(true);
+
+    const paused = await withOrgContext((ctx: ProductionContext) =>
+      pauseWo(ctx, { woId, transactionId: randomUUID(), reasonCategoryId: catId, lineId: 'LINE-1' }),
+    );
+    expect(paused.ok).toBe(true);
+    if (!paused.ok) throw new Error('pause failed');
+    expect(paused.data.status).toBe('paused');
+    // open downtime row exists
+    const open = await owner.query(
+      `select 1 from public.downtime_events where org_id = $1 and wo_id = $2 and source='wo_pause' and ended_at is null`,
+      [orgId, woId],
+    );
+    expect(open.rowCount).toBe(1);
+
+    const resumed = await withOrgContext((ctx: ProductionContext) =>
+      resumeWo(ctx, { woId, transactionId: randomUUID() }),
+    );
+    expect(resumed.ok).toBe(true);
+    if (!resumed.ok) throw new Error('resume failed');
+    expect(resumed.data.status).toBe('in_progress');
+    // downtime row now closed
+    const closedDt = await owner.query(
+      `select 1 from public.downtime_events where org_id = $1 and wo_id = $2 and source='wo_pause' and ended_at is not null`,
+      [orgId, woId],
+    );
+    expect(closedDt.rowCount).toBe(1);
+
+    const completed = await withOrgContext((ctx: ProductionContext) =>
+      completeWo(ctx, { woId, transactionId: randomUUID() }),
+    );
+    expect(completed.ok).toBe(true);
+    if (!completed.ok) throw new Error('complete failed');
+    expect(completed.data.status).toBe('completed');
+
+    const closed = await withOrgContext((ctx: ProductionContext) =>
+      closeWo(ctx, {
+        woId,
+        transactionId: randomUUID(),
+        signerUserId: userId,
+        pin: SUPERVISOR_PIN,
+        reason: 'financial close after shift',
+      }),
+    );
+    expect(closed.ok).toBe(true);
+    if (!closed.ok) throw new Error('close failed');
+    expect(closed.data.status).toBe('closed');
+    expect(closed.data.signatureId).toBeTruthy();
+
+    // e-sign recorded: e_sign_log row + paired security audit_events row.
+    const esign = await owner.query(
+      `select 1 from public.e_sign_log where org_id = $1 and intent = 'production.wo.close'`,
+      [orgId],
+    );
+    expect(esign.rowCount).toBe(1);
+    const audit = await owner.query(
+      `select 1 from public.audit_events where org_id = $1 and action = 'e_sign.recorded' and retention_class = 'security'`,
+      [orgId],
+    );
+    expect(audit.rowCount).toBe(1);
+
+    const types = await outboxTypes(woId);
+    expect(types).toContain('production.wo.started');
+    expect(types).toContain('production.wo.completed');
+    expect(types).toContain('production.wo.closed');
+
+    // closed is terminal — a further verb is rejected.
+    const reclose = await withOrgContext((ctx: ProductionContext) =>
+      cancelWo(ctx, { woId, transactionId: randomUUID(), reasonCode: 'noop' }),
+    );
+    expect(reclose.ok).toBe(false);
+    if (reclose.ok) throw new Error('expected terminal rejection');
+    expect(reclose.error).toBe('invalid_state_transition');
+  });
+
+  it('blocks close with a wrong PIN (esign_failed) and does not transition', async () => {
+    const { woId } = await seedWorkOrder();
+    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
+    await withOrgContext((ctx: ProductionContext) => completeWo(ctx, { woId, transactionId: randomUUID() }));
+
+    const bad = await withOrgContext((ctx: ProductionContext) =>
+      closeWo(ctx, { woId, transactionId: randomUUID(), signerUserId: userId, pin: '000000', reason: 'try' }),
+    );
+    expect(bad.ok).toBe(false);
+    if (bad.ok) throw new Error('expected esign failure');
+    expect(bad.error).toBe('esign_failed');
+
+    const exec = await owner.query<{ status: string }>(
+      `select status from public.wo_executions where org_id = $1 and wo_id = $2`,
+      [orgId, woId],
+    );
+    expect(exec.rows[0]?.status).toBe('completed'); // NOT closed
+  });
+
+  it('start hard-blocks when allergen segregation is required (unbypassable gate)', async () => {
+    const { woId } = await seedWorkOrder({ withSegregation: true });
+    const result = await withOrgContext((ctx: ProductionContext) =>
+      startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }),
+    );
+    expect(result.ok).toBe(false);
+    if (result.ok) throw new Error('expected segregation block');
+    expect(result.error).toBe('allergen_changeover_required');
+  });
+
+  it('start is idempotent under R14 transaction_id replay (single event, single output set)', async () => {
+    const { woId } = await seedWorkOrder();
+    const txn = randomUUID();
+    const a = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
+    const b = await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: txn, lineId: 'L1' }));
+    expect(a.ok && b.ok).toBe(true);
+
+    const events = await owner.query(
+      `select 1 from public.wo_events where org_id = $1 and wo_id = $2 and event_type='start'`,
+      [orgId, woId],
+    );
+    expect(events.rowCount).toBe(1); // exactly one append for the replayed txn
+    const outputs = await owner.query(`select 1 from public.wo_outputs where org_id = $1 and wo_id = $2`, [orgId, woId]);
+    expect(outputs.rowCount).toBe(2); // no double-materialization
+  });
+
+  it('optimistic-lock: two concurrent transitions on the same version — exactly one wins', async () => {
+    const { woId } = await seedWorkOrder();
+    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
+
+    // Two concurrent COMPLETE attempts (distinct txn ids) racing the SAME version.
+    const [r1, r2] = await Promise.all([
+      withOrgContext((ctx: ProductionContext) =>
+        applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
+      ),
+      withOrgContext((ctx: ProductionContext) =>
+        applyTransition(ctx, { woId, verb: 'complete', transactionId: randomUUID() }),
+      ),
+    ]);
+
+    const oks = [r1, r2].filter((r) => r.ok).length;
+    const conflicts = [r1, r2].filter(
+      (r) => !r.ok && (r.error === 'concurrent_modification' || r.error === 'invalid_state_transition'),
+    ).length;
+    expect(oks).toBe(1);
+    expect(conflicts).toBe(1);
+
+    const exec = await owner.query<{ status: string; version: number }>(
+      `select status, version from public.wo_executions where org_id = $1 and wo_id = $2`,
+      [orgId, woId],
+    );
+    expect(exec.rows[0]?.status).toBe('completed');
+    expect(Number(exec.rows[0]?.version)).toBe(2); // start(1) + exactly one complete(2)
+  });
+
+  it('cancel is a terminal branch from a non-closed state and emits production.wo.closed', async () => {
+    const { woId } = await seedWorkOrder();
+    await withOrgContext((ctx: ProductionContext) => startWo(ctx, { woId, transactionId: randomUUID(), lineId: 'L1' }));
+    const result = await withOrgContext((ctx: ProductionContext) =>
+      cancelWo(ctx, { woId, transactionId: randomUUID(), reasonCode: 'planner_cancel' }),
+    );
+    expect(result.ok).toBe(true);
+    if (!result.ok) throw new Error('cancel failed');
+    expect(result.data.status).toBe('cancelled');
+    expect(await outboxTypes(woId)).toContain('production.wo.closed');
+  });
+});
diff --git a/apps/web/lib/production/close-wo.ts b/apps/web/lib/production/close-wo.ts
new file mode 100644
index 00000000..2556b07f
--- /dev/null
+++ b/apps/web/lib/production/close-wo.ts
@@ -0,0 +1,117 @@
+/**
+ * 08-Production E1 — CLOSE service (T-021/T-022): supervisor e-sign + financial close.
+ *
+ * completed → closed. The financial-close transition is a CFR-21 Part 11
+ * attestation surface (MON-domain-production §e-sign "WO close"): a supervisor
+ * e-signs (PIN via foundation T-124 `signEvent`) BEFORE the state mutation. The
+ * signature is recorded in `e_sign_log` + a paired security `audit_events` row;
+ * the transition references the signature id on the wo_events context.
+ *
+ * On close: emit production.wo.closed (10-finance cost-per-kg actual, 12-reporting,
+ * 14-multi-site). D365 financial-close dispatch is async outbox + DLQ only
+ * (never inline) — the outbox event is the seam.
+ *
+ * closed is terminal: the state machine rejects any further verb.
+ */
+
+import type pg from 'pg';
+
+import { signEvent } from '@monopilot/e-sign';
+
+import {
+  EventType,
+  type ProductionContext,
+  type ProductionResult,
+  fail,
+  hasPermission,
+  writeOutbox,
+} from './shared';
+import { applyTransition } from './wo-state-machine';
+
+export type CloseWoInput = {
+  woId: string;
+  transactionId: string;
+  /** Supervisor e-sign (CFR-21 Part 11) — PIN + mandatory reason. */
+  signerUserId: string;
+  pin: string;
+  reason: string;
+  nonce?: string;
+};
+
+export type CloseWoData = {
+  woId: string;
+  status: 'closed';
+  closedAt: string | null;
+  signatureId: string;
+};
+
+export async function closeWo(
+  ctx: ProductionContext,
+  input: CloseWoInput,
+): Promise<ProductionResult<CloseWoData>> {
+  // Supervisor authority: the full production.* set (incl. close) is the
+  // supervisor/admin family in the migration-185 seed. wo.complete is the
+  // closest granular supervisor-tier string present in the enum.
+  if (!(await hasPermission(ctx, 'production.wo.complete'))) return fail('forbidden');
+  if (!input.reason || input.reason.trim().length === 0) {
+    return fail('invalid_input', { message: 'e-sign reason is required (CFR-21 Part 11)' });
+  }
+
+  // (1) Supervisor e-sign BEFORE the state change. signEvent verifies the PIN
+  // server-side, writes e_sign_log + paired security audit_events, guards replay.
+  let signatureId: string;
+  try {
+    const receipt = await signEvent(
+      {
+        signerUserId: input.signerUserId,
+        pin: input.pin,
+        intent: 'production.wo.close',
+        subject: { woId: input.woId, transactionId: input.transactionId },
+        nonce: input.nonce,
+        reason: input.reason,
+      },
+      // ProductionContext.client is the structural QueryClient seam; at runtime
+      // withOrgContext supplies a real pg.PoolClient (signEvent's required type).
+      { client: ctx.client as unknown as pg.PoolClient },
+    );
+    signatureId = receipt.signatureId;
+  } catch (err) {
+    return fail('esign_failed', {
+      message: err instanceof Error ? err.message : String(err),
+    });
+  }
+
+  // (2) Apply the transition (append wo_events + CAS-materialize closed).
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'close',
+    transactionId: input.transactionId,
+    reason: input.reason,
+    context: { signatureId, signerUserId: input.signerUserId },
+  });
+  if (!transition.ok) return transition;
+
+  // (3) Emit production.wo.closed (10-finance / 12-reporting / 14-multi-site).
+  // D365 close-dispatch is async outbox + DLQ only — never inline.
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_WO_CLOSED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: {
+      woId: input.woId,
+      terminal: 'closed',
+      closedAt: transition.data.closedAt,
+      signatureId,
+    },
+  });
+
+  return {
+    ok: true,
+    data: {
+      woId: input.woId,
+      status: 'closed',
+      closedAt: transition.data.closedAt,
+      signatureId,
+    },
+  };
+}
diff --git a/apps/web/lib/production/complete-cancel-wo.ts b/apps/web/lib/production/complete-cancel-wo.ts
new file mode 100644
index 00000000..b4d51c63
--- /dev/null
+++ b/apps/web/lib/production/complete-cancel-wo.ts
@@ -0,0 +1,186 @@
+/**
+ * 08-Production E1 — COMPLETE (T-019) + CANCEL (T-020) services.
+ *
+ * COMPLETE: in_progress → completed. Output yield gate must be GREEN — every
+ *   primary output for the WO must be registered with qty_kg > 0 (the §10.3
+ *   completion precondition). The 09-quality T-064 consume gate (holdsGuard) is
+ *   checked against each registered output's LP/lot before completion is allowed
+ *   to mutate state — an active hold returns 409 quality_hold_active + emits
+ *   production.consume.blocked (PRD §16.4 V-PROD-02/V-PROD-16). On green:
+ *   transition + emit production.wo.completed.
+ *
+ * CANCEL: planned/in_progress/paused/completed → cancelled (terminal branch from
+ *   any non-closed, non-cancelled state). reason_code mandatory (audit). A
+ *   reservation-release side-effect is the documented 05-warehouse seam (no LP
+ *   module yet) — recorded on the event payload.
+ *
+ * Both transition through the state machine (optimistic lock T-022). closed and
+ * cancelled are terminal; the state machine rejects further verbs.
+ */
+
+import { holdsGuard } from './holds-guard';
+import {
+  EventType,
+  type ProductionContext,
+  type ProductionResult,
+  fail,
+  hasPermission,
+  writeOutbox,
+} from './shared';
+import { applyTransition } from './wo-state-machine';
+
+export type CompleteWoInput = {
+  woId: string;
+  transactionId: string;
+  overrideReasonCode?: string | null;
+};
+
+export type CompleteWoData = {
+  woId: string;
+  status: 'completed';
+  completedAt: string | null;
+  outputsRegistered: number;
+};
+
+export async function completeWo(
+  ctx: ProductionContext,
+  input: CompleteWoInput,
+): Promise<ProductionResult<CompleteWoData>> {
+  if (!(await hasPermission(ctx, 'production.wo.complete'))) return fail('forbidden');
+
+  const client = ctx.client;
+
+  // Output yield gate: collect the WO's registered outputs (with their LP/lot).
+  const outputs = await client.query<{
+    id: string;
+    output_type: string;
+    qty_kg: string;
+    lp_id: string | null;
+  }>(
+    `select id, output_type, qty_kg, lp_id
+       from public.wo_outputs
+      where org_id = app.current_org_id() and wo_id = $1::uuid`,
+    [input.woId],
+  );
+
+  // holdsGuard (T-064): every output path checks for an active quality hold on
+  // the output LP/lot BEFORE the completion state mutation. Active hold → 409 +
+  // production.consume.blocked outbox event (never bypass).
+  for (const out of outputs.rows) {
+    const hold = await holdsGuard(ctx, { lpId: out.lp_id });
+    if (hold) {
+      await writeOutbox(ctx, {
+        eventType: EventType.PRODUCTION_CONSUME_BLOCKED,
+        aggregateType: 'work_order',
+        aggregateId: input.woId,
+        payload: { woId: input.woId, lpId: out.lp_id, holdId: hold.holdId },
+      });
+      return fail('quality_hold_active', { details: { holdId: hold.holdId, lpId: out.lp_id } });
+    }
+  }
+
+  // Yield gate GREEN check: at least one primary output registered with qty_kg>0,
+  // unless an override reason code is supplied (production-manager override path).
+  const primaryGreen = outputs.rows.some(
+    (o) => o.output_type === 'primary' && Number(o.qty_kg) > 0,
+  );
+  if (!primaryGreen && !input.overrideReasonCode) {
+    return fail('closed_production_strict_failed', {
+      message: 'output yield gate not green — no primary output registered',
+      details: { code: 'output_yield_gate_failed', outputsRegistered: outputs.rows.length },
+    });
+  }
+
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'complete',
+    transactionId: input.transactionId,
+    context: {
+      overrideReasonCode: input.overrideReasonCode ?? null,
+      outputsRegistered: outputs.rows.length,
+    },
+  });
+  if (!transition.ok) return transition;
+
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_WO_COMPLETED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: {
+      woId: input.woId,
+      completedAt: transition.data.completedAt,
+      outputsRegistered: outputs.rows.length,
+      overrideReasonCode: input.overrideReasonCode ?? null,
+    },
+  });
+
+  return {
+    ok: true,
+    data: {
+      woId: input.woId,
+      status: 'completed',
+      completedAt: transition.data.completedAt,
+      outputsRegistered: outputs.rows.length,
+    },
+  };
+}
+
+export type CancelWoInput = {
+  woId: string;
+  transactionId: string;
+  reasonCode: string;
+  notes?: string | null;
+};
+
+export type CancelWoData = {
+  woId: string;
+  status: 'cancelled';
+  cancelledAt: string | null;
+  reservationsReleased: string[];
+};
+
+export async function cancelWo(
+  ctx: ProductionContext,
+  input: CancelWoInput,
+): Promise<ProductionResult<CancelWoData>> {
+  if (!(await hasPermission(ctx, 'production.wo.start'))) return fail('forbidden');
+  if (!input.reasonCode || input.reasonCode.trim().length === 0) {
+    return fail('invalid_input', { message: 'reasonCode is required' });
+  }
+
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'cancel',
+    transactionId: input.transactionId,
+    reason: input.reasonCode,
+    context: { reasonCode: input.reasonCode, notes: input.notes ?? null },
+  });
+  if (!transition.ok) return transition;
+
+  // 05-warehouse reservation-release seam (no LP module yet) — recorded on the
+  // event payload so the warehouse consumer can release on receipt.
+  const reservationsReleased: string[] = [];
+
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_WO_CLOSED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: {
+      woId: input.woId,
+      terminal: 'cancelled',
+      cancelledAt: transition.data.cancelledAt,
+      reasonCode: input.reasonCode,
+      reservationsReleased,
+    },
+  });
+
+  return {
+    ok: true,
+    data: {
+      woId: input.woId,
+      status: 'cancelled',
+      cancelledAt: transition.data.cancelledAt,
+      reservationsReleased,
+    },
+  };
+}
diff --git a/apps/web/lib/production/get-wo-runtime-state.ts b/apps/web/lib/production/get-wo-runtime-state.ts
new file mode 100644
index 00000000..3da9b2a7
--- /dev/null
+++ b/apps/web/lib/production/get-wo-runtime-state.ts
@@ -0,0 +1,168 @@
+/**
+ * 08-Production E1 — WO detail / runtime-state read (T-016 + T-021).
+ *
+ * Aggregates the materialized execution state + BOM-snapshot consumption progress
+ * + output progress for one WO. Read-only (no outbox / no mutation). RLS-scoped
+ * to app.current_org_id() so cross-tenant WOs are invisible (return not_found).
+ *
+ * consumption_progress_pct = sum(consumed) / sum(required) over wo_materials.
+ * output_progress_pct = sum(wo_outputs.qty_kg) / planned_quantity.
+ */
+
+import {
+  type ProductionContext,
+  type ProductionResult,
+  type WoState,
+  fail,
+  hasPermission,
+} from './shared';
+
+export type WoComponentProgress = {
+  componentId: string;
+  plannedQty: string;
+  consumedQty: string;
+  remainingQty: string;
+};
+
+export type WoOutputProgress = {
+  outputType: string;
+  qtyKg: string;
+  lpId: string | null;
+  batchNumber: string;
+};
+
+export type WoRuntimeState = {
+  woId: string;
+  status: WoState;
+  version: number;
+  startedAt: string | null;
+  completedAt: string | null;
+  elapsedMin: number | null;
+  consumptionProgressPct: number;
+  outputProgressPct: number;
+  components: WoComponentProgress[];
+  outputs: WoOutputProgress[];
+};
+
+export async function getWoRuntimeState(
+  ctx: ProductionContext,
+  woId: string,
+): Promise<ProductionResult<WoRuntimeState>> {
+  if (!(await hasPermission(ctx, 'production.oee.read'))) return fail('forbidden');
+
+  const client = ctx.client;
+
+  const wo = await client.query<{
+    id: string;
+    planned_quantity: string;
+    started_at: string | Date | null;
+    completed_at: string | Date | null;
+  }>(
+    `select id, planned_quantity, started_at, completed_at
+       from public.work_orders
+      where org_id = app.current_org_id() and id = $1::uuid`,
+    [woId],
+  );
+  if (wo.rows.length === 0) return fail('not_found');
+  const woRow = wo.rows[0]!;
+
+  const exec = await client.query<{ status: string; version: number }>(
+    `select status, version
+       from public.wo_executions
+      where org_id = app.current_org_id() and wo_id = $1::uuid`,
+    [woId],
+  );
+  const status = (exec.rows[0]?.status ?? 'planned') as WoState;
+  const version = Number(exec.rows[0]?.version ?? 0);
+
+  const materials = await client.query<{
+    product_id: string;
+    required_qty: string;
+    consumed_qty: string;
+  }>(
+    `select product_id, required_qty, consumed_qty
+       from public.wo_materials
+      where org_id = app.current_org_id() and wo_id = $1::uuid
+      order by sequence asc`,
+    [woId],
+  );
+
+  const outputs = await client.query<{
+    output_type: string;
+    qty_kg: string;
+    lp_id: string | null;
+    batch_number: string;
+  }>(
+    `select output_type, qty_kg, lp_id, batch_number
+       from public.wo_outputs
+      where org_id = app.current_org_id() and wo_id = $1::uuid
+      order by output_type asc`,
+    [woId],
+  );
+
+  // NUMERIC-exact aggregation (string → Number only at the percentage boundary).
+  let sumRequired = 0;
+  let sumConsumed = 0;
+  const components: WoComponentProgress[] = materials.rows.map((m) => {
+    const req = Number(m.required_qty);
+    const con = Number(m.consumed_qty);
+    sumRequired += req;
+    sumConsumed += con;
+    return {
+      componentId: String(m.product_id),
+      plannedQty: String(m.required_qty),
+      consumedQty: String(m.consumed_qty),
+      remainingQty: (req - con).toFixed(3),
+    };
+  });
+
+  let sumOutput = 0;
+  const outputRows: WoOutputProgress[] = outputs.rows.map((o) => {
+    sumOutput += Number(o.qty_kg);
+    return {
+      outputType: o.output_type,
+      qtyKg: String(o.qty_kg),
+      lpId: o.lp_id,
+      batchNumber: o.batch_number,
+    };
+  });
+
+  const consumptionProgressPct =
+    sumRequired > 0 ? round1((sumConsumed / sumRequired) * 100) : 0;
+  const plannedQty = Number(woRow.planned_quantity);
+  const outputProgressPct = plannedQty > 0 ? round1((sumOutput / plannedQty) * 100) : 0;
+
+  const startedAt = toIso(woRow.started_at);
+  const completedAt = toIso(woRow.completed_at);
+  const elapsedMin =
+    startedAt != null
+      ? Math.round(
+          ((completedAt ? Date.parse(completedAt) : Date.now()) - Date.parse(startedAt)) / 60000,
+        )
+      : null;
+
+  return {
+    ok: true,
+    data: {
+      woId,
+      status,
+      version,
+      startedAt,
+      completedAt,
+      elapsedMin,
+      consumptionProgressPct,
+      outputProgressPct,
+      components,
+      outputs: outputRows,
+    },
+  };
+}
+
+function round1(n: number): number {
+  return Math.round(n * 10) / 10;
+}
+
+function toIso(v: string | Date | null): string | null {
+  if (v == null) return null;
+  return v instanceof Date ? v.toISOString() : String(v);
+}
diff --git a/apps/web/lib/production/holds-guard.ts b/apps/web/lib/production/holds-guard.ts
new file mode 100644
index 00000000..2bd2b5b9
--- /dev/null
+++ b/apps/web/lib/production/holds-guard.ts
@@ -0,0 +1,90 @@
+/**
+ * 09-quality T-064 consume-gate seam (holdsGuard).
+ *
+ * CROSS-MODULE CONTRACT (aligned to the SHIPPED 09-quality `v_active_holds`,
+ * migration 197 + packages/server/src/quality/holdsGuard.ts):
+ *   Every consume / output / completion path in 08-production MUST call
+ *   `holdsGuard(ctx, { lpId, lotId })` BEFORE mutating consumption/output state.
+ *   On a match the caller MUST reject with `quality_hold_active` (HTTP 409) AND
+ *   emit `production.consume.blocked` (PRD §16.4 V-PROD-02 / V-PROD-16).
+ *
+ * SCHEMA REALITY (migration 197): `public.v_active_holds` is a POLYMORPHIC read
+ * model — it exposes `(org_id, reference_type, reference_id, hold_id,
+ * hold_number, priority, hold_status, ...)`. It does NOT have `lp_id` / `lot_id`
+ * columns. The canonical gate (packages/server/src/quality/holdsGuard.ts) keys
+ * on `reference_type IN ('wo','lp','batch','po','grn')` + `reference_id`. This
+ * seam therefore maps:
+ *   - lpId  → reference_type = 'lp'
+ *   - lotId → reference_type = 'batch'   (a lot/batch reference)
+ * and reconstructs which physical identifier the matched hold covers.
+ *
+ * FAIL-OPEN only while the view is genuinely ABSENT (09-quality not yet shipped):
+ *   detected via `42P01` (undefined_table). `42703` (undefined_column) is NOT
+ *   swallowed — a column mismatch is a real contract drift that must surface,
+ *   never be silently treated as "no hold".
+ */
+
+import type { ProductionContext, QueryClient } from './shared';
+
+/** An active quality hold blocking a consume/output/completion path. */
+export type ActiveHold = { holdId: string; lpId: string | null; lotId: string | null };
+
+export type HoldsGuardTarget = { lpId?: string | null; lotId?: string | null };
+
+/**
+ * Returns the first active hold matching the LP or lot, or `null` when none is
+ * active (or the `v_active_holds` view does not yet exist — fail-open seam).
+ */
+export async function holdsGuard(
+  ctx: Pick<ProductionContext, 'client'>,
+  target: HoldsGuardTarget,
+): Promise<ActiveHold | null> {
+  const lpId = target.lpId ?? null;
+  const lotId = target.lotId ?? null;
+  // Nothing to check against — no LP and no lot means no consume surface.
+  if (!lpId && !lotId) return null;
+
+  try {
+    // Match the polymorphic (reference_type, reference_id) model of the SHIPPED
+    // v_active_holds view (migration 197). lpId → 'lp', lotId → 'batch'. Order
+    // by priority so the most severe hold is surfaced first (mirrors the
+    // canonical gate's priority ordering).
+    const { rows } = await (ctx.client as QueryClient).query<{
+      hold_id: string;
+      reference_type: string;
+      reference_id: string;
+    }>(
+      `select hold_id, reference_type, reference_id
+         from public.v_active_holds
+        where org_id = app.current_org_id()
+          and (
+            ($1::uuid is not null and reference_type = 'lp' and reference_id = $1::uuid)
+            or ($2::uuid is not null and reference_type = 'batch' and reference_id = $2::uuid)
+          )
+        order by case priority
+                   when 'critical' then 0
+                   when 'high' then 1
+                   when 'medium' then 2
+                   when 'low' then 3
+                   else 4
+                 end
+        limit 1`,
+      [lpId, lotId],
+    );
+    const row = rows[0];
+    if (!row) return null;
+    return {
+      holdId: String(row.hold_id),
+      lpId: row.reference_type === 'lp' ? row.reference_id : null,
+      lotId: row.reference_type === 'batch' ? row.reference_id : null,
+    };
+  } catch (err) {
+    // 42P01 = undefined_table: 09-quality has not shipped v_active_holds yet.
+    // Fail OPEN so a not-yet-built dependency cannot wedge production runtime.
+    // (42703 / undefined_column is deliberately NOT caught — see header.)
+    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01') {
+      return null;
+    }
+    throw err;
+  }
+}
diff --git a/apps/web/lib/production/output/__tests__/catch-weight.test.ts b/apps/web/lib/production/output/__tests__/catch-weight.test.ts
new file mode 100644
index 00000000..5b8db0ec
--- /dev/null
+++ b/apps/web/lib/production/output/__tests__/catch-weight.test.ts
@@ -0,0 +1,54 @@
+/**
+ * T-032 — Catch-weight variance math (pure, no DB). Always runs.
+ *
+ * Asserts NUMERIC-exact fixed-point computation of the catch-weight summary:
+ * avg/total/variance and the ±tolerance SOFT warning (P1 — never a hard block).
+ */
+import { describe, expect, it } from 'vitest';
+
+import { computeCatchWeightSummary } from '../register-output';
+
+describe('computeCatchWeightSummary (T-032)', () => {
+  it('AC1: near-reference array → warning=false, avg=1.0', () => {
+    const s = computeCatchWeightSummary(['1.0', '1.05', '0.95'], '1.0', 0.1);
+    expect(s.avg_kg).toBe('1.000');
+    expect(s.total_kg).toBe('3.000');
+    expect(s.warning).toBe(false);
+    // variance is |1.0 - 1.0| / 1.0 = 0
+    expect(s.variance_pct).toBe('0.0000');
+  });
+
+  it('AC2: avg far above reference (>10%) → warning=true, variance_pct=1.0', () => {
+    const s = computeCatchWeightSummary(['2.0', '2.0', '2.0'], '1.0', 0.1);
+    expect(s.avg_kg).toBe('2.000');
+    expect(s.total_kg).toBe('6.000');
+    // |2 - 1| / 1 = 1.0 = 100%
+    expect(s.variance_pct).toBe('1.0000');
+    expect(s.warning).toBe(true);
+  });
+
+  it('exactly at tolerance boundary is NOT a warning (strictly greater)', () => {
+    // avg = 1.10, reference 1.0, tolerance 0.10 → variance 0.10 == tolerance → no warning
+    const s = computeCatchWeightSummary(['1.10'], '1.0', 0.1);
+    expect(s.variance_pct).toBe('0.1000');
+    expect(s.warning).toBe(false);
+  });
+
+  it('just over tolerance → warning', () => {
+    const s = computeCatchWeightSummary(['1.1001'], '1.0', 0.1);
+    expect(s.warning).toBe(true);
+  });
+
+  it('NUMERIC-exact: 0.1 + 0.2 in micro-units totals exactly 0.300 (no float drift)', () => {
+    const s = computeCatchWeightSummary(['0.1', '0.2'], '0.15', 0.5);
+    expect(s.total_kg).toBe('0.300');
+    expect(s.avg_kg).toBe('0.150');
+  });
+
+  it('variance below reference is absolute (avg under reference still flags)', () => {
+    // avg 0.8, reference 1.0 → variance 0.20 > 0.10 tolerance
+    const s = computeCatchWeightSummary(['0.8'], '1.0', 0.1);
+    expect(s.variance_pct).toBe('0.2000');
+    expect(s.warning).toBe(true);
+  });
+});
diff --git a/apps/web/lib/production/output/register-output.ts b/apps/web/lib/production/output/register-output.ts
new file mode 100644
index 00000000..14daa800
--- /dev/null
+++ b/apps/web/lib/production/output/register-output.ts
@@ -0,0 +1,393 @@
+/**
+ * T-028 — Output recording (primary / co_product / by_product) into the
+ * canonical wo_outputs table (08-production owns this table — NEVER 04-planning).
+ * T-032 — Catch-weight entry: when item.weight_mode='catch', the body carries a
+ * per-unit weight array; we persist catch_weight_details and compute a ±tolerance
+ * variance SOFT warning (P1 — never a hard block per PRD §6 D13).
+ *
+ * Flow (atomic, single txn supplied by the route's withOrgContext):
+ *   1. zod-validate the body (cheap fail before any DB work).
+ *   2. RBAC: caller must hold production.output.write.
+ *   3. Load the WO (RLS-scoped) + soft-load the item for shelf_life / weight_mode.
+ *   4. WO must be in a recordable lifecycle state (read wo_executions.status —
+ *      never write it).
+ *   5. holdsGuard(lpId, lotId) FIRST — active 09-quality hold ⇒ 409 +
+ *      production.consume.blocked outbox event.
+ *   6. Generate batch_number = {wo_number}-OUT-{NNN} (seq = count+1 per WO+type),
+ *      expiry_date = current_date + item.shelf_life_days (V-PROD-04).
+ *   7. Build catch_weight_details when weight_mode='catch' (variance vs
+ *      item.nominal_weight; soft warning > tolerance).
+ *   8. INSERT wo_outputs (V-PROD-24 batch-unique-per-year enforced by the schema).
+ *   9. emit production.output.recorded in the SAME txn.
+ *
+ * NUMERIC-exact: qty / per-unit kg never round-trip through a binary float. The
+ * body sends strings; we validate them as decimal strings and pass them straight
+ * to NUMERIC(12,3) columns. Variance math uses a small fixed-point decimal helper
+ * (no `Number()` on the kg values) so two outputs that sum to the same NUMERIC
+ * are bit-identical.
+ *
+ * DEVIATION (noted for collection): the task prompt references
+ * `item.weight_mode='nominal'` and `item.avg_unit_kg`; the SHIPPED schema
+ * (migration 153) uses weight_mode ∈ {'fixed','catch'} and the per-unit
+ * reference column is `nominal_weight`. We map: non-catch = 'fixed';
+ * avg_unit_kg = items.nominal_weight. prod_settings.catch_weight_tolerance_pct
+ * is not yet a shipped table, so the tolerance defaults to 0.10 and can be
+ * overridden via items.variance_tolerance_pct (a percent) when present.
+ */
+import { z } from 'zod';
+
+import {
+  PRODUCTION_OUTPUT_RECORDED_EVENT,
+  PRODUCTION_OUTPUT_WRITE_PERMISSION,
+  OUTPUT_RECORDABLE_STATES,
+  ProductionActionError,
+  QualityHoldError,
+  emitOutbox,
+  hasPermission,
+  holdsGuard,
+  readWoExecutionStatus,
+  type OrgContextLike,
+} from '../shared';
+
+// ─── Input schema ──────────────────────────────────────────────────────────────
+// qty_kg / catch weights are decimal STRINGS (NUMERIC-exact). We accept a number
+// too for ergonomics but immediately normalize to a canonical decimal string.
+const DecimalString = z
+  .union([z.string(), z.number()])
+  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
+  .refine((s) => /^-?\d+(\.\d+)?$/.test(s), { message: 'must be a decimal number' });
+
+export const RegisterOutputInput = z.object({
+  transaction_id: z.string().uuid(),
+  operator_id: z.string().uuid().optional(),
+  output_type: z.enum(['primary', 'co_product', 'by_product']),
+  product_id: z.string().uuid(),
+  qty_kg: DecimalString,
+  uom: z.string().min(1).max(16).optional(),
+  lp_id: z.string().uuid().optional(),
+  lot_id: z.string().uuid().optional(),
+  batch_number: z.string().min(1).max(64).optional(),
+  // T-032 catch-weight: array of per-unit kg. Required only when weight_mode='catch'
+  // (enforced in the service after the item is loaded, not in the schema).
+  catch_weight_kg_per_unit: z.array(DecimalString).min(1).optional(),
+  // Optional explicit tolerance override (fraction, e.g. 0.10). Defaults below.
+  catch_weight_tolerance_pct: z.number().min(0).max(1).optional(),
+});
+
+export type RegisterOutputInputType = z.infer<typeof RegisterOutputInput>;
+
+export type CatchWeightSummary = {
+  avg_kg: string;
+  total_kg: string;
+  variance_pct: string;
+  warning: boolean;
+};
+
+export type RegisterOutputResult = {
+  output_id: string;
+  lp_id: string | null;
+  batch_number: string;
+  expiry_date: string | null;
+  catch_weight_summary: CatchWeightSummary | null;
+  /** Stubbed until T-033 (PDF label). */
+  label_pdf_url: string | null;
+};
+
+const DEFAULT_CATCH_WEIGHT_TOLERANCE = 0.1; // 10% — PRD §7.3 default
+
+type ItemRow = {
+  id: string;
+  weight_mode: 'fixed' | 'catch';
+  shelf_life_days: number | null;
+  nominal_weight: string | null;
+  variance_tolerance_pct: string | null;
+};
+
+type WoRow = { id: string; wo_number: string };
+
+// ─── Fixed-point decimal helpers (NUMERIC-exact, no binary float on kg) ──────────
+// We keep kg as integer micro-units (1e-6) internally so summation/division for
+// the catch-weight summary is exact to 6 fractional digits, then render back to
+// trimmed decimal strings. wo_outputs.qty_kg is NUMERIC(12,3); the per-unit
+// summary is informational and we publish 3-decimal kg + a 4-decimal variance.
+const SCALE = 1_000_000n;
+
+function toMicro(decimal: string): bigint {
+  const neg = decimal.startsWith('-');
+  const body = neg ? decimal.slice(1) : decimal;
+  const [intPart, fracRaw = ''] = body.split('.');
+  const frac = (fracRaw + '000000').slice(0, 6);
+  const micro = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
+  return neg ? -micro : micro;
+}
+
+function microToDecimal(micro: bigint, dp: number): string {
+  const neg = micro < 0n;
+  const abs = neg ? -micro : micro;
+  const intPart = abs / SCALE;
+  const fracFull = (abs % SCALE).toString().padStart(6, '0');
+  const fracTrim = fracFull.slice(0, dp);
+  const out = dp > 0 ? `${intPart}.${fracTrim}` : `${intPart}`;
+  return neg && abs !== 0n ? `-${out}` : out;
+}
+
+/**
+ * Compute the catch-weight summary from a per-unit kg array. Variance is
+ * |avg - reference| / reference, computed in micro-units. Returns variance_pct
+ * as a fraction string (e.g. '1.0000' = 100%) per the task's AC2 (variance_pct=1.0).
+ */
+export function computeCatchWeightSummary(
+  perUnitKg: readonly string[],
+  referenceKg: string,
+  tolerance: number,
+): CatchWeightSummary {
+  const microUnits = perUnitKg.map(toMicro);
+  const totalMicro = microUnits.reduce((a, b) => a + b, 0n);
+  const count = BigInt(microUnits.length);
+  // avg in micro-units (round to nearest)
+  const avgMicro = (totalMicro + count / 2n) / count;
+
+  const refMicro = toMicro(referenceKg);
+  let variancePctStr = '0.0000';
+  let warning = false;
+  if (refMicro !== 0n) {
+    const diff = avgMicro >= refMicro ? avgMicro - refMicro : refMicro - avgMicro;
+    // variance fraction scaled to 4 dp: (diff / ref) -> *10000
+    const variance4dp = (diff * 10_000n + refMicro / 2n) / refMicro;
+    const intP = variance4dp / 10_000n;
+    const fracP = (variance4dp % 10_000n).toString().padStart(4, '0');
+    variancePctStr = `${intP}.${fracP}`;
+    // warning when fraction > tolerance
+    const toleranceMicroPct = BigInt(Math.round(tolerance * 10_000));
+    warning = variance4dp > toleranceMicroPct;
+  }
+
+  return {
+    avg_kg: microToDecimal(avgMicro, 3),
+    total_kg: microToDecimal(totalMicro, 3),
+    variance_pct: variancePctStr,
+    warning,
+  };
+}
+
+async function loadWo(ctx: OrgContextLike, woId: string): Promise<WoRow> {
+  const { rows } = await ctx.client.query<WoRow>(
+    `select id, wo_number
+       from public.work_orders
+      where id = $1::uuid
+        and org_id = app.current_org_id()
+      limit 1`,
+    [woId],
+  );
+  const wo = rows[0];
+  if (!wo) throw new ProductionActionError('not_found', 404);
+  return wo;
+}
+
+async function loadItem(ctx: OrgContextLike, productId: string): Promise<ItemRow> {
+  const { rows } = await ctx.client.query<ItemRow>(
+    `select id, weight_mode, shelf_life_days, nominal_weight, variance_tolerance_pct
+       from public.items
+      where id = $1::uuid
+        and org_id = app.current_org_id()
+      limit 1`,
+    [productId],
+  );
+  const item = rows[0];
+  // product_id is a soft FK (service-layer validated). A missing item is an
+  // invalid reference, not a 404 on the WO.
+  if (!item) throw new ProductionActionError('invalid_reference', 422, { field: 'product_id' });
+  return item;
+}
+
+async function nextBatchNumber(
+  ctx: OrgContextLike,
+  woId: string,
+  woNumber: string,
+  outputType: string,
+): Promise<string> {
+  const { rows } = await ctx.client.query<{ seq: string }>(
+    `select count(*)::text as seq
+       from public.wo_outputs
+      where wo_id = $1::uuid
+        and org_id = app.current_org_id()
+        and output_type = $2`,
+    [woId, outputType],
+  );
+  const seq = Number(rows[0]?.seq ?? '0') + 1;
+  return `${woNumber}-OUT-${String(seq).padStart(3, '0')}`;
+}
+
+/**
+ * Register a single output row for a WO. The route supplies an OrgContextLike
+ * bound to a withOrgContext transaction; this function never opens its own.
+ */
+export async function registerOutput(
+  ctx: OrgContextLike,
+  woId: string,
+  rawBody: unknown,
+): Promise<RegisterOutputResult> {
+  // 1. validate
+  const parsed = RegisterOutputInput.safeParse(rawBody);
+  if (!parsed.success) {
+    throw new ProductionActionError('invalid_input', 422, {
+      fields: parsed.error.issues.map((i) => i.path.join('.')),
+      message: parsed.error.message,
+    });
+  }
+  const input = parsed.data;
+
+  // V-PROD-03: registered output quantity must be > 0.
+  if (toMicro(input.qty_kg) <= 0n) {
+    throw new ProductionActionError('invalid_input', 422, { fields: ['qty_kg'] });
+  }
+
+  // 2. RBAC
+  if (!(await hasPermission(ctx, PRODUCTION_OUTPUT_WRITE_PERMISSION))) {
+    throw new ProductionActionError('forbidden', 403);
+  }
+
+  // 3. load WO + item
+  const wo = await loadWo(ctx, woId);
+  const item = await loadItem(ctx, input.product_id);
+
+  // 4. WO must be in a recordable lifecycle state (read-only).
+  const status = await readWoExecutionStatus(ctx, woId);
+  if (status === null || !OUTPUT_RECORDABLE_STATES.has(status)) {
+    throw new ProductionActionError('wo_not_recordable', 409, { status });
+  }
+
+  // 5. quality consume gate FIRST (on the consumed/output LP + lot). On an active
+  //    hold we throw QualityHoldError; the route emits production.consume.blocked
+  //    on a committed connection (this txn rolls back — no output row written).
+  const hold = await holdsGuard(ctx, { lpId: input.lp_id, lotId: input.lot_id });
+  if (hold) {
+    throw new QualityHoldError({
+      hold,
+      woId,
+      blockedPath: 'output',
+      transactionId: input.transaction_id,
+      lpId: input.lp_id ?? null,
+      lotId: input.lot_id ?? null,
+    });
+  }
+
+  // 6. batch_number + expiry_date (V-PROD-04).
+  const batchNumber =
+    input.batch_number ?? (await nextBatchNumber(ctx, woId, wo.wo_number, input.output_type));
+
+  // 7. catch-weight (T-032).
+  let catchSummary: CatchWeightSummary | null = null;
+  let catchDetailsJson: string | null = null;
+  if (item.weight_mode === 'catch') {
+    if (!input.catch_weight_kg_per_unit || input.catch_weight_kg_per_unit.length === 0) {
+      throw new ProductionActionError('invalid_input', 422, {
+        fields: ['catch_weight_kg_per_unit'],
+      });
+    }
+    const reference = item.nominal_weight ?? '0';
+    const tolerance =
+      input.catch_weight_tolerance_pct ??
+      (item.variance_tolerance_pct != null
+        ? Number(item.variance_tolerance_pct) / 100
+        : DEFAULT_CATCH_WEIGHT_TOLERANCE);
+    catchSummary = computeCatchWeightSummary(
+      input.catch_weight_kg_per_unit,
+      reference,
+      tolerance,
+    );
+    catchDetailsJson = JSON.stringify({
+      per_unit_kg: input.catch_weight_kg_per_unit,
+      avg_kg: catchSummary.avg_kg,
+      total_kg: catchSummary.total_kg,
+      variance_pct: catchSummary.variance_pct,
+      variance_warning: catchSummary.warning,
+      reference_kg: reference,
+      tolerance,
+    });
+  } else if (input.catch_weight_kg_per_unit && input.catch_weight_kg_per_unit.length > 0) {
+    // Red-line: do not require/accept catch weights for non-catch items silently;
+    // a caller sending them against a 'fixed' item is an input error.
+    throw new ProductionActionError('invalid_input', 422, {
+      fields: ['catch_weight_kg_per_unit'],
+      message: "item.weight_mode is 'fixed' — catch weights not accepted",
+    });
+  }
+
+  // 8. INSERT wo_outputs (V-PROD-24 unique-per-org-per-year enforced by index).
+  let outputId: string;
+  let lpId: string | null;
+  let expiryDate: string | null;
+  try {
+    const { rows } = await ctx.client.query<{ id: string; lp_id: string | null; expiry_date: string | null }>(
+      `insert into public.wo_outputs
+         (org_id, site_id, transaction_id, wo_id, output_type, product_id, lp_id,
+          batch_number, qty_kg, uom, catch_weight_details, registered_by, created_by,
+          expiry_date)
+       values
+         (app.current_org_id(), null, $1::uuid, $2::uuid, $3, $4::uuid, $5::uuid,
+          $6, $7::numeric, $8, $9::jsonb, $10::uuid, $10::uuid,
+          case when $11::int is not null then (current_date + ($11::int || ' days')::interval)::date else null end)
+       returning id, lp_id, to_char(expiry_date, 'YYYY-MM-DD') as expiry_date`,
+      [
+        input.transaction_id,
+        woId,
+        input.output_type,
+        input.product_id,
+        input.lp_id ?? null,
+        batchNumber,
+        input.qty_kg,
+        input.uom ?? 'kg',
+        catchDetailsJson,
+        input.operator_id ?? ctx.userId,
+        item.shelf_life_days,
+      ],
+    );
+    const row = rows[0];
+    if (!row) throw new ProductionActionError('persistence_failed', 500);
+    outputId = row.id;
+    lpId = row.lp_id;
+    expiryDate = row.expiry_date;
+  } catch (err) {
+    if (err instanceof ProductionActionError) throw err;
+    const code = (err as { code?: string }).code;
+    if (code === '23505') {
+      // transaction_id unique (R14 idempotency replay) OR V-PROD-24 batch+year.
+      throw new ProductionActionError('already_recorded', 409);
+    }
+    if (code === '23514' || code === '23503') {
+      throw new ProductionActionError('invalid_reference', 422);
+    }
+    throw err;
+  }
+
+  // 9. outbox (same txn).
+  await emitOutbox(ctx, {
+    eventType: PRODUCTION_OUTPUT_RECORDED_EVENT,
+    aggregateType: 'wo',
+    aggregateId: woId,
+    payload: {
+      org_id: ctx.orgId,
+      output_id: outputId,
+      wo_id: woId,
+      output_type: input.output_type,
+      product_id: input.product_id,
+      lp_id: lpId,
+      batch_number: batchNumber,
+      qty_kg: input.qty_kg,
+      uom: input.uom ?? 'kg',
+      catch_weight_variance_warning: catchSummary?.warning ?? false,
+      actor_user_id: ctx.userId,
+    },
+    dedupKey: `${PRODUCTION_OUTPUT_RECORDED_EVENT}:${input.transaction_id}`,
+  });
+
+  return {
+    output_id: outputId,
+    lp_id: lpId,
+    batch_number: batchNumber,
+    expiry_date: expiryDate,
+    catch_weight_summary: catchSummary,
+    label_pdf_url: null, // T-033
+  };
+}
diff --git a/apps/web/lib/production/pause-resume-wo.ts b/apps/web/lib/production/pause-resume-wo.ts
new file mode 100644
index 00000000..583cbd77
--- /dev/null
+++ b/apps/web/lib/production/pause-resume-wo.ts
@@ -0,0 +1,168 @@
+/**
+ * 08-Production E1 — PAUSE + RESUME services (T-018).
+ *
+ * PAUSE: in_progress → paused, with a side-effect open downtime_events row
+ *   (source='wo_pause', ended_at NULL). The downtime row is atomic with the
+ *   state transition (single txn). category_id is required by the schema
+ *   (migration 183, downtime_events.category_id NOT NULL) so the caller must
+ *   supply a downtime category (V-PROD-22: a wo_pause downtime is categorized).
+ *
+ * RESUME: paused → in_progress, closing the open wo_pause downtime row
+ *   (set ended_at). duration_min is a GENERATED STORED column (V-PROD-06) —
+ *   NEVER written directly; an operator correction sets ended_at =
+ *   started_at + actual_duration_min, never duration_min.
+ *
+ * Both go through the state machine (append wo_events + CAS-materialize status,
+ * optimistic lock T-022). work_orders.status mirrors paused→ON_HOLD,
+ * in_progress→IN_PROGRESS via the state machine.
+ */
+
+import {
+  EventType,
+  type ProductionContext,
+  type ProductionResult,
+  fail,
+  hasPermission,
+  isPgError,
+  writeOutbox,
+} from './shared';
+import { applyTransition } from './wo-state-machine';
+
+export type PauseWoInput = {
+  woId: string;
+  transactionId: string;
+  /** Required: downtime category for the wo_pause event (V-PROD-22). */
+  reasonCategoryId: string;
+  lineId: string;
+  shiftId?: string | null;
+  notes?: string | null;
+};
+
+export type PauseWoData = {
+  woId: string;
+  status: 'paused';
+  pausedAt: string | null;
+  downtimeEventId: string;
+};
+
+export async function pauseWo(
+  ctx: ProductionContext,
+  input: PauseWoInput,
+): Promise<ProductionResult<PauseWoData>> {
+  if (!(await hasPermission(ctx, 'production.wo.pause'))) return fail('forbidden');
+
+  // State transition first (validates in_progress → paused; 409 otherwise).
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'pause',
+    transactionId: input.transactionId,
+    reason: input.notes ?? null,
+    context: { reasonCategoryId: input.reasonCategoryId, lineId: input.lineId },
+  });
+  if (!transition.ok) return transition;
+
+  // Side-effect: open a wo_pause downtime row (atomic with the transition).
+  let downtimeEventId: string;
+  try {
+    const dt = await ctx.client.query<{ id: string }>(
+      `insert into public.downtime_events
+         (org_id, line_id, wo_id, category_id, source, started_at, shift_id, operator_id, reason_notes, recorded_by)
+       values (app.current_org_id(), $1, $2::uuid, $3::uuid, 'wo_pause', pg_catalog.now(),
+               $4, $5::uuid, $6, $5::uuid)
+       returning id`,
+      [input.lineId, input.woId, input.reasonCategoryId, input.shiftId ?? null, ctx.userId, input.notes ?? null],
+    );
+    downtimeEventId = String(dt.rows[0]!.id);
+  } catch (err) {
+    if (isPgError(err) && err.code === '23503') {
+      // FK violation — the category_id does not resolve in this org.
+      return fail('invalid_input', { message: 'reasonCategoryId not found', details: { code: 'invalid_category' } });
+    }
+    return fail('persistence_failed', { message: err instanceof Error ? err.message : String(err) });
+  }
+
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_DOWNTIME_RECORDED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: { woId: input.woId, downtimeEventId, source: 'wo_pause', state: 'opened' },
+  });
+
+  return {
+    ok: true,
+    data: { woId: input.woId, status: 'paused', pausedAt: transition.data.pausedAt, downtimeEventId },
+  };
+}
+
+export type ResumeWoInput = {
+  woId: string;
+  transactionId: string;
+  /** Operator correction: set ended_at = started_at + actual_duration_min. */
+  actualDurationMin?: number | null;
+};
+
+export type ResumeWoData = {
+  woId: string;
+  status: 'in_progress';
+  resumedAt: string | null;
+  downtimeEventId: string | null;
+  durationMin: number | null;
+};
+
+export async function resumeWo(
+  ctx: ProductionContext,
+  input: ResumeWoInput,
+): Promise<ProductionResult<ResumeWoData>> {
+  if (!(await hasPermission(ctx, 'production.wo.resume'))) return fail('forbidden');
+
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'resume',
+    transactionId: input.transactionId,
+    context: { actualDurationMin: input.actualDurationMin ?? null },
+  });
+  if (!transition.ok) return transition;
+
+  // Close the single open wo_pause downtime row. duration_min is GENERATED — we
+  // only set ended_at (V-PROD-06). actual_duration_min override resolves ended_at
+  // to started_at + N minutes; otherwise now().
+  const closed = await ctx.client.query<{ id: string; duration_min: number | null }>(
+    `update public.downtime_events
+        set ended_at = case
+                          when $2::integer is not null
+                            then started_at + make_interval(mins => $2::integer)
+                          else pg_catalog.now()
+                        end
+      where org_id = app.current_org_id()
+        and wo_id = $1::uuid
+        and source = 'wo_pause'
+        and ended_at is null
+      returning id, duration_min`,
+    [input.woId, input.actualDurationMin ?? null],
+  );
+  const row = closed.rows[0] ?? null;
+
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_DOWNTIME_RECORDED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: {
+      woId: input.woId,
+      downtimeEventId: row ? String(row.id) : null,
+      source: 'wo_pause',
+      state: 'closed',
+      durationMin: row?.duration_min ?? null,
+    },
+  });
+
+  return {
+    ok: true,
+    data: {
+      woId: input.woId,
+      status: 'in_progress',
+      resumedAt: transition.data.resumedAt,
+      downtimeEventId: row ? String(row.id) : null,
+      durationMin: row?.duration_min ?? null,
+    },
+  };
+}
diff --git a/apps/web/lib/production/shared.ts b/apps/web/lib/production/shared.ts
new file mode 100644
index 00000000..9a051e99
--- /dev/null
+++ b/apps/web/lib/production/shared.ts
@@ -0,0 +1,341 @@
+/**
+ * 08-Production E1 — Execution-core shared contracts (NOT a `'use server'` module).
+ *
+ * Houses the closed error/result types, the org-action context shape, the RBAC
+ * helper, and the transactional outbox writer that every WO-lifecycle Server
+ * Action and the `wo_state_machine` service reuse. Keeping these here (no
+ * `'use server'` directive) lets us export classes/consts/enums that a
+ * `'use server'` module legally cannot (see MON-t2-api §'use server' export rule).
+ *
+ * Schema source of truth: migrations 181 (wo_outputs / wo_material_consumption),
+ * 182 (wo_executions / wo_events), 183 (downtime_events), 176/177 (work_orders /
+ * schedule_outputs). Canon @189.
+ *
+ * Hard constraints honoured (MON-domain-production "Forbidden patterns"):
+ *   - `wo_executions.status` is NEVER written by a free-form UPDATE — the state
+ *     machine appends a `wo_events` row then CAS-materializes status+version.
+ *   - Every outbox INSERT happens INSIDE the same txn as the state change.
+ *   - org_id (NOT tenant_id); RLS via app.current_org_id().
+ */
+
+import { EventType } from '../../../../packages/outbox/src/events.enum';
+
+/** App-version stamp written to outbox_events.app_version (provenance for replay). */
+export const APP_VERSION = 'production-execution-v1';
+
+/** Minimal pg-client surface (matches the BOM-snapshot service `QueryClient`). */
+export type QueryClient = {
+  query<T = Record<string, unknown>>(
+    sql: string,
+    params?: readonly unknown[],
+  ): Promise<{ rows: T[]; rowCount?: number | null }>;
+};
+
+/**
+ * The org-context handed to every production service. Mirrors the BOM-snapshot
+ * `OrgActionContext` so the snapshot service can be called with the SAME ctx.
+ */
+export type ProductionContext = { userId: string; orgId: string; client: QueryClient };
+
+/** Materialized WO lifecycle states (migration 182 `wo_executions_status_check`). */
+export const WO_STATES = [
+  'planned',
+  'in_progress',
+  'paused',
+  'completed',
+  'closed',
+  'cancelled',
+] as const;
+export type WoState = (typeof WO_STATES)[number];
+
+/** Transition verbs (migration 182 `wo_events_event_type_check`). */
+export const WO_TRANSITIONS = ['start', 'pause', 'resume', 'complete', 'close', 'cancel'] as const;
+export type WoTransition = (typeof WO_TRANSITIONS)[number];
+
+/**
+ * Closed error set surfaced to callers. Never leak DB state. `quality_hold_active`
+ * is the 09-quality T-064 consume-gate block. `concurrent_modification` is the
+ * optimistic-lock CAS miss (T-022). `invalid_state_transition` is the state
+ * machine rejecting an illegal verb for the current materialized state.
+ */
+export type ProductionError =
+  | 'invalid_input'
+  | 'forbidden'
+  | 'not_found'
+  | 'invalid_state_transition'
+  | 'concurrent_modification'
+  | 'quality_hold_active'
+  | 'allergen_changeover_required'
+  | 'closed_production_strict_failed'
+  | 'esign_failed'
+  | 'rate_limited'
+  | 'persistence_failed';
+
+/** Discriminated-union result the UI/route layer consumes. */
+export type ProductionResult<TData> =
+  | { ok: true; data: TData }
+  | { ok: false; error: ProductionError; status: number; message?: string; details?: unknown };
+
+/** Map a ProductionError to its canonical HTTP status (route-handler layer). */
+export const ERROR_STATUS: Record<ProductionError, number> = {
+  invalid_input: 422,
+  forbidden: 403,
+  not_found: 404,
+  invalid_state_transition: 409,
+  concurrent_modification: 409,
+  quality_hold_active: 409,
+  allergen_changeover_required: 409,
+  closed_production_strict_failed: 409,
+  esign_failed: 403,
+  rate_limited: 429,
+  persistence_failed: 500,
+};
+
+export function fail<T>(
+  error: ProductionError,
+  extra?: { message?: string; details?: unknown },
+): ProductionResult<T> {
+  return { ok: false, error, status: ERROR_STATUS[error], message: extra?.message, details: extra?.details };
+}
+
+export function isPgError(err: unknown): err is { code: string; message?: string } {
+  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
+}
+
+/**
+ * RBAC check (org-scoped, under RLS). Mirrors the BOM `hasPermission` helper:
+ * matches the normalized `role_permissions` table OR the legacy `roles.permissions`
+ * jsonb cache, so it is byte-aligned with the migration-185 production seed.
+ */
+export async function hasPermission(ctx: ProductionContext, permission: string): Promise<boolean> {
+  const { rows } = await ctx.client.query<{ ok: boolean }>(
+    `select true as ok
+       from public.user_roles ur
+       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
+       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
+      where ur.user_id = $1::uuid
+        and ur.org_id = $2::uuid
+        and (
+          rp.permission is not null
+          or coalesce(r.permissions, '[]'::jsonb) ? $3
+        )
+      limit 1`,
+    [ctx.userId, ctx.orgId, permission],
+  );
+  return rows.length > 0;
+}
+
+/**
+ * Transactional outbox writer. INSERTs into `public.outbox_events` using the
+ * canonical column set (migration 003). MUST be called inside the same txn as
+ * the state change (the `ctx.client` is the txn-bound app-role client).
+ *
+ * `eventType` must be a member of the EventType enum + the migration CHECK, or
+ * the INSERT violates the constraint and the WHOLE txn rolls back (drift gate).
+ */
+export async function writeOutbox(
+  ctx: ProductionContext,
+  params: { eventType: EventType; aggregateType: string; aggregateId: string; payload: Record<string, unknown> },
+): Promise<void> {
+  await ctx.client.query(
+    `insert into public.outbox_events
+       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
+     values (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5)`,
+    [
+      params.eventType,
+      params.aggregateType,
+      params.aggregateId,
+      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
+      APP_VERSION,
+    ],
+  );
+}
+
+/** Re-export EventType so service modules don't reach across packages directly. */
+export { EventType };
+
+/* ───────────────────────────────────────────────────────────────────────────
+ * 08-Production E3 (output + waste) shared surface.
+ *
+ * Collected from worktree-wf_52ca809a-667-4 and RE-POINTED onto this single
+ * canonical shared module. The E3 services originally ran against their own
+ * fork of shared.ts (OrgContextLike / emitOutbox / ProductionActionError /
+ * QualityHoldError / readWoExecutionStatus / holdsGuard returning {id}). Those
+ * helpers are folded in here so register-output.ts + record-waste.ts compile
+ * against ONE shared.ts. Notable reconciliations:
+ *   - OrgContextLike is a structural alias of ProductionContext (same shape).
+ *   - holdsGuard + ActiveHold are re-exported from ./holds-guard (the canonical
+ *     seam), whose ActiveHold is { holdId, lpId, lotId } — NOT {id}. QualityHold
+ *     error/emitConsumeBlocked below use hold.holdId accordingly.
+ *   - emitOutbox writes the dedup_key column (migration 102) so an idempotent
+ *     replay of the same transaction_id is a no-op at the event layer too. It is
+ *     kept SEPARATE from writeOutbox (the EventType-typed lifecycle writer) so
+ *     the WO-lifecycle core is untouched.
+ * ─────────────────────────────────────────────────────────────────────────── */
+
+// holdsGuard / ActiveHold are owned by ./holds-guard (the cross-module seam the
+// WO-lifecycle core already imports). Re-export them so the E3 services can keep
+// importing from './shared' against the SINGLE canonical implementation.
+export { holdsGuard } from './holds-guard';
+export type { ActiveHold, HoldsGuardTarget } from './holds-guard';
+import type { ActiveHold } from './holds-guard';
+
+/**
+ * Structural alias of ProductionContext used by the E3 (output/waste) services.
+ * Same { userId, orgId, client } shape — kept as a named alias so the collected
+ * code reads against the same single context type.
+ */
+export type OrgContextLike = ProductionContext;
+
+// ─── RBAC permission strings (byte-aligned with migration-185 seed) ────────────
+export const PRODUCTION_OUTPUT_WRITE_PERMISSION = 'production.output.write';
+export const PRODUCTION_WASTE_WRITE_PERMISSION = 'production.waste.write';
+
+// ─── E3 event-type strings (members of EventType + the migration CHECK) ────────
+export const PRODUCTION_OUTPUT_RECORDED_EVENT = EventType.PRODUCTION_OUTPUT_RECORDED;
+export const PRODUCTION_WASTE_RECORDED_EVENT = EventType.PRODUCTION_WASTE_RECORDED;
+export const PRODUCTION_CONSUME_BLOCKED_EVENT = EventType.PRODUCTION_CONSUME_BLOCKED;
+
+// ─── WO runtime-status read seam (read-only; state machine owns writes) ────────
+export type WoExecutionStatus = WoState;
+
+/** States in which a primary/co/by output OR a waste row may be recorded. */
+export const OUTPUT_RECORDABLE_STATES: ReadonlySet<WoExecutionStatus> = new Set<WoExecutionStatus>([
+  'in_progress',
+  'paused',
+  'completed',
+]);
+
+/**
+ * Read the materialized lifecycle status for a WO. Returns null when the WO has
+ * no execution row yet (never started). NEVER writes wo_executions.status —
+ * read-only (the state machine owns writes via wo_events).
+ */
+export async function readWoExecutionStatus(
+  ctx: OrgContextLike,
+  woId: string,
+): Promise<WoExecutionStatus | null> {
+  const { rows } = await ctx.client.query<{ status: WoExecutionStatus }>(
+    `select status
+       from public.wo_executions
+      where wo_id = $1::uuid
+        and org_id = app.current_org_id()
+      limit 1`,
+    [woId],
+  );
+  return rows[0]?.status ?? null;
+}
+
+/**
+ * Transactional outbox writer with dedup_key (migration 102). MUST be called
+ * inside the same txn as the state change. A retried request (same
+ * transaction_id-derived dedup_key) is a no-op at the event layer.
+ */
+export async function emitOutbox(
+  ctx: OrgContextLike,
+  event: {
+    eventType: EventType | string;
+    aggregateType: string;
+    aggregateId: string;
+    payload: Record<string, unknown>;
+    dedupKey: string;
+  },
+): Promise<void> {
+  await ctx.client.query(
+    `insert into public.outbox_events
+       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
+     values
+       (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5, $6)
+     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
+    [
+      event.eventType,
+      event.aggregateType,
+      event.aggregateId,
+      JSON.stringify(event.payload),
+      APP_VERSION,
+      event.dedupKey,
+    ],
+  );
+}
+
+// ─── E3 error types (class-based, mapped to HTTP status) ────────────────────────
+export type ProductionErrorCode =
+  | 'invalid_input'
+  | 'forbidden'
+  | 'not_found'
+  | 'wo_not_recordable'
+  | 'quality_hold_active'
+  | 'already_recorded'
+  | 'invalid_reference'
+  | 'persistence_failed';
+
+export class ProductionActionError extends Error {
+  code: ProductionErrorCode;
+  status: number;
+  details?: Record<string, unknown>;
+
+  constructor(code: ProductionErrorCode, status: number, details?: Record<string, unknown>) {
+    super(code);
+    this.name = 'ProductionActionError';
+    this.code = code;
+    this.status = status;
+    if (details) this.details = details;
+  }
+}
+
+/**
+ * Raised when the 09-quality consume gate (holdsGuard) finds an active hold on
+ * the LP/lot. Carries the context the route needs to emit
+ * `production.consume.blocked` on a COMMITTED connection AFTER the main
+ * (mutating) transaction rolls back. Always maps to HTTP 409.
+ */
+export class QualityHoldError extends ProductionActionError {
+  hold: ActiveHold;
+  woId: string;
+  blockedPath: 'output' | 'waste';
+  transactionId: string;
+  lpId: string | null;
+  lotId: string | null;
+
+  constructor(args: {
+    hold: ActiveHold;
+    woId: string;
+    blockedPath: 'output' | 'waste';
+    transactionId: string;
+    lpId: string | null;
+    lotId: string | null;
+  }) {
+    super('quality_hold_active', 409, { hold_id: args.hold.holdId });
+    this.name = 'QualityHoldError';
+    this.hold = args.hold;
+    this.woId = args.woId;
+    this.blockedPath = args.blockedPath;
+    this.transactionId = args.transactionId;
+    this.lpId = args.lpId;
+    this.lotId = args.lotId;
+  }
+}
+
+/**
+ * Emit `production.consume.blocked` from a route's catch path. Runs against its
+ * own OrgContextLike (a fresh withOrgContext txn) so the audit event commits
+ * even though the originating output/waste transaction was rolled back by the
+ * hold. Idempotent via the transaction_id-keyed dedup_key.
+ */
+export async function emitConsumeBlocked(ctx: OrgContextLike, err: QualityHoldError): Promise<void> {
+  await emitOutbox(ctx, {
+    eventType: PRODUCTION_CONSUME_BLOCKED_EVENT,
+    aggregateType: 'wo',
+    aggregateId: err.woId,
+    payload: {
+      org_id: ctx.orgId,
+      wo_id: err.woId,
+      lp_id: err.lpId,
+      lot_id: err.lotId,
+      hold_id: err.hold.holdId,
+      actor_user_id: ctx.userId,
+      blocked_path: err.blockedPath,
+    },
+    dedupKey: `${PRODUCTION_CONSUME_BLOCKED_EVENT}:${err.transactionId}`,
+  });
+}
diff --git a/apps/web/lib/production/start-wo.ts b/apps/web/lib/production/start-wo.ts
new file mode 100644
index 00000000..12430ac4
--- /dev/null
+++ b/apps/web/lib/production/start-wo.ts
@@ -0,0 +1,249 @@
+/**
+ * 08-Production E1 — START service (T-017).
+ *
+ * READY/planned → in_progress, with the factory-release preflight + the
+ * materialization side-effects that ONLY happen at start:
+ *   1. Factory-release preflight: read active_bom_header_id / active_factory_spec_id
+ *      from the work_orders SNAPSHOT (migration 176). NEVER re-read the current
+ *      BOM/spec (Forbidden pattern: auto-select newer BOM/spec at START).
+ *   2. Freeze the BOM via the T-025 snapshot service (apps/web/lib/technical/bom/
+ *      snapshot.ts) — idempotent per (org, wo, bom_header).
+ *   3. Allergen changeover gate hook: when the WO snapshot demands segregation
+ *      (segregation_required), START is HARD-BLOCKED until a dual-sign completes.
+ *      Full dual-sign is a stub seam (09-quality/E7 wire the ATP+PIN flow); the
+ *      hard-block itself is unbypassable here.
+ *   4. Materialize wo_outputs rows from each schedule_outputs row for the WO
+ *      (output_role → output_type 1:1; planning 'byproduct' → production
+ *      'by_product'). 08-production is the CANONICAL owner of wo_outputs.
+ *   5. Apply the state transition (append wo_events + CAS-materialize status).
+ *   6. Emit production.wo.started in the SAME txn.
+ *
+ * holdsGuard seam: START itself does not consume an LP, but the 09-quality
+ * consume gate is checked against each materialized output's LP (none at start)
+ * — the contract is documented in holds-guard.ts and enforced on consume/output.
+ */
+
+import { createHash } from 'node:crypto';
+
+import { createBomSnapshot } from '../technical/bom/snapshot';
+import { holdsGuard } from './holds-guard';
+import {
+  EventType,
+  type ProductionContext,
+  type ProductionResult,
+  fail,
+  hasPermission,
+  writeOutbox,
+} from './shared';
+import { applyTransition } from './wo-state-machine';
+
+/** planning output_role → production output_type (canonical 1:1, §9.4). */
+const OUTPUT_ROLE_TO_TYPE: Record<string, 'primary' | 'co_product' | 'by_product'> = {
+  primary: 'primary',
+  co_product: 'co_product',
+  byproduct: 'by_product',
+};
+
+export type StartWoInput = {
+  woId: string;
+  transactionId: string;
+  /** Operator/line/shift telemetry captured on the event + execution context. */
+  lineId?: string | null;
+  shiftId?: string | null;
+};
+
+export type StartWoData = {
+  woId: string;
+  status: 'in_progress';
+  startedAt: string | null;
+  bomSnapshotId: string;
+  outputsMaterialized: number;
+  allergenGateRequired: boolean;
+};
+
+type WoSnapshotRow = {
+  id: string;
+  active_bom_header_id: string | null;
+  active_factory_spec_id: string | null;
+  allergen_profile_snapshot: { segregation_required?: boolean } | null;
+};
+
+/**
+ * Start a WO. MUST be invoked inside `withOrgContext(...)` (the caller opens the
+ * txn and passes the app-role client as `ctx.client`).
+ */
+export async function startWo(
+  ctx: ProductionContext,
+  input: StartWoInput,
+): Promise<ProductionResult<StartWoData>> {
+  // RBAC: production.wo.start (migration-185 seed grants this to admin + operator).
+  if (!(await hasPermission(ctx, 'production.wo.start'))) return fail('forbidden');
+
+  const client = ctx.client;
+
+  // (1) Factory-release preflight — read the WO SNAPSHOT, never the live BOM/spec.
+  const woRes = await client.query<WoSnapshotRow>(
+    `select id, active_bom_header_id, active_factory_spec_id, allergen_profile_snapshot
+       from public.work_orders
+      where org_id = app.current_org_id() and id = $1::uuid`,
+    [input.woId],
+  );
+  const wo = woRes.rows[0];
+  if (!wo) return fail('not_found');
+  if (!wo.active_bom_header_id || !wo.active_factory_spec_id) {
+    return fail('invalid_state_transition', {
+      message: 'WO has no factory-release snapshot (active_bom_header_id / active_factory_spec_id)',
+      details: { code: 'factory_release_missing' },
+    });
+  }
+
+  // (3) Allergen changeover gate hook — hard-block when segregation is required.
+  // Full dual-sign (ATP + PIN) is wired by E7 (T-043/T-048); the hard-block is
+  // unbypassable here (no override surface).
+  const segregationRequired = wo.allergen_profile_snapshot?.segregation_required === true;
+  if (segregationRequired) {
+    return fail('allergen_changeover_required', {
+      message: 'allergen changeover segregation required — dual-sign gate must clear before START',
+      details: { code: 'segregation_required' },
+    });
+  }
+
+  // (2) Freeze the BOM (T-025) — idempotent per (org, wo, bom_header).
+  let bomSnapshotId: string;
+  try {
+    const snapshot = await createBomSnapshot(ctx, {
+      woId: input.woId,
+      bomHeaderId: wo.active_bom_header_id,
+    });
+    bomSnapshotId = snapshot.id;
+  } catch (err) {
+    return fail('persistence_failed', {
+      message: err instanceof Error ? err.message : String(err),
+      details: { code: 'bom_snapshot_failed' },
+    });
+  }
+
+  // (4) Materialize wo_outputs from schedule_outputs (canonical owner = 08).
+  const planned = await client.query<{
+    id: string;
+    product_id: string;
+    output_role: string;
+    expected_qty: string;
+    uom: string;
+  }>(
+    `select id, product_id, output_role, expected_qty, uom
+       from public.schedule_outputs
+      where org_id = app.current_org_id() and planned_wo_id = $1::uuid
+      order by output_role asc`,
+    [input.woId],
+  );
+
+  let outputsMaterialized = 0;
+  for (const row of planned.rows) {
+    const outputType = OUTPUT_ROLE_TO_TYPE[row.output_role];
+    if (!outputType) continue;
+
+    // holdsGuard seam: no LP exists yet at materialization, but the gate is the
+    // documented insertion point for the consume/output path (lpId null = pass).
+    const hold = await holdsGuard(ctx, { lpId: null });
+    if (hold) {
+      await writeOutbox(ctx, {
+        eventType: EventType.PRODUCTION_CONSUME_BLOCKED,
+        aggregateType: 'work_order',
+        aggregateId: input.woId,
+        payload: { woId: input.woId, holdId: hold.holdId },
+      });
+      return fail('quality_hold_active', { details: { holdId: hold.holdId } });
+    }
+
+    // Deterministic per-(WO, output_role) transaction_id so a retried START never
+    // double-inserts an output row (UNIQUE(transaction_id) on wo_outputs).
+    const outputTxnId = deriveOutputTxnId(input.transactionId, row.id);
+    const inserted = await client.query<{ id: string }>(
+      `insert into public.wo_outputs
+         (org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, uom,
+          qa_status, registered_by, created_by)
+       values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4::uuid,
+               $5, $6::numeric, $7, 'PENDING', $8::uuid, $8::uuid)
+       on conflict (transaction_id) do nothing
+       returning id`,
+      [
+        outputTxnId,
+        input.woId,
+        outputType,
+        row.product_id,
+        deriveBatchNumber(input.woId, row.output_role),
+        row.expected_qty,
+        row.uom,
+        ctx.userId,
+      ],
+    );
+    if (inserted.rows.length > 0) outputsMaterialized += 1;
+  }
+
+  // (5) Apply the lifecycle transition (append wo_events + CAS-materialize status).
+  const transition = await applyTransition(ctx, {
+    woId: input.woId,
+    verb: 'start',
+    transactionId: input.transactionId,
+    context: {
+      lineId: input.lineId ?? null,
+      shiftId: input.shiftId ?? null,
+      bomSnapshotId,
+      activeBomHeaderId: wo.active_bom_header_id,
+      activeFactorySpecId: wo.active_factory_spec_id,
+    },
+  });
+  if (!transition.ok) return transition;
+
+  // (6) Emit production.wo.started in the SAME txn.
+  await writeOutbox(ctx, {
+    eventType: EventType.PRODUCTION_WO_STARTED,
+    aggregateType: 'work_order',
+    aggregateId: input.woId,
+    payload: {
+      woId: input.woId,
+      bomSnapshotId,
+      activeBomHeaderId: wo.active_bom_header_id,
+      activeFactorySpecId: wo.active_factory_spec_id,
+      outputsMaterialized,
+      startedAt: transition.data.startedAt,
+    },
+  });
+
+  return {
+    ok: true,
+    data: {
+      woId: input.woId,
+      status: 'in_progress',
+      startedAt: transition.data.startedAt,
+      bomSnapshotId,
+      outputsMaterialized,
+      allergenGateRequired: false,
+    },
+  };
+}
+
+/** Stable UUID-v5-ish derivation: per-(start txn, schedule_output) output txn id. */
+function deriveOutputTxnId(startTxnId: string, scheduleOutputId: string): string {
+  // Deterministic: hash the two ids into a UUID so a retried START reuses the
+  // same wo_outputs.transaction_id (idempotent materialization, R14).
+  return uuidFromSeed(`${startTxnId}:${scheduleOutputId}`);
+}
+
+function deriveBatchNumber(woId: string, outputRole: string): string {
+  return `WO-${woId.slice(0, 8)}-${outputRole.toUpperCase()}`;
+}
+
+/** Deterministic name-based UUID (RFC-4122 v5 style, SHA-1) — no external dep. */
+function uuidFromSeed(seed: string): string {
+  const h = createHash('sha1').update(seed).digest('hex');
+  // Force version 5 + RFC variant bits.
+  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(
+    (parseInt(h.slice(16, 18), 16) & 0x3f) |
+    0x80
+  )
+    .toString(16)
+    .padStart(2, '0')}${h.slice(18, 20)}-${h.slice(20, 32)}`;
+  return v;
+}
diff --git a/apps/web/lib/production/waste/record-waste.ts b/apps/web/lib/production/waste/record-waste.ts
new file mode 100644
index 00000000..7375ba79
--- /dev/null
+++ b/apps/web/lib/production/waste/record-waste.ts
@@ -0,0 +1,214 @@
+/**
+ * Waste recording (08-production E3) — write a categorized waste row into
+ * public.wo_waste_log and emit production.waste.recorded. Feeds the yield gate
+ * (output_yield_gate_v1), finance loss accounting, and reporting analytics.
+ *
+ * Flow (atomic, single txn supplied by the route's withOrgContext):
+ *   1. zod-validate the body.
+ *   2. RBAC: caller must hold production.waste.write.
+ *   3. Load the WO (RLS-scoped); WO must be in a recordable lifecycle state.
+ *   4. Resolve category_code → waste_categories.id (02-Settings taxonomy shell,
+ *      migration 183). An unknown/inactive code is an invalid reference (V-PROD-05).
+ *   5. holdsGuard(lpId, lotId) FIRST — active 09-quality hold ⇒ 409 +
+ *      production.consume.blocked outbox event.
+ *   6. INSERT wo_waste_log (qty_kg > 0 enforced by schema; R14 idempotency on
+ *      transaction_id).
+ *   7. emit production.waste.recorded in the SAME txn.
+ *
+ * NUMERIC-exact: qty_kg is a decimal string straight into NUMERIC(12,3); never
+ * coerced through a binary float.
+ */
+import { z } from 'zod';
+
+import {
+  PRODUCTION_WASTE_RECORDED_EVENT,
+  PRODUCTION_WASTE_WRITE_PERMISSION,
+  OUTPUT_RECORDABLE_STATES,
+  ProductionActionError,
+  QualityHoldError,
+  emitOutbox,
+  hasPermission,
+  holdsGuard,
+  readWoExecutionStatus,
+  type OrgContextLike,
+} from '../shared';
+
+const DecimalString = z
+  .union([z.string(), z.number()])
+  .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
+  .refine((s) => /^-?\d+(\.\d+)?$/.test(s), { message: 'must be a decimal number' });
+
+export const RecordWasteInput = z.object({
+  transaction_id: z.string().uuid(),
+  category_code: z.string().min(1).max(64),
+  qty_kg: DecimalString,
+  reason_code: z.string().min(1).max(64).optional(),
+  reason_notes: z.string().max(2000).optional(),
+  operator_id: z.string().uuid().optional(),
+  shift_id: z.string().min(1).max(64),
+  lp_id: z.string().uuid().optional(),
+  lot_id: z.string().uuid().optional(),
+  scan_event_id: z.string().uuid().optional(),
+});
+
+export type RecordWasteInputType = z.infer<typeof RecordWasteInput>;
+
+export type RecordWasteResult = {
+  waste_id: string;
+  category_id: string;
+  category_code: string;
+  qty_kg: string;
+};
+
+const SCALE = 1_000_000n;
+function toMicro(decimal: string): bigint {
+  const neg = decimal.startsWith('-');
+  const body = neg ? decimal.slice(1) : decimal;
+  const [intPart, fracRaw = ''] = body.split('.');
+  const frac = (fracRaw + '000000').slice(0, 6);
+  const micro = BigInt(intPart || '0') * SCALE + BigInt(frac || '0');
+  return neg ? -micro : micro;
+}
+
+type WoRow = { id: string; wo_number: string };
+
+async function loadWo(ctx: OrgContextLike, woId: string): Promise<WoRow> {
+  const { rows } = await ctx.client.query<WoRow>(
+    `select id, wo_number
+       from public.work_orders
+      where id = $1::uuid
+        and org_id = app.current_org_id()
+      limit 1`,
+    [woId],
+  );
+  const wo = rows[0];
+  if (!wo) throw new ProductionActionError('not_found', 404);
+  return wo;
+}
+
+async function resolveCategoryId(ctx: OrgContextLike, categoryCode: string): Promise<string> {
+  const { rows } = await ctx.client.query<{ id: string }>(
+    `select id
+       from public.waste_categories
+      where org_id = app.current_org_id()
+        and code = $1
+        and is_active = true
+      limit 1`,
+    [categoryCode],
+  );
+  const cat = rows[0];
+  if (!cat) throw new ProductionActionError('invalid_reference', 422, { field: 'category_code' });
+  return cat.id;
+}
+
+export async function recordWaste(
+  ctx: OrgContextLike,
+  woId: string,
+  rawBody: unknown,
+): Promise<RecordWasteResult> {
+  // 1. validate
+  const parsed = RecordWasteInput.safeParse(rawBody);
+  if (!parsed.success) {
+    throw new ProductionActionError('invalid_input', 422, {
+      fields: parsed.error.issues.map((i) => i.path.join('.')),
+      message: parsed.error.message,
+    });
+  }
+  const input = parsed.data;
+
+  // V-PROD-05 red-line: waste qty must be strictly positive.
+  if (toMicro(input.qty_kg) <= 0n) {
+    throw new ProductionActionError('invalid_input', 422, { fields: ['qty_kg'] });
+  }
+
+  // 2. RBAC
+  if (!(await hasPermission(ctx, PRODUCTION_WASTE_WRITE_PERMISSION))) {
+    throw new ProductionActionError('forbidden', 403);
+  }
+
+  // 3. load WO + lifecycle gate
+  await loadWo(ctx, woId);
+  const status = await readWoExecutionStatus(ctx, woId);
+  if (status === null || !OUTPUT_RECORDABLE_STATES.has(status)) {
+    throw new ProductionActionError('wo_not_recordable', 409, { status });
+  }
+
+  // 4. category taxonomy resolve (V-PROD-05).
+  const categoryId = await resolveCategoryId(ctx, input.category_code);
+
+  // 5. quality consume gate FIRST. Active hold ⇒ QualityHoldError; the route
+  //    emits production.consume.blocked on a committed connection.
+  const hold = await holdsGuard(ctx, { lpId: input.lp_id, lotId: input.lot_id });
+  if (hold) {
+    throw new QualityHoldError({
+      hold,
+      woId,
+      blockedPath: 'waste',
+      transactionId: input.transaction_id,
+      lpId: input.lp_id ?? null,
+      lotId: input.lot_id ?? null,
+    });
+  }
+
+  // 6. INSERT wo_waste_log.
+  let wasteId: string;
+  try {
+    const { rows } = await ctx.client.query<{ id: string }>(
+      `insert into public.wo_waste_log
+         (org_id, site_id, transaction_id, wo_id, category_id, qty_kg, reason_code,
+          reason_notes, operator_id, shift_id, scan_event_id)
+       values
+         (app.current_org_id(), null, $1::uuid, $2::uuid, $3::uuid, $4::numeric, $5,
+          $6, $7::uuid, $8, $9::uuid)
+       returning id`,
+      [
+        input.transaction_id,
+        woId,
+        categoryId,
+        input.qty_kg,
+        input.reason_code ?? null,
+        input.reason_notes ?? null,
+        input.operator_id ?? ctx.userId,
+        input.shift_id,
+        input.scan_event_id ?? null,
+      ],
+    );
+    const row = rows[0];
+    if (!row) throw new ProductionActionError('persistence_failed', 500);
+    wasteId = row.id;
+  } catch (err) {
+    if (err instanceof ProductionActionError) throw err;
+    const code = (err as { code?: string }).code;
+    if (code === '23505') throw new ProductionActionError('already_recorded', 409);
+    if (code === '23514' || code === '23503') {
+      throw new ProductionActionError('invalid_reference', 422);
+    }
+    throw err;
+  }
+
+  // 7. outbox (same txn) — feeds yield gate + finance loss + reporting.
+  await emitOutbox(ctx, {
+    eventType: PRODUCTION_WASTE_RECORDED_EVENT,
+    aggregateType: 'wo',
+    aggregateId: woId,
+    payload: {
+      org_id: ctx.orgId,
+      waste_id: wasteId,
+      wo_id: woId,
+      category_id: categoryId,
+      category_code: input.category_code,
+      qty_kg: input.qty_kg,
+      reason_code: input.reason_code ?? null,
+      shift_id: input.shift_id,
+      actor_user_id: ctx.userId,
+    },
+    dedupKey: `${PRODUCTION_WASTE_RECORDED_EVENT}:${input.transaction_id}`,
+  });
+
+  return {
+    waste_id: wasteId,
+    category_id: categoryId,
+    category_code: input.category_code,
+    qty_kg: input.qty_kg,
+  };
+}
diff --git a/apps/web/lib/production/wo-state-machine.ts b/apps/web/lib/production/wo-state-machine.ts
new file mode 100644
index 00000000..2612b95d
--- /dev/null
+++ b/apps/web/lib/production/wo-state-machine.ts
@@ -0,0 +1,286 @@
+/**
+ * 08-Production E1 — `wo_state_machine` service (T-016..T-022 core).
+ *
+ * THE LAW (MON-domain-production "Forbidden patterns" #DO-NOT-write-status):
+ *   `wo_executions.status` is NEVER written by a free-form UPDATE in app code.
+ *   A transition is applied by:
+ *     1. validating the verb is legal for the WO's current materialized state,
+ *     2. APPENDING a `wo_events` row (the immutable lifecycle ledger, R14
+ *        idempotent on `transaction_id`),
+ *     3. CAS-materializing `wo_executions` (status + monotonic `version`) using
+ *        optimistic locking (T-022) — the UPDATE only fires WHERE the observed
+ *        `version` still matches, so two concurrent transitions cannot both win,
+ *     4. mirroring the canonical state onto `work_orders.status` so planning /
+ *        downstream read-models stay consistent (same txn).
+ *
+ * Lifecycle (migration 182):
+ *   planned → in_progress (start) → paused (pause) → in_progress (resume)
+ *           → completed (complete) → closed (close).
+ *   cancel is a terminal branch from any NON-closed, NON-cancelled state.
+ *   closed and cancelled are terminal.
+ *
+ * Idempotency (R14): a retried request carries the same `transaction_id`. The
+ * UNIQUE constraint on `wo_events.transaction_id` makes the append idempotent —
+ * a replay short-circuits and returns the already-materialized state WITHOUT a
+ * second event or a second version bump.
+ *
+ * work_orders.status uses the planning vocabulary (DRAFT/RELEASED/IN_PROGRESS/
+ * ON_HOLD/COMPLETED/CLOSED/CANCELLED, migration 176); wo_executions.status uses
+ * the runtime vocabulary (planned/in_progress/paused/completed/closed/cancelled,
+ * migration 182). WO_TO_WORK_ORDER_STATUS bridges them.
+ */
+
+import {
+  type ProductionContext,
+  type ProductionResult,
+  type QueryClient,
+  type WoState,
+  type WoTransition,
+  fail,
+  isPgError,
+} from './shared';
+
+// ── Legal transition table ────────────────────────────────────────────────────
+// from-state → { verb → to-state }. Any (state, verb) pair absent here is illegal.
+const TRANSITIONS: Record<WoState, Partial<Record<WoTransition, WoState>>> = {
+  planned: { start: 'in_progress', cancel: 'cancelled' },
+  in_progress: { pause: 'paused', complete: 'completed', cancel: 'cancelled' },
+  paused: { resume: 'in_progress', cancel: 'cancelled' },
+  completed: { close: 'closed', cancel: 'cancelled' },
+  closed: {}, // terminal
+  cancelled: {}, // terminal
+};
+
+/** Runtime state → planning `work_orders.status` (migration 176 vocabulary). */
+const WO_TO_WORK_ORDER_STATUS: Record<WoState, string> = {
+  planned: 'RELEASED',
+  in_progress: 'IN_PROGRESS',
+  paused: 'ON_HOLD',
+  completed: 'COMPLETED',
+  closed: 'CLOSED',
+  cancelled: 'CANCELLED',
+};
+
+/** Resolve the legal to-state for (from, verb), or null when illegal. */
+export function resolveTransition(from: WoState, verb: WoTransition): WoState | null {
+  return TRANSITIONS[from]?.[verb] ?? null;
+}
+
+export type WoExecutionRow = {
+  id: string;
+  woId: string;
+  status: WoState;
+  version: number;
+  startedAt: string | null;
+  pausedAt: string | null;
+  resumedAt: string | null;
+  completedAt: string | null;
+  closedAt: string | null;
+  cancelledAt: string | null;
+};
+
+type ExecRowRaw = {
+  id: string;
+  wo_id: string;
+  status: string;
+  version: number;
+  started_at: string | Date | null;
+  paused_at: string | Date | null;
+  resumed_at: string | Date | null;
+  completed_at: string | Date | null;
+  closed_at: string | Date | null;
+  cancelled_at: string | Date | null;
+};
+
+function toIso(v: string | Date | null): string | null {
+  if (v == null) return null;
+  return v instanceof Date ? v.toISOString() : String(v);
+}
+
+function mapExec(row: ExecRowRaw): WoExecutionRow {
+  return {
+    id: String(row.id),
+    woId: String(row.wo_id),
+    status: row.status as WoState,
+    version: Number(row.version),
+    startedAt: toIso(row.started_at),
+    pausedAt: toIso(row.paused_at),
+    resumedAt: toIso(row.resumed_at),
+    completedAt: toIso(row.completed_at),
+    closedAt: toIso(row.closed_at),
+    cancelledAt: toIso(row.cancelled_at),
+  };
+}
+
+const EXEC_COLS = `id, wo_id, status, version, started_at, paused_at, resumed_at,
+  completed_at, closed_at, cancelled_at`;
+
+/**
+ * Load the WO's execution row, creating the `planned` materialization lazily if
+ * it does not yet exist (idempotent per the UNIQUE(org_id, wo_id) constraint).
+ * Returns null when the work_orders row itself is absent (RLS-scoped).
+ */
+export async function loadOrInitExecution(
+  ctx: ProductionContext,
+  woId: string,
+): Promise<WoExecutionRow | null> {
+  const client = ctx.client;
+
+  // Confirm the WO exists for this org (RLS-scoped); 404 otherwise.
+  const wo = await client.query<{ id: string }>(
+    `select id from public.work_orders where org_id = app.current_org_id() and id = $1::uuid`,
+    [woId],
+  );
+  if (wo.rows.length === 0) return null;
+
+  const existing = await client.query<ExecRowRaw>(
+    `select ${EXEC_COLS}
+       from public.wo_executions
+      where org_id = app.current_org_id() and wo_id = $1::uuid`,
+    [woId],
+  );
+  if (existing.rows[0]) return mapExec(existing.rows[0]);
+
+  // Lazily materialize the initial `planned` row. ON CONFLICT keeps it idempotent
+  // under a concurrent first-touch (UNIQUE(org_id, wo_id)).
+  const inserted = await client.query<ExecRowRaw>(
+    `insert into public.wo_executions (org_id, wo_id, status, version, created_by)
+     values (app.current_org_id(), $1::uuid, 'planned', 0, $2::uuid)
+     on conflict (org_id, wo_id) do update set updated_at = pg_catalog.now()
+     returning ${EXEC_COLS}`,
+    [woId, ctx.userId],
+  );
+  return mapExec(inserted.rows[0]!);
+}
+
+/** Timestamp column on wo_executions stamped for a given verb. */
+const VERB_TIMESTAMP: Record<WoTransition, string> = {
+  start: 'started_at',
+  pause: 'paused_at',
+  resume: 'resumed_at',
+  complete: 'completed_at',
+  close: 'closed_at',
+  cancel: 'cancelled_at',
+};
+
+export type ApplyTransitionInput = {
+  woId: string;
+  verb: WoTransition;
+  transactionId: string;
+  reason?: string | null;
+  context?: Record<string, unknown>;
+};
+
+/**
+ * Apply one lifecycle transition: validate → append wo_events → CAS-materialize
+ * wo_executions (optimistic lock) → mirror work_orders.status. ALL inside the
+ * caller's txn (ctx.client). Returns the new materialized execution row.
+ *
+ * Errors (closed set):
+ *   not_found                — WO row absent for this org.
+ *   invalid_state_transition — verb illegal for the current materialized state.
+ *   concurrent_modification  — optimistic-lock CAS miss (another txn won).
+ *   persistence_failed       — unexpected DB error.
+ *
+ * R14 idempotency: a replay with the same transactionId returns the existing
+ * materialized state WITHOUT a second event or version bump.
+ */
+export async function applyTransition(
+  ctx: ProductionContext,
+  input: ApplyTransitionInput,
+): Promise<ProductionResult<WoExecutionRow>> {
+  const client = ctx.client;
+
+  // R14 idempotency short-circuit: a wo_events row already exists for this txn id.
+  const replay = await client.query<{ wo_id: string }>(
+    `select wo_id from public.wo_events
+      where org_id = app.current_org_id() and transaction_id = $1::uuid`,
+    [input.transactionId],
+  );
+  if (replay.rows[0]) {
+    const cur = await loadOrInitExecution(ctx, input.woId);
+    if (!cur) return fail('not_found');
+    return { ok: true, data: cur };
+  }
+
+  const exec = await loadOrInitExecution(ctx, input.woId);
+  if (!exec) return fail('not_found');
+
+  const toStatus = resolveTransition(exec.status, input.verb);
+  if (!toStatus) {
+    return fail('invalid_state_transition', {
+      message: `cannot ${input.verb} a WO in state '${exec.status}'`,
+      details: { from: exec.status, verb: input.verb },
+    });
+  }
+
+  const tsCol = VERB_TIMESTAMP[input.verb];
+  const observedVersion = exec.version;
+
+  try {
+    // (2) APPEND the immutable lifecycle event (append-only ledger).
+    await client.query(
+      `insert into public.wo_events
+         (org_id, wo_id, execution_id, transaction_id, event_type, from_status, to_status,
+          version_at_event, reason, context_jsonb, actor_user_id)
+       values (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb, $10::uuid)`,
+      [
+        input.woId,
+        exec.id,
+        input.transactionId,
+        input.verb,
+        exec.status,
+        toStatus,
+        observedVersion,
+        input.reason ?? null,
+        JSON.stringify(input.context ?? {}),
+        ctx.userId,
+      ],
+    );
+
+    // (3) CAS-materialize wo_executions: optimistic lock on `version`. The UPDATE
+    // only fires while the version is unchanged — a concurrent transition that
+    // already bumped it makes this affect 0 rows → concurrent_modification.
+    const updated = await client.query<ExecRowRaw>(
+      `update public.wo_executions
+          set status = $3,
+              version = version + 1,
+              ${tsCol} = pg_catalog.now(),
+              updated_by = $4::uuid
+        where org_id = app.current_org_id()
+          and wo_id = $1::uuid
+          and version = $2
+        returning ${EXEC_COLS}`,
+      [input.woId, observedVersion, toStatus, ctx.userId],
+    );
+    if (updated.rows.length === 0) {
+      // CAS miss: another concurrent transition materialized first. Surface 409
+      // so the txn rolls back (the appended event rolls back with it).
+      return fail('concurrent_modification', {
+        details: { expectedVersion: observedVersion },
+      });
+    }
+
+    // (4) Mirror canonical state onto work_orders for planning/read-model parity.
+    await client.query(
+      `update public.work_orders
+          set status = $2, updated_by = $3::uuid
+        where org_id = app.current_org_id() and id = $1::uuid`,
+      [input.woId, WO_TO_WORK_ORDER_STATUS[toStatus], ctx.userId],
+    );
+
+    return { ok: true, data: mapExec(updated.rows[0]!) };
+  } catch (err) {
+    // A concurrent replay racing the same transaction_id hits the UNIQUE
+    // constraint (23505) — treat as a successful idempotent replay.
+    if (isPgError(err) && err.code === '23505') {
+      const cur = await loadOrInitExecution(ctx, input.woId);
+      if (cur) return { ok: true, data: cur };
+    }
+    return fail('persistence_failed', {
+      message: err instanceof Error ? err.message : String(err),
+    });
+  }
+}
+
+export type { QueryClient };
</stdin>
codex
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---:|---|---|
| BLOCK | `apps/web/lib/production/shared.ts:184` | New production permission strings are introduced/used (`production.output.write`, `production.waste.write`, plus WO transition perms elsewhere), but this diff contains no migration seeding them into `role_permissions` and legacy `roles.permissions` jsonb, no org-insert trigger, and no existing-org backfill. This is the live 403 red-line. | Add an idempotent migration granting every checked `production.*` permission byte-for-byte to org-admin/admin/owner/operator/supervisor families in both stores, plus org-create trigger and existing-org backfill. |
| BLOCK | `apps/web/lib/production/wo-state-machine.ts:254` | The lifecycle transition appends `wo_events` before the CAS update, but on a CAS miss it returns `concurrent_modification` instead of throwing. If `withOrgContext` commits on normal return, the losing transaction can still commit the appended event without materializing the state, breaking the immutable ledger and outbox/state consistency. | On CAS miss, throw a typed rollback error or move the event insert after the successful CAS. Ensure losing transitions rollback all writes. |
| BLOCK | `apps/web/lib/production/close-wo.ts:60` | CFR-21 close e-sign is written before the WO state transition. If `applyTransition` later rejects or returns a failure, the signature/audit rows remain committed with no corresponding close transition. | Perform transition validation first or wrap e-sign plus transition in a rollback-on-failure path. If e-sign must precede mutation, make any post-sign transition failure throw so the transaction rolls back. |
| HIGH | `apps/web/lib/production/output/register-output.ts:50` | `qty_kg` and catch weights accept JavaScript `number` and normalize with `String(v)`. That allows binary-float drift or exponential notation rejection after client-side float coercion on regulated quantity input. | Accept only decimal strings for kg/qty inputs; reject numbers at schema boundary. |
| HIGH | `apps/web/lib/production/get-wo-runtime-state.ts:100` | Quantity aggregation converts NUMERIC strings to `Number` for required/consumed/output totals. This violates the NUMERIC-exact red-line for qty/kg and can drift percentage calculations. | Use the same fixed-point decimal helper used for catch weight, or a decimal library, and only format final display values from exact decimals. |
| HIGH | `apps/web/lib/production/complete-cancel-wo.ts:74` | Yield gate checks primary output with `Number(o.qty_kg) > 0`, again coercing NUMERIC qty through float. | Compare NUMERIC exactly in SQL (`exists ... qty_kg > 0`) or use fixed-point decimal parsing. |
| HIGH | `apps/web/lib/production/start-wo.ts:142` | `wo_outputs` insert omits `site_id` while canonical day-1 requirement says operational tables must carry nullable `site_id`. If the table column exists and is required by the migration contract, this write path leaves it unspecified. | Include `site_id` explicitly as `null` until site attribution is wired, matching other writes in this diff. |
| HIGH | `apps/web/lib/production/complete-cancel-wo.ts:68` | `production.consume.blocked` is emitted inside the same transaction immediately before returning `fail(...)`. That means the hold-block audit event can commit even though no state change occurred, and route-level catch handling only emits for `QualityHoldError`, not this `fail` result. | Use the same `QualityHoldError` pattern as output/waste and emit the blocked event from a fresh committed transaction, or explicitly document and test same-transaction commit semantics for blocked audits. |

VERDICT: FAIL — blocking items: missing RBAC seed/backfill for new production permission family; lifecycle CAS miss can commit orphan `wo_events`; close e-sign can commit without a close transition.
tokens used
80,461
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---:|---|---|
| BLOCK | `apps/web/lib/production/shared.ts:184` | New production permission strings are introduced/used (`production.output.write`, `production.waste.write`, plus WO transition perms elsewhere), but this diff contains no migration seeding them into `role_permissions` and legacy `roles.permissions` jsonb, no org-insert trigger, and no existing-org backfill. This is the live 403 red-line. | Add an idempotent migration granting every checked `production.*` permission byte-for-byte to org-admin/admin/owner/operator/supervisor families in both stores, plus org-create trigger and existing-org backfill. |
| BLOCK | `apps/web/lib/production/wo-state-machine.ts:254` | The lifecycle transition appends `wo_events` before the CAS update, but on a CAS miss it returns `concurrent_modification` instead of throwing. If `withOrgContext` commits on normal return, the losing transaction can still commit the appended event without materializing the state, breaking the immutable ledger and outbox/state consistency. | On CAS miss, throw a typed rollback error or move the event insert after the successful CAS. Ensure losing transitions rollback all writes. |
| BLOCK | `apps/web/lib/production/close-wo.ts:60` | CFR-21 close e-sign is written before the WO state transition. If `applyTransition` later rejects or returns a failure, the signature/audit rows remain committed with no corresponding close transition. | Perform transition validation first or wrap e-sign plus transition in a rollback-on-failure path. If e-sign must precede mutation, make any post-sign transition failure throw so the transaction rolls back. |
| HIGH | `apps/web/lib/production/output/register-output.ts:50` | `qty_kg` and catch weights accept JavaScript `number` and normalize with `String(v)`. That allows binary-float drift or exponential notation rejection after client-side float coercion on regulated quantity input. | Accept only decimal strings for kg/qty inputs; reject numbers at schema boundary. |
| HIGH | `apps/web/lib/production/get-wo-runtime-state.ts:100` | Quantity aggregation converts NUMERIC strings to `Number` for required/consumed/output totals. This violates the NUMERIC-exact red-line for qty/kg and can drift percentage calculations. | Use the same fixed-point decimal helper used for catch weight, or a decimal library, and only format final display values from exact decimals. |
| HIGH | `apps/web/lib/production/complete-cancel-wo.ts:74` | Yield gate checks primary output with `Number(o.qty_kg) > 0`, again coercing NUMERIC qty through float. | Compare NUMERIC exactly in SQL (`exists ... qty_kg > 0`) or use fixed-point decimal parsing. |
| HIGH | `apps/web/lib/production/start-wo.ts:142` | `wo_outputs` insert omits `site_id` while canonical day-1 requirement says operational tables must carry nullable `site_id`. If the table column exists and is required by the migration contract, this write path leaves it unspecified. | Include `site_id` explicitly as `null` until site attribution is wired, matching other writes in this diff. |
| HIGH | `apps/web/lib/production/complete-cancel-wo.ts:68` | `production.consume.blocked` is emitted inside the same transaction immediately before returning `fail(...)`. That means the hold-block audit event can commit even though no state change occurred, and route-level catch handling only emits for `QualityHoldError`, not this `fail` result. | Use the same `QualityHoldError` pattern as output/waste and emit the blocked event from a fresh committed transaction, or explicitly document and test same-transaction commit semantics for blocked audits. |

VERDICT: FAIL — blocking items: missing RBAC seed/backfill for new production permission family; lifecycle CAS miss can commit orphan `wo_events`; close e-sign can commit without a close transition.
