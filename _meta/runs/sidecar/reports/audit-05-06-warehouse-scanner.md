# Forward-Looking PLAN/TASK Audit — 05-warehouse + 06-scanner-p1

**Date:** 2026-06-04
**Mode:** READ-ONLY. No code modified. (Proposed task stubs live in `_meta/runs/sidecar/proposed-tasks/`.)
**Auditor:** sidecar agent (Opus 4.8)
**Scope:** Both modules are NOT built (0 implemented). This audit validates task-set completeness, logic coverage, dependencies, canonical-owner discipline, RBAC reachability, and build-readiness *before* the build starts.

---

## Verdict (TL;DR)

| Module | Tasks | PRD coverage | Logic coverage | Clarity verdict |
|---|---|---|---|---|
| **05-warehouse** | 58 (T-001..T-058) | Strong — coverage.md maps every §/FR/UX/prototype | Strong; 3 real gaps + several path/numbering staleness | **NEARLY READY** — fix 4 blockers before build |
| **06-scanner-p1** | 49 (T-001..T-049) | Strong — §8.8 bidirectional matrix, 55 prototype labels | Strong; 1 architecture contradiction (workspace) + 1 canonical-owner leak | **BLOCKED** — resolve workspace decision + canonical-owner before build |

Both modules have unusually high task-readiness (gold-standard JSON, AC≤4, cross_module_dependencies metadata, prototype anchors, checkpoint_policy). The gaps are NOT "missing decomposition" — they are **stale infra references**, **two canonical-owner leaks**, **one workspace architecture contradiction**, and a **systemic RBAC-reachability gap** shared by both modules (and by every prior module — see migrations 146/148/149).

---

## BLOCKERS (must fix before build) — both modules

### B1 — RBAC reachability: enum strings added but NEVER granted to roles (BOTH modules)
- **Evidence:** `packages/rbac/src/permissions.enum.ts` currently contains **0** `warehouse.*` and **0** `scanner.*` strings. T-058 (WH) adds 12 strings + `ALL_WAREHOUSE_PERMISSIONS`; T-049 (SCN) adds 10 strings + `ALL_SCANNER_PERMISSIONS`. **Neither task seeds `role_permissions` grants.** Their ACs only assert enum presence + exported array + CODEOWNERS — nothing grants the permission to any role.
- **Why this is the "unseeded-permission class":** prior modules required *separate* permission-seed migrations to be reachable — `146-npd-allergen-write-permission-seed.sql`, `148-settings-infra-permission-seed.sql`, `149-npd-permissions-org-admin-seed.sql` (pattern: `INSERT INTO public.role_permissions (role_id, permission)`). Without the equivalent for WH/SCN, every server-side `requirePermission('warehouse.*'|'scanner.*')` check fails for all roles → screens build green but are 403/empty at runtime on the live deploy gate.
- **Compounding nav gap:** `apps/web/lib/navigation/types.ts` declares `PermissionKey = null` + `rbac_todo` (RBAC deferred). Warehouse + Scanner ARE registered in `module-registry.ts`, but their nav items carry no permission key. When WH/SCN permissions land, the nav items must be wired to the new keys, or RBAC gating stays a no-op (reachable-by-everyone or by-no-one depending on default).
- **Fix:** add a permission-seed migration task per module (proposed `m05-T059-rbac-role-grants.md`, `m06-T050-rbac-role-grants.md`) AND a nav-permission-wiring acceptance line. Map per PRD §3 permission surface (WH) / §12.5 role hierarchy (SCN).

### B2 — Stale migration numbering (BOTH modules)
- **Evidence:** HEAD migration is **149** (`packages/db/migrations/149-...sql`). But STATUS.md says "last migration is 050"; WH tasks reference `0NN_*.sql`; SCN T-001/T-002 hard-code `migrations/0060_scanner_sessions_and_pin.sql` / `0061_...`.
- **Impact:** identical to the 01-npd renumber gotcha (0010→075+ noted in MEMORY). A `0060_` file will sort *before* 149 and never run on `pnpm db:up` (or collide), so schema silently never reaches Supabase → the deploy-migration gotcha.
- **Fix:** renumber all WH/SCN migrations to **≥150**, contiguous, ordered by dependency (WH enums → tables → indexes → RLS → seeds; SCN sessions → audit/devices). Update the hard-coded `0060/0061` in SCN T-001/T-002 and the `0NN_` placeholders in all WH T-001..T-012.

### B3 — Scanner workspace architecture CONTRADICTION (06 only) — HARD BLOCKER
- **Evidence:** 00-foundation T-134 already shipped scanner as a **route-group inside apps/web**: `apps/web/app/[locale]/(scanner)/layout.tsx` + `(scanner)/dev/scanner/page.tsx`. But scanner **T-012** says "Stand up **apps/scanner** Next.js workspace" and **every** 06 UI task JSON uses `apps/scanner/src/...` / `apps/scanner/__tests__/...` paths (verified T-013). `apps/scanner` does not exist.
- **Impact:** the two cannot coexist. Building T-012 as written creates a second Next app that duplicates/orphans the T-134 scaffold (layout, ScannerFrame, dev harness, `(scanner)/scanner-isolation.spec.ts`). STATUS.md flagged "workspace split must be resolved."
- **Decision required before build:** EITHER (a) keep the apps/web `(scanner)` route-group (recommended — reuses T-134 scaffold, shared `lib/services/*`, single deploy, matches PRD §5.1 "PWA osadzony w monorepo … shared services z desktop") and **rewrite all 31 file paths across the 06 task set** from `apps/scanner/...` to `apps/web/app/[locale]/(scanner)/...` + `apps/web/...`; OR (b) formally migrate the T-134 scaffold into `apps/scanner` and document the workspace split + Vercel project. Until chosen, 06 is unbuildable.

### B4 — Canonical-owner leaks (both modules touch `wo_outputs` / `wo_waste_log`)
- **HARD RULE:** `wo_outputs` → 08-production (canonical); `schedule_outputs` → planning; `oee_snapshots` → 08-production. Warehouse legitimately owns **inventory: `license_plates`, `lp_genealogy`, `lp_reservations`, `grns`/`grn_items`, `stock_moves`, `pick_overrides`, `shelf_life_rules`, `warehouse_settings`** — NOT WO outputs.
- **Leak 1 (06 T-042):** scanner output/co-product/waste endpoints (`lib/services/production/scanner-output.ts`) AC says they directly "create … `wo_outputs` row" and "create `wo_waste_log`". These are 08-production-owned writes. Scanner must **delegate** to the 08-production output/waste service (consume its contract), not INSERT into `wo_outputs`/`wo_waste_log` itself. As written, scanner becomes a second writer of a canonical 08 table.
- **Leak 2 (06 T-039 / 05 T-034 consume):** consume-to-WO updates `wo_material_consumption` — confirm this is the 08/04 consume contract, not a warehouse/scanner-owned write. Warehouse's legitimate write on consume is the LP transition + `stock_moves(consume_to_wo)` + `lp_genealogy(operation_type=consume)` + the `warehouse.material.consumed` outbox event (after 09-quality T-064 consume gate). The WO-side counters belong to the WO owner.
- **Fix:** retag T-042 (and T-039 where applicable) to call the 08-production service via cross-module contract; add an explicit risk_red_line "Do not INSERT/UPDATE wo_outputs / wo_waste_log directly — delegate to 08-production". 08-production must expose that service (cross-mod dependency to verify in 08's task set). Note 08-production is the canonical OWNER per MON-domain-production; the scanner is just the UI trigger.

---

## 05-WAREHOUSE — detail

### Task inventory
- 58 tasks, all **⬜ NOT STARTED** except T-053 (⏸ stub — Wave-0 landing page `(modules)/warehouse/page.tsx` reads `getModuleCount("lot")`, no sub-pages). 0 implemented.
- Bands: 12 T1-schema (T-001..012), 3 T5-seed rule-registry (T-013..015), 32 T2-api (T-016..047), 7 T3-ui (T-048..054), 3 T4-test (T-055..057), +1 RBAC enum (T-058). (Manifest `task_count`=58; coverage.md header still says 57 — minor stale count, +T-058.)

### PRD-vs-task completeness — coverage is strong
Every PRD area maps to ≥1 task (coverage.md table cross-checked against PRD §5–§16 + 8 amendment FRs WH-101..108). Sub-modules cover the full lifecycle the prompt asked about:
- **Lot/LP lifecycle** ✅ T-002 (table), T-013 (`lp_state_machine_v1` DSL), T-019 (transition service), T-016 numbering, T-017 split, T-018 merge, T-044 force-unlock. State machine is server-driven (ADR-029) with `getAllowedTransitions()` red-line — captured.
- **FEFO/FEFO picking** ✅ T-011 (composite index `(org,wh,product,status,expiry ASC NULLS LAST)`), T-014 (`fefo_strategy_v1`), T-015 (`fifo_strategy_v1`), T-030 (query API), T-051 (`available_lp_picker` UI), T-033 (deviation warn, M-10). FIFO captured as separate rule.
- **Stock moves/adjustments** ✅ T-006, T-025 (move), T-026 (partial→split cascade), T-027 (manual putaway), T-028 (>10% manager gate), T-029 (cycle-count quick-adj P1 stub).
- **Location/bin model** ✅ ltree owned by 02-settings `locations`; WH consumes + filters (T-046 deactivate guard, T-053/T-046 hierarchy view). Boundary correct (see below).
- **Goods receipt/putaway** ✅ T-005 (grns/grn_items), T-021 (GRN-from-PO multi-LP-per-line, no auto-split red-line), T-022 (GRN-from-TO + transit), T-024 (under-receipt force-close), T-023 (GS1-128 auto-fill).
- **Reservations** ✅ T-004/T-031/T-032 — RM-root only; intermediate (`material_source='upstream_wo_output'`) HARD-BLOCKED (V-WH-FEFO-005). Captured as a red-line.
- **Genealogy/traceability** ✅ T-003 (table, DAG invariant), T-038 (recursive-CTE trace), T-054 (genealogy page, FSMA 204 export).
- **Expiry/shelf-life** ✅ T-008 (shelf_life_rules P1 CRUD), T-035 (calc on GRN), T-036 (daily cron), T-037 (use_by override M-12).
- **Outbox events** ✅ T-010 (catalog), T-047 (emission wiring). `wh.lp.received`/`wh.lp.transitioned`/`wh.material.consumed`/`wh.lp.shipped` — producers identified; consume event gated on 09-quality T-064 (exists).

### Missing / under-scoped tasks (propose stubs)
1. **No RBAC role-grant seed** (B1) → propose `m05-T059-rbac-role-grants.md`.
2. **`available_lp_picker` (M-08 / WH-015):** coverage promotes it to first-class but it is folded into T-051 (FEFO+reservations UI bundle). T-051 already carries WH-015/016/017/M-09/M-10 — a heavy bundle. Not a missing task, but flag for splitting at plan time if it exceeds a single worktree (under-scoped-by-aggregation risk). No new stub; note in plan.
3. **`label_print_modal` ZPL (T-043/T-054):** P1 owns real ZPL backend + HTML-only browser preview (BL-WH-04). Captured. No SSCC-18 in P1 — correct: SSCC-18 generation + mod-10 check digit is **P2 (WH-E10 pallets)**, explicitly deferred (§15.5, V-WH-LABEL-002 tagged P2). The audit prompt's "SSCC-18 generation + check digit" is **out of P1 scope for 05** by PRD decision — do NOT add it as a P1 task. (SSCC-18 is owned by 11-shipping pack/SSCC per MON-domain-shipping; warehouse only consumes it for pallet labels in P2.)

### Inconsistencies / staleness (not missing logic — fix in place)
- **`tenant_id` throughout PRD §5.x** vs Wave0 `org_id` law. Task JSONs already corrected to `org_id` + `app.current_org_id()` (verified T-002; F1 fixer 2026-05-14). PRD text is stale but tasks are right — leave PRD, trust tasks.
- **Migration numbering** (B2).
- **coverage.md task_count 57 vs manifest 58** (+T-058) — cosmetic.
- **STATUS T-023 "package path mismatch":** task scopes `packages/barcode-parser/` but repo has `packages/gs1/` (parse.ts/check-digit.ts). Real — reconcile T-023 to reuse `packages/gs1/` or formally create the new package. Also note SCN T-003 wants `packages/scanner-utils/gs1-parser.ts` and PRD §10.3 says `lib/utils/gs1-parser.ts` — **three different GS1 parser homes** across WH/SCN/PRD. Consolidate to one shared parser (recommend `packages/gs1/`) before build to avoid 3 divergent implementations.

### Dependency + canonical-owner table (05)
| Direction | Module | Contract | Status |
|---|---|---|---|
| IN | 00-foundation | outbox(T-112), worker(T-111), e-sign(T-124), withOrgContext(T-125), `app.current_org_id()` | available |
| IN | 02-settings | rule_registry (lp_state_machine_v1, fefo/fifo_strategy_v1), `warehouses`, `locations` ltree, `printers`, feature flags, gs1_prefix | settings DONE (module signed off) |
| IN | 03-technical | items/products, shelf_life_mode/date_code_format, catch-weight, allergen snapshots | 01-npd IN PROGRESS; verify items/products ready before 05-b |
| IN | 04-planning-basic | PO/TO/WO read models, RM-root reservations, WO release/cancel hooks | NOT built — gates 05-b/c/d |
| IN | 09-quality | qa_status ownership, `v_active_holds`, consume gate **T-064 (exists)** | NOT built — gates consume path |
| OUT (produces) | 08-production | `wh.lp.received` (intermediate LP), consume invocation site | — |
| OUT | 09-quality | `wh.lp.transitioned` (qa_status mirror) | — |
| OUT | 10-finance | `wh.material.consumed` (FIFO/WAC valuation) | — |
| OUT | 11-shipping | `wh.lp.shipped` (BOL/POD) | — |
| **OWNS** | 05 | license_plates, lp_genealogy, lp_reservations, grns/grn_items, stock_moves, pick_overrides, shelf_life_rules, warehouse_settings | correct |
| **MUST NOT OWN** | — | wo_outputs (08), schedule_outputs (planning), oee_snapshots (08) | no leak in 05 tasks (leak is in 06 — see B4) |

### Settings-vs-05 boundary (clarified)
Two route trees coexist and are **correctly split**:
- **02-settings owns reference/admin CRUD:** `apps/web/.../settings/warehouses/page.tsx`, `settings/infra/warehouses/page.tsx` — the `warehouses` infra master table (042-infra-master.sql), `locations` ltree, `printers`. (02-settings T-009/T-029/T-042 reference `warehouses`.) STATUS T-009 note already disambiguates: "the `warehouses` infra table is settings domain, not this task."
- **05-warehouse owns the operational module:** `(modules)/warehouse/*` — LP/GRN/moves/FEFO/expiry/genealogy + `warehouse_settings` (per-org policy toggles, distinct from the `warehouses` master). WH T-009 = `warehouse_settings` (policy), NOT the `warehouses` table.
- **No collision** as long as 05 never re-creates `warehouses`/`locations`/`printers` and 02 never owns `license_plates`. One ambiguity to watch: WH-108 "Warehouse Settings Page" (`/warehouse/settings`) vs settings module — these are different surfaces (per-org warehouse *policy* vs global infra CRUD); keep `warehouse_settings` page read of rule-registry **read-only** (V-WH-SET-001).

---

## 06-SCANNER-P1 — detail

### Task inventory
- 49 tasks, all **⬜ NOT STARTED**. `apps/scanner` workspace ABSENT (B3). T-134 (00-foundation) scaffold in `apps/web/(scanner)` exists but is NOT counted here.
- Bands: 3 T1-schema (T-001 sessions+PIN, T-002 audit+devices, T-003 GS1 parser), several T4 wiring (T-004/005/016/025/026), ~17 T2-api, ~21 T3-ui, +1 RBAC enum (T-049). 5 sub-modules 06-a..e.

### PRD-vs-task completeness — strong
§8.8 bidirectional matrix maps all 9 major SCN codes + ~34 sub-screens + 12 modal contracts to 55 prototype labels. Every P1 screen has a task. Scanner-PWA flows the prompt asked about:
- **Offline?** P2 (SC-E6). P1 = detection stub only (T-026 indicator, FR-SC-FE-070). `sync-queue` endpoint, IndexedDB queue, conflict resolution all P2. Correctly scoped — do NOT add P1 offline tasks. SCN-095 LP Inquiry is P2 (UI shell P1, feature-flag OFF).
- **Barcode formats?** P1 = Code 128 + GS1-128 (AI 01/10/17/21/310x/3103/3922). QR, SSCC-18 (AI 00), Data Matrix = P2 (SC-E8/E9). Captured T-003 parser + T-014 CameraScanner (@zxing/browser, native BarcodeDetector fast-path). **SSCC-18 NOT in scanner P1** — matches 05 (P2). Do not add.
- **`lp.received` event:** scanner consumes 05 `wh.lp.received` (operator picking). Producer = 05 T-021/T-022; consumer = scanner pick/lookup. Contract present in cross_module_dependencies.
- **`wo.ready`:** not a P1 scanner concern — scanner reads active WOs via `GET /api/production/scanner/active-wos` (T-045). No `wo.ready` event task needed in 06; if planning emits it, it's a 04/08 contract.
- **Auth:** username+PIN (bcrypt, T-001/T-006/T-008), kiosk/personal modes, 5-fail lockout, forced rotation. Captured.
- **Consume-to-WO (SCN-080 core):** T-039 (`/consume-to-wo`) + T-041 UI — the intermediate-cascade core. Must go through 05 LP transition + 09 consume gate.

### Missing / under-scoped tasks (propose stubs)
1. **No RBAC role-grant seed** (B1) → propose `m06-T050-rbac-role-grants.md` (grants `scanner.access`, `warehouse.operator`, `production.operator`, `quality.inspector`, `scanner.supervisor`, `scanner.admin` per §12.5).
2. **Workspace resolution** (B3) is not a single task — it's a decision that re-paths the whole module. Propose a one-off decision/spike stub `m06-T000-workspace-decision.md` to ratify apps/web `(scanner)` vs apps/scanner and re-path 06 before any UI task starts.
3. **Canonical-owner delegation** (B4) — not a new task, a retag of T-042/T-039 ACs + red-lines. Documented in B4.

### Inconsistencies / staleness
- **STATUS prototype-path-mismatch for T-013/T-014 is STALE/WRONG.** STATUS says "prototype anchor path mismatch (should be `prototypes/scanner/flow-receive.jsx`)" but the task JSON correctly cites `prototypes/design/Monopilot Design System/scanner/flow-receive.jsx:89-233`, which **exists**. Both `prototypes/scanner/` and `prototypes/design/Monopilot Design System/scanner/` exist (duplicates). Tasks are right; STATUS note is wrong — ignore it (or fix STATUS).
- **GS1 parser home triple-conflict** (shared with 05): SCN T-003 = `packages/scanner-utils/`, PRD §10.3 = `lib/utils/gs1-parser.ts`, WH T-023 = `packages/barcode-parser/`, repo has `packages/gs1/`. Pick ONE. Recommend `packages/gs1/` (already has parse.ts + check-digit.ts) as the single shared GS1/GTIN/AI parser for WH + SCN.
- **Migration numbering** (B2): T-001=`0060_`, T-002=`0061_` → must be ≥150.

### Dependency + canonical-owner table (06)
| Direction | Module | Contract | Status |
|---|---|---|---|
| IN | 00-foundation | scanner route-group/session/RLS baseline (**T-134 scaffold — see B3**), outbox, withOrgContext | scaffold built |
| IN | 02-settings | PIN policy, locale, scanner device defaults, feature flags, sites/lines/shifts | settings DONE |
| IN | 03-technical | products/BOM, catch-weight, GTIN | 01-npd IN PROGRESS |
| IN | 05-warehouse | LP lookup, barcode validate, lock protocol, FEFO suggest, consume-to-WO, GRN/move/split | NOT built — gates 06-b/c/d |
| IN | 04-planning-basic | WO/BOM, RM-root reservations | NOT built — gates 06-d |
| IN | 08-production | WO execute engine, **output/co-product/waste service (B4 delegation target)** | NOT built — gates 06-e |
| IN | 09-quality | QA inspect, NCR basic, consume gate T-064 | NOT built — gates 06-e |
| **OWNS** | 06 | scanner_sessions, scanner_audit_log (30-day retention), scanner_devices, users.scanner_pin_hash | correct |
| **MUST NOT OWN** | — | wo_outputs / wo_waste_log (08), license_plates (05) | **LEAK in T-042** (B4) |

### Build-order reality
06 is gated all the way down: 06-a (after 00+02) is buildable now; 06-b needs 05+03; 06-c needs 05 split/merge; 06-d needs 04+05§10+08; 06-e needs 08+09. **None of 05/04/08/09 are built.** So in practice only 06-a (Shell & Core) is startable, and only after B1+B2+B3 are resolved. 05 itself only has 05-a startable (02-settings done) — 05-b/c/d gate on 04-planning-basic (NOT built).

---

## Build-readiness gaps

| Item | 05-warehouse | 06-scanner-p1 |
|---|---|---|
| MON-domain skill | ✅ MON-domain-warehouse (rich, accurate, matches PRD) | ❌ **No MON-domain-scanner skill.** MON-domain-warehouse covers the 05 scanner *contract* but there's no scanner-specific skill (PWA, @zxing, PIN/bcrypt, kiosk/personal, device detect, 390x844 evidence, error severity D9). Recommend creating one (or a `MON-t3-ui` addendum) before 06 build. |
| Prototypes | ✅ warehouse/*.jsx (lp/grn/movement/modals/other-screens) + index + translation-notes | ✅ scanner/*.jsx (login/home/flow-*/modals) + index (55 labels) + translation-notes. Note duplicate trees `prototypes/scanner/` vs `prototypes/design/Monopilot Design System/scanner/` — tasks cite the Design System one (correct). |
| Prototype index | ✅ prototype-index-warehouse.json | ✅ prototype-index-scanner.json |
| Nav wiring | ✅ registered in module-registry; ⚠ permission key null (B1) | ✅ registered; ⚠ permission key null (B1) |
| RBAC reachability | ❌ B1 (no role grants) | ❌ B1 (no role grants) |
| Migration order | ❌ B2 | ❌ B2 |
| Workspace | n/a | ❌ B3 |
| Canonical owners | ✅ clean | ❌ B4 (T-042 wo_outputs/wo_waste_log) |

---

## Proposed task stubs (in `_meta/runs/sidecar/proposed-tasks/`)
- `m05-T059-rbac-role-grants.md` — warehouse permission→role seed migration (≥150).
- `m05-T060-gs1-parser-consolidation.md` — reconcile barcode-parser package to shared `packages/gs1/` (covers T-023 path mismatch).
- `m06-T000-workspace-decision.md` — ratify apps/web `(scanner)` vs apps/scanner; re-path all 06 tasks (B3).
- `m06-T050-rbac-role-grants.md` — scanner permission→role seed migration (≥150).
- `m06-T051-canonical-owner-delegation.md` — retag T-042/T-039 to delegate wo_outputs/wo_waste_log writes to 08-production (B4).
- `m06-skill-MON-domain-scanner.md` — proposal to create the missing scanner domain skill.

(These are PROPOSALS for human/orchestrator approval — not added to the modules' manifests.)

## Clarity verdict
- **05-warehouse:** task SET is clear and complete for P1. Ship-blockers are infra/process (B1 RBAC grants, B2 migration renumber) + one path reconciliation (GS1 parser/T-023). Logic coverage (LP lifecycle, FEFO/FIFO, GRN multi-LP, reservations RM-root, genealogy CTE, expiry cron, scanner contract APIs) is fully captured with ACs. **NEARLY READY.**
- **06-scanner-p1:** task SET is clear and complete for P1 scope. But it is **BLOCKED on a hard architecture contradiction (B3 workspace)** that re-paths the entire module, plus B1 (RBAC) + B4 (canonical-owner leak in T-042) + B2 (migration nums) + missing domain skill. **NOT READY until B3 + B4 resolved.**
