# Remaining backlog — master wave plan for the next long run (2026-06-23)

Authoritative plan for the NEXT 4h+ session. Everything gated A–G is done (fa→FG deferred) plus
H-tier E11/E7/E4B. This is what's LEFT, ordered, broken into small slices, each tagged **[Codex]**
(concrete backend/CRUD/wiring) or **[Claude]** (UI / prototype-parity / cross-module review). Read
the session learnings first: [[session-learnings-2026-06-23]].

## Operating conventions (locked — see learnings)
- **Codex = backend/CRUD/wiring, ANY difficulty, but SMALL** (≤5 files, read-first, exact contracts,
  reuse-existing-actions, foreground + `task --wait --timeout-ms 3000000`, xhigh). Its wrapper often
  "completes" without reporting or hands to a background child — **the files still land; verify by
  running the test yourself**; sometimes re-dispatch (S5 needed 1 retry).
- **Codex never writes migrations** (it dies on them). The orchestrator writes the `.sql` + applies via
  Supabase MCP `apply_migration` + verifies with a follow-up SELECT. **Pre-assign a migration number
  per lane** to avoid collisions. **Next free migration = 312.**
- **Claude = UI lanes** (kira-ui), shared-file edits, reviews. Never run two lanes editing the same
  shared file concurrently (`quality/page.tsx` nav, `apps/web/i18n/*.json`) — sequence them.
- **Verify gates (owner standard, hard evidence):** per-slice real typecheck + RTL; integrated
  typecheck/smoke/i18n-parity when no lane is mid-edit; live-DB via Supabase MCP; **browser-walk needs
  a deploy** (push has been session-blocked → RTL + DB-MCP are the honest fallback, say so). Owner
  runs `git push origin main` to deploy.
- Checkpoint-commit at clean integrated points (typecheck 0), excluding in-flight dirs.

## Recommended wave order (value × independence × risk)
Quick wins first, then the confirmed-bug foundation, then big themes that need owner sign-off + browser
verification last.

---

### WAVE P — Packaging has no allergens (NEW, owner-requested, SMALL — do first)
Packaging is non-food → must not carry allergens; the allergen section must reject/omit packaging items.
- **P1 [Codex]** — block allergen writes for packaging: in the allergen profile action
  (`upsertProfile`/`saveAllergenOverride`, grep `item_allergen_profiles`) reject when the item's
  `item_type='packaging'` with a clear error; exclude packaging from the allergen cascade reader
  (`technical/allergens/load-cascade.ts`). +test.
- **P2 [Claude]** — in the item Allergens tab, hide/disable the allergen editor for packaging items
  with an explaining note ("Packaging items carry no allergens"); ensure the item create/type flow
  doesn't surface allergens for packaging. +RTL.

### WAVE SQ — Scanner quick-fixes batch (SMALL — from the 2026-06-23 scanner review, NOT the camera overhaul)
- **SQ1 [Codex]** — `GET /api/scanner/labor?woId=` + hydrate clock state on the WO-execute screen
  (fixes double-clock-in; `wo-execute-screen.tsx:63` inits clocked_out every mount).
- **SQ2 [Claude]** — QC-hold receive dead-end: after a QC-required receive, add an "Inspect now"
  button deep-linking to the scanner QA screen pre-loaded with the LP (`receive-po-item-screen.tsx:264`).
- **SQ3 [Codex]** — implement the `my_line` WO filter (`wo-list-screen.tsx:83`, match session.lineId) +
  fix the tautological `setPhase` in `pick-screen.tsx:131` + add `onSubmit` (auto-jump) to the
  receive-PO list scan field (`receive-po-list-screen.tsx:69`).
- **SQ4 [Claude]** — relabel/redirect the Consume/Output home tiles (`home-screen.tsx:36`) so they don't
  imply direct entry; remove the `dev/scanner` orphan stub.

### WAVE SW — Site-global + scanner warehouse scoping (LARGE, confirmed bug — needs owner decision first)
Full audit + 7-point fix in `2026-06-23-site-warehouse-scoping-wave.md`. **OWNER DECIDED 2026-06-23:
APP-LEVEL FILTER** (not RLS) — site scope enforced at the application/query layer (`withSiteContext`
request seam + a shared `siteScoped()` list helper), faster than a ~38-table RLS migration. Product-code
warehouse model still to confirm during build.
- **SW1 [Codex+mig]** — add `warehouse_id` to `scanner_sessions` (mig 312) + set at login/context +
  bootstrap returns the session site's warehouses.
- **SW2 [Codex]** — enforce warehouse boundary in `movement.ts`: `loadMovableLpForUpdate` (+lp.warehouse_id),
  `assertLocationExists` (+loc.warehouse_id) for move/putaway/pick; `updateLpLocation` also sets warehouse_id.
- **SW3 [Codex]** — receive-po `resolveWarehouse` (site-local, not org-default) + `resolveRequestedLocation`
  (+warehouse check). Reject cross-warehouse with "use a Transfer Order".
- **SW4 [Claude]** — scanner login warehouse picker + show current warehouse in the shell.
- **SW5 [Codex]** — `withSiteContext` seam + stamp `site_id` on every create (add site_id columns to
  purchase_orders/transfer_orders via mig; WO/LP/output already have nullable site_id) + `siteScoped()`
  list helper; wire the site filter into PO/TO/scanner-PO lists.
- **SW6 [Claude]** — replace `/multi-site` stub with real site management + cross-site overview.

### WAVE SCN — Scanner overhaul: real camera + input + de-chrome (LARGE — needs browser/phone verify)
Full spec in `2026-06-23-scanner-overhaul-backlog.md`.
- **SCN1 [Codex]** — `useBarcodeScanner` hook: BarcodeDetector API + lazy `@zxing/browser` fallback +
  HW keyboard-wedge keydown capture. Unit-test the wedge buffering + fallback selection.
- **SCN2 [Claude]** — `<ScanCamera>` viewfinder (getUserMedia env-facing, decode loop, permission/
  no-camera states) wired into the Camera button → detected code fills the field.
- **SCN3 [Claude]** — Manual button focuses the field; native keyboard per-field `inputmode`/
  `enterkeyhint`; autofocus; drop on-screen keypads where native is better.
- **SCN4 [Claude]** — de-chrome: remove the fake status bar/notch entirely (even desktop preview),
  reclaim the space; update `scanner-frame.tsx` + its 3 contract tests.
- **SCN5 [Claude]** — wire the hook+camera+autofocus into every scan screen (receive/consume/output/
  putaway/move/pick/lp/qa).

### WAVE FG — fa→FG rename (LARGE — owner decision gates it)
Full plan in `2026-06-23-fa-to-fg-rename-plan.md`. **OWNER DECIDED 2026-06-23: OPTION B (destructive
rename of all existing codes).** Important context: a full **data wipe + fresh start is imminent**, so the
destructive code-rename carries no real data-loss cost — and is largely moot: just make NEW products use
`FG` codes now + do the cosmetic/TS/route rename, and let the fresh seed (post-wipe) use `FG` codes.
Defer the live destructive data-migration (don't run it autonomously on live data). Then: LANE1 [Claude]
cosmetic (copy+TS identifiers+routes), LANE2 [Codex+mig] events+permissions (atomic), LANE3 [Codex+mig]
secondary DB objects (one at a time).

### WAVE E2B — Cold chain (M)
- **[Codex+mig]** `delivery_condition_checks` + `product_temp_ranges` + `submitConditionCheck`
  (out-of-range → canonical createHold). **[Claude]** scanner receive condition step (configurable per
  org) + GRN "delivery conditions" section + `/settings/quality/temp-ranges`.

### WAVE E4A — Andon/TV (M)
- **[Codex]** `getLineLiveStatus(lineId)` aggregate (reuse production dashboard queries) + kiosk token.
  **[Claude]** `/oee/andon/[lineId]` full-screen kiosk (polling) + `/oee/andon` token generator.

### WAVE E5 — Yard: gatehouse + appointments + weighbridge (L)
- **[Codex+mig]** `dock_doors`/`dock_appointments`/`yard_visits`/`weighings` + actions (gate-in/out,
  assign-dock, weigh, appointment collision check). **[Claude]** `/yard` board + `/yard/appointments`
  calendar + `/yard/weighbridge` + `/settings/infra/docks`; inbound-schedule badge.

### WAVE E8 — Scheduler with allergen sequencing (L)
Schema mig 204 exists. **[Codex]** solver (group by allergen profile to minimise washes) +
scheduler_runs/assignments + applySchedule. **[Claude]** `/scheduler` board (Gantt, drag, conflict
badges) + changeover-matrix editor.

### WAVE E9 — Freight + supplier scorecard (M)
- **[Codex]** carriers + transport_lanes + freight cost → costing waterfall; scorecard KPIs from
  existing data (PO-vs-GRN timeliness, weight variance, NCR). **[Claude]** `/planning/carriers` +
  `/planning/suppliers/[id]/scorecard`.

### WAVE E10 — Kitting/weigh-station + inventory count (L)
- **[Codex+mig]** kitting queue + count orders (ABC cycle) + adjustment-with-approval (the only legal
  qty writer outside consume/receive/move — e-sign + audit). **[Claude]** weigh-station UI + scanner
  "Count" tile (blind count) + variance approval.

### WAVE E12 — B2B portal + AI assistant (XL — needs a separate auth spec FIRST)
RLS needs a customer_id dimension (big architectural decision). AI = read-only tool-calling over
existing list/trace actions, every answer cited, zero writers. Do the auth spec before any code.

### WAVE LE — Loose-ends batch (small, fold opportunistically)
- WO-disassembly output TRIGGER UI [Claude] (registerDisassemblyOutput exists, no WO screen calls it).
- NPD costing labor-rate wire [Codex] — replace hardcoded 8% with a default labor_rate × process time
  (needs owner default-rate decision).
- Complaint customer/LP/owner pickers [Claude] (free-text now).
- E-IO tranche 2–4 [Codex] — forecasts/reorder import, master-data import (items/BOM/suppliers/
  nutrition), more list exports.
- B-list [Codex] — suppliers→Planning unification, UoM dedup (remove reference.uom), NPD review
  enforcement (stop source='technical' from NPD), mig-222/223 test rewrites.
- Print follow-ups [Codex] — printer test endpoint, print-history reprint polish.

## Notes for the next run's orchestrator
- The outbox cron dispatcher is ACTIVATED (vercel.json) — no separate apps/worker needed; reporting MVs
  + dead-events behave correctly only after deploy + a fresh production walk.
- Demo data is one org/one site, dated 2026-06-10..12 — reporting/genealogy look empty until a fresh
  flow runs TODAY; not a bug.
- Migs 300–311 are live; next free = 312. Login admin@monopilot.test / Admin2026!!!.
