# OEE — availability × performance × quality / snapshots / andon / line dashboards (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module lives in **one
> route group** — the desktop **OEE** screens under
> `…/(modules)/oee/**` (nav link `/oee`, registered in
> `lib/navigation/module-registry.ts:255-269`) — with two surfaces: the
> **OEE dashboard** (`/oee`, KPI tiles + per-line A/P/Q table + recent-snapshot
> list) and the **Andon board** (`/oee/andon`, live per-line status grid →
> `/oee/andon/[lineId]` full-screen kiosk that polls a JSON status route).
>
> **CANONICAL-OWNER BOUNDARY (D-OEE-1, the single most important fact about this
> module):** 15-oee is a **READ-ONLY consumer** of `oee_snapshots`.
> **08-production is the SOLE producer/writer** — the snapshot row is written by
> `apps/web/lib/production/oee-snapshot-producer.ts` inside the WO-complete
> transaction, never here. The 15-oee schema migration
> (`packages/db/migrations/203-oee-schema-foundation.sql:25-36`) **pre-flight-fails**
> if `public.oee_snapshots` (08-owned, mig 184) is absent, and **creates no base
> `oee_snapshots`/`downtime_events` table** — only materialized views + reference
> tables on top of the 08-owned producer tables. Every 15-oee read is a `SELECT`;
> there is **no Server Action, no route handler, and no mutation** anywhere in
> `oee/**` that writes any OEE table.
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (live dashboard + live Andon board; the R4-era
> "graceful andon stub" copy is now superseded — see Known gaps).

---

## a. Overview

The OEE module **reads back** the manufacturing-effectiveness facts that
08-production produces and presents them three ways: a **trailing-window
dashboard** (factory-average OEE + A/P/Q micro-stats, per-line rollup, recent
snapshot ledger), and a **shop-floor Andon board** (one card per production
line showing the line's live runtime status, current WO, good/scrap kg, and the
latest snapshot's OEE%). It owns **no operational write path** — its entire
job is aggregation and display over `oee_snapshots` plus a handful of live
production reads for the Andon board.

The **OEE math itself is not computed here.** A snapshot's
`availability_pct`, `performance_pct`, `quality_pct` are computed once, in the
08-production producer (`oee-snapshot-producer.ts`), at WO-complete time;
`oee_pct` is a **GENERATED column** (`A×P×Q/10000 STORED`,
`184-production-changeover-allergen-oee.sql:162-164`) that the producer never
even writes. 15-oee only ever `avg()`s / `round()`s those stored percentages.
The contract is **honest NULL**: any component that cannot be computed (no
standard-time source → `performance_pct` NULL; zero quality denominator →
`quality_pct` NULL) is stored NULL, `oee_pct` propagates the NULL, and the UI
renders `—` rather than a fabricated number
(`oee/_components/oee-tables.tsx:20-23`).

The dashboard read is gated server-side on **`oee.dashboard.read`**
(`oee/_actions/oee-data.ts:28,141-142`); the Andon board is **not permission-gated**
at all (RLS-scoped only — see Known gaps). Percent values stay **TEXT
end-to-end** out of the dashboard loader (SQL `round(...)::text`) to avoid a JS
float roundtrip (`oee-data.ts:154-164`).

The read layer is two files: `oee/_actions/oee-data.ts` (`getOeeScreen` — the
dashboard loader) and `oee/andon/andon-data.ts` (`getAllLinesLiveStatus` /
`getLineLiveStatus` — the Andon live reads). Presentation is
`oee/_components/oee-tables.tsx` (dashboard tables), `oee/andon/page.tsx` +
`oee/andon/andon-live-card.tsx` (kiosk), with the JSON poll endpoint at
`oee/andon/[lineId]/status/route.ts`.

---

## b. Function inventory

> Reads name the Postgres tables/views touched. **There is no write column** —
> nothing in this module mutates state (D-OEE-1). "Gate" is the permission
> checked server-side; a missing permission returns a typed
> `{ ok:false, reason:'forbidden' }` (dashboard), never a 500. All reads run
> inside `withOrgContext` (RLS `org_id = app.current_org_id()` as `app_user`).

### Dashboard read — `oee/_actions/oee-data.ts`

| Function | What it does | Reads | Gate |
|---|---|---|---|
| `getOeeScreen({siteId?,window?})` | The whole `/oee` dashboard in one call. Runs **three SELECTs** over `oee_snapshots`: (1) **KPI tiles** — `count(*)` + `round(avg(oee_pct/availability_pct/performance_pct/quality_pct),1)::text`; `avg()` skips NULLs, an all-NULL column → NULL → `—` tile. (2) **Per-line aggregate** — group by `line_id`, `count(distinct active_wo_id)` as WO count, avg A/P/Q/OEE, `left join production_lines on pl.id::text = s.line_id` to resolve code/name (`'unassigned'` fallback), `order by avg(oee_pct) desc nulls last limit 50`. (3) **Recent snapshots** — newest-15, joining `production_lines` for the line code and `work_orders` for the WO number. Optional `siteId` binds in **all three** reads; optional `window` (from reporting period-selector) binds as timestamps (`oee-data.ts:144-258`). | `oee_snapshots`, `production_lines`, `work_orders`, `user_roles`/`roles`/`role_permissions` (perm check) | `oee.dashboard.read` |

### Andon live reads — `oee/andon/andon-data.ts`

| Function | What it does | Reads | Gate |
|---|---|---|---|
| `getAllLinesLiveStatus(orgId)` | One row **per `production_lines` row**: the line + its current active WO (a `lateral` pick of the line's `RELEASED`/`IN_PROGRESS`/`ON_HOLD` WO, in-progress first), good/scrap **kg** rolled up live from `wo_outputs`(`qa_status<>'FAILED'` vs `=FAILED`) + `wo_waste_log`, the **latest** snapshot's `oee_pct` (`lateral` over `oee_snapshots` newest-first), and a `last_activity_at` = `max()` of snapshot/WO/execution/output/waste timestamps. Status derived (`deriveStatus`) from runtime + `production_lines.status`. Ordered by line code. | `production_lines`, `work_orders`, `wo_executions`, `items`, `wo_outputs`, `wo_waste_log`, `oee_snapshots` | **none** (RLS only — see gaps) |
| `getLineLiveStatus(lineId,orgId)` | Same projection for a single line (`pl.id = $2::uuid`); `andon_line_not_found` (→ 404 / `notFound()`) when the uuid is malformed or unmatched. | same as above | **none** (RLS only) |

Both wrap the read in `withOrgContext` and `assertOrgScope` (the page passes the
sentinel `CURRENT_ORG_ID = 'current'`, which always matches the resolved
`app.current_org_id()`; a real org-id mismatch throws `andon_org_scope_mismatch`,
`andon-data.ts:121-125`).

### Andon poll endpoint — `oee/andon/[lineId]/status/route.ts`

| Handler | What it does | Reads | Gate |
|---|---|---|---|
| `GET /oee/andon/[lineId]/status` | JSON refresh for the kiosk client (`{ data }`, `cache-control: no-store`). Calls `getLineLiveStatus`; `404 {error:'not_found'}` on `andon_line_not_found`, `500 {error:'persistence_failed'}` otherwise. The client (`andon-live-card.tsx:63-83`) polls this every **15 s** and keeps the last good state on a transient failure. | via `getLineLiveStatus` | **none** (RLS only) |

**Function count inventoried: 4** (1 dashboard loader, 2 Andon live reads, 1 poll
route handler) — **all reads, zero writes**. There are **no Server Actions** in
`oee/**` (no `'use server'` module; the dashboard loader is invoked during RSC
render, `oee-data.ts:17`). The only OEE *write* in the codebase is 08-production's
`recordWoCompletionSnapshot` (`lib/production/oee-snapshot-producer.ts`), covered
below as the producer of record.

---

## c. The OEE calculation model (where the math actually lives)

The composite is the textbook **OEE = Availability × Performance × Quality**, but
every factor is computed **once, by 08-production**, in
`recordWoCompletionSnapshot` (`oee-snapshot-producer.ts`), called from `completeWo`
inside the WO-completion transaction. 15-oee never recomputes — it averages the
stored result.

### Producer math (`oee-snapshot-producer.ts`, owned by 08-production)

```
runtime      = completed_at − started_at           (minutes; missing/zero ⇒ NO row)
downtime     = merged-overlap of this WO's downtime_events clipped to the window
                 (overlapping events MERGED, open events clipped at window end)
expected     = SUM(wo_operations.expected_duration_minutes)        (NULL when absent)

Availability = (runtime − downtime) / runtime × 100                clamp [0,100]
Performance  = expected / (runtime − downtime) × 100               HONEST NULL when
                 expected is NULL/0 or actual-run-time is 0; >100 clamps to 100
Quality      = good / (good + rejected + waste) × 100              HONEST NULL on
                 zero denominator
                   good     = Σ wo_outputs.qty_kg WHERE qa_status <> 'FAILED'
                   rejected = Σ wo_outputs.qty_kg WHERE qa_status  = 'FAILED'
                   waste    = Σ wo_waste_log.qty_kg
OEE          = A × P × Q / 10000      ← GENERATED column, propagates NULL
```

Anchors: availability `computeAvailabilityPct` (`oee-snapshot-producer.ts:114-119`),
performance `computePerformancePct` (`:121-134`), quality `computeQualityPct`
(`:136-146`), composite `computeOeePct` (`:148-156` — mirrors the GENERATED column
for the unit tests), downtime merge `totalDowntimeMinutes` (`:77-112`). A documented
quality choice: PENDING/PASSED/RELEASED/ON_HOLD outputs **count as good** until QA
actually fails them (`:30-36`).

### Snapshot grain + idempotency

- **Grain:** one row per completed WO, `snapshot_minute = date_trunc('minute', completed_at)`.
- **V-PROD-10 quad-unique** `(org_id, line_id, shift_id, snapshot_minute)`
  (`184-…oee.sql:174`) — two different WOs completing on the same line+shift+minute
  collapse to one row (first writer wins; documented grain limitation, `mig 287:27-29`).
- **Per-WO idempotency:** partial unique `(org_id, active_wo_id)`
  (`287-oee-snapshot-wo-complete-producer.sql:40-42`) **plus** the producer's
  `WHERE NOT EXISTS` + `ON CONFLICT DO NOTHING` — an R14-replayed COMPLETE is a
  silent no-op, never an aborted txn (`oee-snapshot-producer.ts:267-298`).
- **context:** `line_id = work_orders.production_line_id::text` (fallback
  `'unassigned'`); `shift_id` = most-recent non-null `downtime_events.shift_id`
  for the WO (fallback `'unspecified'` — no shift calendar wired to the completion
  path yet); `site_id = work_orders.site_id` (`oee-snapshot-producer.ts:193-213`).
- **NULL relaxation:** mig 184 created `performance_pct`/`quality_pct` `NOT NULL`
  (the per-minute-aggregator design); mig 287 **drops both NOT NULLs**
  (`287:31-32`) so the WO-grain producer can store honest NULLs. The 0..100 range
  CHECKs still hold (CHECK passes on NULL).

### What 15-oee does with the stored numbers

- **Dashboard KPIs/lines:** `round(avg(<pct>),1)::text` over the window — a NULL
  component simply drops out of the average; an all-NULL column → NULL → `—`
  (`oee-data.ts:153-205`).
- **Recent rows + Andon:** `round(<pct>,1)::text` per snapshot (`oee-data.ts:239-242`);
  the Andon card reads the **single latest** `oee_pct` per line and `toFixed(1)`s
  it client-side (`andon-data.ts:42-50`, `andon/page.tsx:57`).

### Andon line-status state machine (`andon-data.ts:143-157`)

```
deriveStatus(line.status, wo.runtime_status):
  runtime 'in_progress'                       → Running  (emerald)
  runtime 'paused'                            → Paused   (amber)
  line.status inactive/maintenance/down       → Down     (red)
  line.status setup                           → Paused   (amber)
  otherwise                                   → Idle     (amber)
```

`runtime_status` itself is `wo_executions.status` with a fallback fold over
`work_orders.status` (`RELEASED→planned`, `IN_PROGRESS→in_progress`,
`ON_HOLD→paused`, `andon-data.ts:54-61`) — i.e. it mirrors the 08-production WO
runtime lifecycle, read-only.

<!-- screenshot: oee dashboard (KPI tiles + OEE-by-line table + recent snapshots) -->
<!-- screenshot: oee/andon board (per-line status cards) -->
<!-- screenshot: oee/andon/[lineId] kiosk (full-screen line status, 15s poll) -->

---

## d. User how-tos

> Button/label copy below is the literal English from the `oee.*` next-intl
> namespace (`apps/web/i18n/en.json`); `data-testid`s in parentheses are the
> stable anchors in the component code.

### (i) Read the OEE dashboard

1. Open **OEE** from the sidebar (`/oee`, `module-landing-oee`). The page header
   reads **"OEE"** with subtitle *"Overall Equipment Effectiveness — availability,
   performance and quality from completed work orders"*.
2. The **period selector** (reused from Reporting — `period-selector.client.tsx`,
   `oee-period-selector`) sets the window (Today / This week / This month /
   This quarter / Last 7 days / Last 30 days / Custom); the line + search filters
   are **deliberately hidden** here (`showLineFilter={false}`, `oee/page.tsx:242-243`).
   Default window = trailing 7 days.
3. **KPI tiles** (`oee-kpi-oee` / `-availability` / `-quality` / `-snapshots`) show
   the window-average OEE, availability, quality, and snapshot count; a NULL average
   renders `—` (`oee/page.tsx:191-211`).
4. **"OEE by line — last 7 days"** (`oee-lines-table`): one row per line with WO
   count + OEE/A/P/Q %, best OEE first; the line cell shows the mono **code** over
   a muted **name** (or `Unassigned`).
5. **"Recent snapshots"** (`oee-snapshots-table`): newest 15 — completed time, line,
   shift, WO number, A/P/Q/OEE %, output kg, downtime min, waste kg; any missing
   value is `—`.
6. **Empty state** (`oee-empty`): *"No snapshots yet — OEE snapshots are produced
   when a work order is completed. Complete a work order in Production…"*. This is
   the honest state for an org that has never completed a WO.
7. **Denied** (`oee-denied`) when you lack `oee.dashboard.read`; **error**
   (`oee-error`) on a read failure.

### (ii) Make a snapshot appear (it is produced in Production, not here)

There is **no "create snapshot" action in OEE.** A snapshot is minted when a
**work order is completed** in 08-production (Production → Work orders → open a
running WO → **Complete**). `completeWo` runs `recordWoCompletionSnapshot` inside
the completion transaction; the new row then shows up in the OEE dashboard's KPIs,
line table, and recent list, and as the line's latest OEE% on the Andon board.
If the WO has no `wo_operations.expected_duration_minutes`, **Performance** will be
`—` (honest NULL), and OEE with it.

### (iii) Watch the Andon board (shop-floor line status)

1. Go to **`/oee/andon`** (`module-landing-oee-andon`), header **"Andon board"**.
   Each **line card** shows the line code/name, a colored **status badge**
   (`andon-status-badge`: Running/Paused/Idle/Down), the current **WO**, latest
   **OEE %**, **Good** + **Scrap** kg, and **Last activity** time.
   `andon-empty` ("No production lines are configured yet.") when no lines exist.
2. Click a card → **`/oee/andon/[lineId]`** opens the full-screen **kiosk**
   (`andon-kiosk`) — big mono line code, status badge, current WO + product, and
   Good/Scrap/OEE metric tiles, themed by status (emerald/amber/red shells).
3. The kiosk **auto-refreshes every 15 s** by polling
   `/[locale]/oee/andon/[lineId]/status` (`andon-live-card.tsx:63-83`); on a
   transient poll failure it keeps the last known state on screen.

> **Note (honest):** the Andon board currently runs under **normal app
> authentication** — the footer states *"Kiosk access currently uses normal app
> authentication. Token auth will be added later."* (`oee.andon.tokenAuthTodo`,
> `andon-live-card.tsx:136-137`, `andon/page.tsx:103-104`). There is no kiosk
> token and no permission gate (see Known gaps).

---

## e. Data sources (Supabase tables / views)

Consumed read-only (the canonical producer is 08-production):

- `oee_snapshots` — **08-production canonical** (mig 184; producer
  `lib/production/oee-snapshot-producer.ts`). 15-oee `SELECT`s only:
  `availability_pct` / `performance_pct` / `quality_pct` / generated `oee_pct`,
  plus `output_qty_delta` / `downtime_min_delta` / `waste_qty_delta`,
  `line_id` (text) / `shift_id` (text) / `snapshot_minute` / `active_wo_id` /
  `site_id`. RLS-forced; `app_user` has DML grants at the table level but **no
  15-oee code uses them** — the producer in 08-production is the only writer.
- `production_lines` — `id::text = oee_snapshots.line_id` join for the line
  code/name (dashboard + Andon).
- `work_orders` / `wo_executions` — WO number + runtime status (Andon current-WO
  pick; dashboard recent-row WO number).
- `wo_outputs` / `wo_waste_log` — live good/scrap **kg** rollup for the Andon card
  (08-production canonical tables; read here).
- `items` — product name on the Andon kiosk.
- `user_roles` / `roles` / `role_permissions` — the `oee.dashboard.read`
  permission check in `getOeeScreen` (`oee-data.ts:113-131`).

15-oee-owned schema (created by `203-oee-schema-foundation.sql`) — **present but
not yet consumed by any `oee/**` app code** (backlog, see gaps):

- `shift_configs` — per-org shift definitions (only writer/reader today is
  Settings → Shifts, `(admin)/settings/shifts/_actions/shifts.ts` — not the OEE
  screens).
- `oee_alert_thresholds` — per-line/org OEE target + anomaly/maintenance tunables.
- `shift_patterns`, `org_non_production_days` — shift-calendar admin tables.
- `big_loss_categories` — universal Nakajima Six-Big-Losses taxonomy (no `org_id`,
  world-readable; seeded in mig 203).
- `oee_shift_metrics` MV (per-shift rollup + MTTR/MTBF stub columns) and
  `oee_daily_summary` MV (90-day daily rollup + best/worst shift) — both ship
  `WITH NO DATA`; `REFRESH … CONCURRENTLY` is intended to run from `apps/worker`
  (T-009) which is **not running**.
- DSL rule registry rows in `rule_definitions` (02-settings-owned table): the
  `shift_aggregator_v1` workflow is the P1 active rule; `oee_anomaly_detector_v1`
  and `oee_maintenance_trigger_v1` are seeded **inactive** P2 stubs
  (`mig 203:426-454`).

Governance / events:

- `outbox_events` — mig 203 admits five producer-event types into the CHECK
  (`oee.alert.threshold_breached`, `oee.anomaly.detected`, `oee.dsl_rule.updated`,
  `oee.shift.aggregated`, `oee.snapshot.refreshed`, `mig 203:521-525`) — these are
  **emitted by the not-yet-running worker/DSL engine, not by any `oee/**` code**.
- RBAC: the 13-string `oee.*` family is seeded to the org-admin family +
  `oee_admin`/`oee_supervisor`/`oee_viewer` roles in both `role_permissions` and
  the legacy `roles.permissions` cache (mig 203 §10, corrected by mig 219). The
  enum declares all 13 (`packages/rbac/src/permissions.enum.ts:394-418`).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **The Andon board has NO permission gate.** `andon/page.tsx`,
   `andon/[lineId]/page.tsx`, the `status/route.ts` poll endpoint, and
   `andon-data.ts` all run under `withOrgContext` (RLS org-scoping) but **never
   call `hasPermission`** — any authenticated in-org user can open the kiosk. The
   seeded **`oee.tv.kiosk_view`** permission (`permissions.enum.ts:418`, granted
   in mig 203) is **never read by any code**. Wire `oee.tv.kiosk_view` into the
   Andon pages + status route.

2. **No kiosk token auth.** The Andon kiosk explicitly runs under normal app auth
   with a `// TODO: kiosk token auth` and a user-facing `tokenAuthTodo` notice
   (`andon-live-card.tsx:136`, `andon/page.tsx:103-104`). A true shop-floor TV
   needs a scoped token, not a logged-in session.

3. **The "graceful andon stub" copy is now orphaned.** The R4 dead-end fix
   (commit `ec5a3ef3`) added `oee.andon.stubBadge` ("Coming soon") +
   `oee.andon.stubNotice` ("The live Andon kiosk … ships in a later OEE wave …")
   to `i18n/en.json`. The current working tree's Andon board renders **real live
   data** and **no component references those two keys** — the stub copy is dead
   i18n that should be removed (or the board is the stub's replacement and the
   keys are stale). Stated honestly: **the Andon board is LIVE, not a stub; the
   stub *strings* are the leftover.**

4. **The materialized-view aggregation pipeline is schema-only.** `oee_shift_metrics`
   and `oee_daily_summary` exist `WITH NO DATA` (mig 203 §6/§7) and are refreshed
   only by `apps/worker` (T-009), which **does not run** (per
   `MON-project-overview`). The dashboard therefore reads the **base
   `oee_snapshots` directly**, not the MVs — so shift-level rollups, best/worst
   shift, and the 90-day daily summary surfaced by those MVs have **no UI** yet.

5. **Most of the seeded `oee.*` permissions are unused.** Of the 13-string family,
   only **`oee.dashboard.read`** is enforced (the dashboard loader). `oee.target.edit`,
   `oee.override.create/delete`, `oee.export.csv/pdf`, `oee.anomaly.acknowledge`,
   `oee.big_loss.map_edit`, `oee.shift_pattern.edit/read`, `oee.downtime.annotate`,
   `oee.downtime.escalate`, `oee.tv.kiosk_view` have **no consuming code** — they
   back the not-yet-built admin/export/anomaly screens (mig 203 §10 / PRD T-014..T-026).

6. **No OEE targets, anomaly alerts, Six-Big-Losses, exports, or drilldowns in the
   UI.** The dashboard page documents the honest subset it ships and explicitly
   defers tabs (Six Big Losses / Changeover), heatmap, sparklines, alert banners,
   export bar, and the date pager to the 15-OEE backlog (T-014..T-019,
   `oee/page.tsx:8-12`; `oee-tables.tsx:6-9`). `oee_alert_thresholds`,
   `big_loss_categories`, `shift_patterns`, and `org_non_production_days` are
   tables without a screen.

7. **DSL P2 rules are inert stubs.** `oee_anomaly_detector_v1` and
   `oee_maintenance_trigger_v1` are seeded with `active:false` and `active_to` set
   to "now" (i.e. immediately inactive) pending the feature flags
   `oee.anomaly_detection_enabled` / `oee.maintenance_trigger_enabled`
   (`mig 203:426-454`). The 13-MNT MTBF/MTTR feed and 09-QA reject_kg integration
   noted in `MON-domain-oee` are P2 and not wired (the MV's `mttr_min`/`mtbf_min`
   are coarse stub formulas, `mig 203:289-296`).

8. **Snapshot grain caveats inherited from the producer.** Within one
   line+shift+minute, two different completed WOs collapse to one snapshot row
   (V-PROD-10 quad-unique, first writer wins, `mig 287:27-29`); `shift_id` falls
   back to `'unspecified'` because no shift calendar is wired to the completion
   path (`oee-snapshot-producer.ts:204-213`); `line_id` falls back to
   `'unassigned'` for line-less WOs. The dashboard surfaces these fallbacks as
   `Unassigned` and a literal `unspecified` shift string.

No raw `// TODO` markers exist in the OEE read layer beyond the two
`// TODO: kiosk token auth` ones cited above; the remaining gaps are derived from
the schema-vs-no-UI and seeded-permission-vs-no-consumer drift observed in the
code, and from the explicit "honest subset" notes the page/loader carry.
