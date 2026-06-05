# MonoPilot — Bugs & Gaps register (2026-06-05)

Everything surfaced during the design-system conformance pass: the 4 cross-module parity
audits, the sitemap-vs-built diff, the live dev run, and the globals/shell port. Grouped by
type + severity so it drives the polish + build backlog. Visual-drift items are
presentation-only (MON-design-system); functional/missing items are build work.

Legend severity: **P0** broken/blocker · **P1** clearly wrong/regulatory · **P2** noticeable · **P3** nit.

---

## A. VISUAL DRIFT — polish (MON-design-system)

### A0. Foundation — FIXED this pass ✅
- **Banned gradient body background** → flat `--bg`. (was every screen)
- **Fonts not loaded** (Inter declared, never imported; no JetBrains Mono) → both loaded.
- **Light sidebar** (design wants dark `#1e293b`) → **dark sidebar shipped** (dedicated `--shell-sidebar-*` tokens; topbar + content stay light).
- **Component library missing from globals** (only `.btn`/`.table`) → full set added (kpi/badge/alert/card/modal/empty-state/tabs-counted/pills/ff/wizard/run-strip/bar).

### A1. Systemic drift (skill-level fix + sweep)
| id | class | where | sev |
|----|-------|-------|-----|
| A1-1 | raw `<select>` vs shadcn `<Select>` (red-line) | settings: roles, tenant/depts, import-export, tenant/migrations, schema/new (≥5) | P2 |
| A1-2 | stale/phantom prototype anchors (one cites past-EOF) | technical ≥7 (shelf-life, cost, routings, sensory, item-detail, factory-specs) | P3 |
| A1-3 | dual route / i18n-namespace trees | npd `(npd)`↔`[locale]/(app)/(npd)` live-dup allergens route; technical `technical.*`↔`Technical.*` | P2 |
| A1-4 | heavy Tailwind card density vs compact admin density | settings stubs/launchers, onboarding launcher | P2 |
| A1-5 | permission-denied not a distinct UI state | settings/security (maps denied→ready); suspected features/notifications/promotions/modules | P2 |
| A1-6 | per-page KPI tiles / dense tables not using design classes | most data screens (now that globals provides `.kpi`/`.table`/`EmptyState`) | P2 |

### A2. Per-screen drift (execution)
- **01-npd:** FA-list missing Kanban/view-toggle (P1) · FA-detail missing BOM + Formulations inline tabs (P1) · legacy duplicate `(npd)/fa/[code]/allergens` route + stub panel to delete (P2) · nutrient/approval cosmetic status not backed by data (P2) · brief Mark-complete CTA not wired (P2).
- **03-technical:** BOM-detail tab set diverges (routing/params/costs/graph absent) (P1) · item-detail 7/8 tabs are stubs (P1) · tooling = routings projection, not stock/reorder inventory (P2) · bom-graph = static list, not react-flow DAG (P2).
- **02-settings:** ship-override-reasons + shifts render placeholders despite real prototype (P1) · d365 config reads env not per-org DB table (P2) · security read-denied shows form chrome not denied banner (P2) · users perm-matrix heuristic may misclassify (P3).
- **08-production (built dashboard):** 4 KPIs vs spec 6 (no QA-holds/next-changeover/A·P·Q) (P1) · **Lines grid + LineCard absent** — core operational surface (P0) · attention ribbon + recent-events feed + shift-targets missing (P1/P2) · WO list has no status tabs/search/filters though data layer returns `statusCounts` (P1).
- **shell:** empty `CountSlot` badge ships on every nav item (P3) · global topbar search is `readOnly`/non-functional (P2).

---

## B. MISSING SCREENS — build (sitemap vs built)

### B1. Settings — required by sitemap, NOT built
**Tax Codes, Waste Categories, Grade Thresholds, Fiscal Calendar, KPI Targets, Planning Settings, Production Execution, Billing.** (Machines/Production-Lines/Locations/Modules ARE built, under `infra/*`.) API Keys/Webhooks exist only under integrations, not settings.

### B2. Settings — rendered as stub placeholders (no real screen)
boms · devices · gallery · labels · products · shifts · ship-override-reasons (last two have real prototype anchors → should be real).

### B3. Whole modules — schema/skeleton only, UI not built
- **09-quality: 32/32 screens + 15 modals UNBUILT** — only a skeleton count panel. NCR, holds (T-064 gate), HACCP/CCP, specs wizard, inspections, sampling, audit-trail, CFR-21 e-sign/SoD/dual-sign all absent. **Module effectively unbuilt despite schema.**
- **08-production: 24/28 screens + 16 modals unbuilt** — only the dashboard landing exists. WO detail/execution, line detail, waste-analytics, downtime, shifts, changeover, OEE, DLQ, settings + all modals missing.
- **Module landing-stubs only** (ModuleStubNotice): finance, oee, maintenance, reporting, multi-site, planning, scheduler.
- **Production dead-nav subroutes** (404 from dashboard): /production/{shifts,analytics,waste,downtime,wos,changeover}.
- Sitemap modules with little/no production UI yet: planning (full board/MRP/Gantt), warehouse (LP/movements/GRN), shipping (SO/pick/pack/ship), finance, oee, reporting, multi-site, maintenance, integrations, scanner flows.

---

## C. FUNCTIONAL / RUNTIME BUGS (found live)

| id | bug | evidence | sev |
|----|-----|----------|-----|
| C-1 | i18n **FORMATTING_ERROR**: confirm strings rendered without their interpolation vars — `"Type the item code {code} to confirm"`, `"{name} will be blocked…"`, `"Removes {code} from active pick-lists…"` throw at render | dev console on /technical/items | P2 |
| C-2 | i18n **INVALID_MESSAGE: Invalid language tag: favicon.ico** — `favicon.ico` is being routed through the `[locale]` segment / locale resolver | dev console, every page | P2 |
| C-3 | `module-nav-route-contract.test.tsx` RED — production/technical/npd module roots lack the required landing stubs (`data-testid=module-landing-*`) | vitest (pre-existing, unrelated to this pass) | P2 |
| C-4 | Production WO list data layer returns `statusCounts` + 25-row cap but the UI silently drops tabs/filters | parity audit PRD-007 | P2 |

## D. INFRA / DEV-ENV (not prod bugs, but blockers/notes)

- **D-1 Local dev can't load org-scoped data.** `withOrgContext` needs `DATABASE_URL_OWNER` (an RLS-bypassing owner/postgres pool) for the user→org bootstrap lookup; that secret is not downloadable via `vercel env pull` (sensitive). The app pooler (`app_user`) is subject to RLS so the bootstrap returns 0 rows → "no public.users row resolves org_id". **Preview/prod work (they have the owner cred); local ready-state does not.** Ready-state visual proof must be captured on the Vercel preview.
- **D-2 Env inconsistency:** `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE` are empty in the **preview** Vercel env and only set in **production** — local setup had to merge prod public keys + app pooler. Worth aligning preview env so previews are self-sufficient.

## E. DEFERRED BACKLOG (from collection-carryforward + quality-gap-backlog-v2)
Belong to the build phase, blocked by unbuilt modules:
- TEC-G-08 supplier-specs API (schema exists mig 174; no actions/page).
- QG-03 maintenance `sanitation.allergen_change.completed` emitter (production changeover gate can't clear).
- QG-04 production `downtime.recorded` → reactive auto-MWO consumer (needs 13-maintenance).
- QG-08 production `wo.closed` → finance actual-costing consumer (needs 10-finance SA).
- QG-12 OEE MV NULL-distinct index (functional index breaks REFRESH CONCURRENTLY).
- sites exactly-one-default-per-org (V-MS-01) DB guard; catch-weight tolerance fixed-point end-to-end.
- 05-warehouse scanner screens 195/196 never built (agent rate-limited).

---

## Recommended order
1. **Visual polish (current phase):** A1 systemic (skill sweep) → A2 per-screen, on built modules. Ready-state screenshots via Vercel preview.
2. **Quick functional fixes:** C-1, C-2 (i18n) — cheap, real console errors.
3. **Build phase (after polish sign-off):** B3 quality + production screens first (biggest gaps), then B1 settings screens, then the stub modules, then E consumers.
