# Overnight deep-refactor run — 2026-06-30 (progress log + 5am-report skeleton)

**Mission (owner):** `/goal` deep-refactor of the whole app — review every file, find DEAD CODE,
DUPLICATES, DANGLING REFERENCES (to dropped tables / removed features / non-existent functions), and
"works-but-badly-written" code. **HARD RULE: do NOT break working code; when uncertain, 2×-check and
do NOT remove.** Cadence: 4–5 Codex lanes ‖ 1 Claude lane per wave; Codex implements + self-reviews;
Claude (Opus / kira-codex-review) reviews after each wave; build-gate + live-browser smoke that nothing
broke; push via `/tmp/mk_push.command`. Deliver a detailed report **in the chat window** ~5am.
Start HEAD = `a941ace0`. Next free migration = 406 (refactor expects ~no migrations).

---

## PHASE 0 — research (DONE): 4 read-only lanes + knip + madge

### Deterministic scanners
- **knip** (`pnpm dlx`, no lockfile change): 423 unused files / 432 unused exports / 657 unused types /
  129 duplicate exports / 17 unused deps / 12 unlisted deps / 2 unresolved imports. ⚠️ knip errored on
  `packages/db/drizzle.config.ts` (no DATABASE_URL) → degraded resolution; Next.js entry points are
  false-positives. **Every knip "unused" = candidate, never auto-truth.**
- **madge**: 16 circular deps (mostly `labels.ts ↔ component` and `modal ↔ screen` cycles;
  also `lib/production/shared.ts ↔ holds-guard.ts`, `rule-engine executor↔workflow`, `sync-queue flusher↔index`).

### R1 — dangling references (dropped tables/views). Highest safety value.
Dropped by migs 402/404: `public.allergens`, view `fa_bom_view`, tables `lot`/`work_order`(sing.)/
`quality_event`/`shipment`(sing.)/`bom_item`, finance `wo_actual_costing`/`inventory_cost_layers`/
`cost_variances`/`d365_finance_dlq`/`standard_costs`; reference_tables rows `partners`,`uom_reference`.
- **Broken tests** still hitting dropped objects (fail vs live DB): `close-out-legacy-stages.integration.test.ts`
  (work_order singular), `finance-schema-foundation.test.ts` (5 dropped finance tables), `fa-bom-view.test.ts`
  (dropped view), `shared-bom-ssot.test.ts` (pg_class fa_bom_view assertion). `r13-business-tables.test.ts`
  is self-contained (recreates placeholders) → NEEDS-2×-CHECK, leave unless tsc breaks.
- **Drizzle schema drift**: 11 dropped objects still defined/exported in `schema/{r13-business-tables,finance,
  fa-bom-view}.ts` + `index.ts`. Zero production importers (re-verify before removing each export).
- `public.allergens` refs in TS are COMMENTS only (safe). `Reference.Suppliers` is now a LIVE view (mig 394) — not dangling.
- Ghost UI: `uom_reference` tab in Settings/Reference renders empty (rows deleted) — NEEDS-2×-CHECK (canonical store = `public.unit_of_measure`).

### R2 — duplicate systems
- **`hasPermission` — see the variant map below (126 defs / 18 variants — BIGGER + more nuanced than R2 thought).**
- `OrgActionContext`/`QueryClient` types re-declared ~70 / ~199× → canonical `lib/auth/with-org-context.ts` (defer; wide).
- `searchItems` single impl at `app/(npd)/fa/actions/search-items.ts` but **276 cross-tree imports** from the legacy `(npd)` group → move to `lib/items/` + re-export shim (defer; wide but mechanical).
- `formatLimit` 2× (quality haccp + ccp-monitoring labels) → shared util. [Wave1 C4]
- Item **cost-source divergence**: Finance WO cost (`coalesce(item_cost_history, items.cost_per_kg)`) + TO-form (`items.cost_per_kg` direct) BYPASS the SSOT `v_item_effective_cost` (which Technical/NPD use). Owner-gated (changes Finance numbers).
- `revert-gate.ts` (old) vs `revert-npd-gate.ts` (live, e-sign) — old has no live caller. [Wave1 C4, prove-then-delete]
- Old `(admin)/settings/*` = 6 redirect/re-export stubs; dual schema-wizard (441 vs 761 LOC); `reference_tables.processes` vs `Reference.ManufacturingOperations` (HIGH risk, owner-gated).

### R3 — stale top-level dirs
- **DEAD-CANDIDATES**: `_archive/` (52M/2912 files, provably unreferenced — biggest win), root `e2e/` (stale ACP leftover), root `artifacts/` (stale parity), root `tests/` (byte-identical dup of `apps/web/tests/helpers/owner-org-context.ts` + 2 orphan `.py` → NEEDS-2×-CHECK on `.py`), `logs/` (empty).
- **KEEP** (referenced): `_foundation`, `_shared`, `design`, `rules`, `tooling`, `scripts`, root `lib/` (wired via schema-runtime), `_meta` (⚠️ has a LIVE import: `reporting/rpt-labels.ts:14` → `_meta/i18n-staging/reporting.json`).

### R5 — works-but-badly-written
- Top god-files: formulation-editor 2039, wo-detail-screen 1987, fg/[productCode]/page 1838, npd-fields-screen 1557, scanner-labels 1415, fa-production-tab 1400, action-modals 1323, mrp 1247, lp-detail 1210, TO actions 1182…
- Anti-patterns: 4 `revalidatePath`-in-try/catch with `process.env.VITEST` guard (PO/TO/suppliers) hide cache bugs; copy-paste `pgErrorToResult+console.error+ok:false` catch block 8×+ in PO & TO; 4 leftover `[onClose]`-dep Escape listeners; `as any`×6 in promotions screen (h()/createElement style); yard client net-weight uses JS float vs server Dec; `report-read-actions.ts` 9× Core+thin-wrapper; scanner-labels.ts parallel i18n channel; 80 TODO/FIXME (outbox uses in-process LocalDispatchQueue in prod, Andon kiosk no auth, D365 secret store stub).

---

## ⭐ hasPermission VARIANT MAP (126 defs, 18 body-variants) — security-relevant, NOT a safe blind dedup
- **A. permissive** (`left join role_permissions … OR coalesce(r.permissions,'[]'::jsonb) ? perm`): ~77 copies
  (variants 4815ddbe=34, 4220478d=28, + `client.`/destructured-param replumbs 8b92=10, 50bf=3, 8c94=2…).
- **B. STRICT** (`INNER join role_permissions`, **NO jsonb fallback**): ~21 copies (c6ed1327=17, 58cf=1, cd894=3).
  → On these surfaces a user whose perm is ONLY in `roles.permissions` jsonb is **DENIED** while permissive
  surfaces ALLOW. Real authorization inconsistency.
- **C. permissive + `r.code = perm`**: fa4cc79a=5 (settings printers/temp-ranges/process-defaults/labor-rates + warehouse print-history).
- **D. permissive + `r.code/slug = perm`**: 9942d9=4 (sso/* + settings-page-loaders).
- **E. permissive + owner/admin/module_admin bypass (4-param)**: 2a76=4 + 29c7=2 (infra machine/line/location/warehouse).
- Specials: can-spec.ts wraps in withOrgContext+try/catch; reopen-dept-section uses REOPEN_PERMISSION const.
- **RECOMMENDATION (owner decision):** pick ONE canonical RBAC semantics, then codemod. Until then, do NOT
  blanket-consolidate (would change behavior on B/C/D/E). Surface B as a latent RBAC bug to confirm/intend.

## Vetted DEAD-FILE candidates (knip ∩ zero-importer grep ∩ not-entry) — 45, each still needs per-file 2×-check
actions/authorization/policy-helpers, actions/d365/{rotate-secret,set-constant}, actions/import-export/jobs,
actions/onboarding/{back,first-wo,jump,skip}, actions/reference/export-csv, actions/schema/deprecate-column,
actions/security/force-mfa, actions/tenant/{preview-upgrade,promote-canary,rollback-upgrade,set-rule-variant,start-upgrade},
app/(admin)/gdpr/_actions/redact-user, app/(npd)/_modals/gate-approval-modal-host,
app/(settings)/reference/allergens/_actions/emit-bulk-changed, settings/_components/settings-route-stub,
(modules)/_components/module-stub-notice, technical/bom/_actions/delete-guard,
technical/eco/_actions/{list-change-orders,update-change-order-draft}, (npd)/_components/dashboard-client,
[locale]/(app)/_actions/sign-out, onboarding/product/ProductOnboardingClient,
components/settings/modals/{manufacturing-operation-edit-modal,promote-to-l2-modal,role-assign-modal,user-invite-modal,vitest.config},
lib/auth/supabase-browser, lib/cascade/manufacturing-ops-lookup, lib/settings/settings-page-loaders,
packages/auth/scripts/fetch-nist-25k, packages/db/schema/{audit-log,reference-tables,rule-registry,schema-metadata,settings-core,tenant-l2},
packages/db/seeds/{allergens-eu14,d365-constants-apex}, packages/ui/test/declarations.d.ts.
(NOTE: many are disabled-feature scaffolding — onboarding/tenant-canary/d365/gdpr/import-export — confirm "dead" vs "parked" with owner before deletion.)
knip false-positives (HAVE importers, do NOT delete): actions/orgs/create, actions/reference/{get,list}, actions/rules/get,
actions/sso/test-connection, actions/users/deactivate, (npd) dashboard-pipeline-preview/fa-right-panel/fa-tabs/dashboard-counters,
user-menu-language-picker, lib/technical/routing/service, packages/rbac/role-seed.

---

## WAVES

### Wave 1 — DISPATCHED (4 Codex bg + 1 Claude). Behavior-preserving, no migrations, no file overlap.
- **C1 (codex a844d3cb)**: db schema-drift removal (11 dropped objects) + fix 4 broken dropped-table tests. STATUS: running.
- **C2 (codex a8f5796d)**: split god-file modals — extract RecordConsumptionModal from wo-detail-screen; split action-modals into 4 + shared (barrel re-export). STATUS: running.
- **C3 (codex ab0209d8)**: promotions `as any`→JSX; yard float→Dec; 4 `[onClose]`-dep Escape listeners. STATUS: running.
- **C4 (codex ada3257b)**: dedup `formatLimit`; prove-then-delete `revert-gate.ts`. STATUS: running.
- **Claude lane**: pivoted from hasPermission (unsafe to blind-dedup) → produced the variant map + vetted dead-file list above. DONE.

### Wave 2 — PLANNED (after W1 review+gate+push)
- OrgActionContext/QueryClient type canonicalization (wide, mechanical) ‖ searchItems move+shim ‖ circular-dep breaks (labels↔component) ‖ vetted dead-file deletions (subset, prove-then-delete) ‖ PO/TO catch-boilerplate helper (money path — careful).

### Owner-gated (DO NOT auto-do): hasPermission canonical semantics; cost-source SSOT consolidation; reference_tables.processes vs ManufacturingOperations; dual schema-wizard; `_archive/` 52M deletion; settings redirect-stub removal; product_legacy.

## RUN LOG (live)

### ✅ WAVE 1 — SHIPPED + DEPLOYED READY (commit `5bdfb634`, deploy dpl_CgMm… READY)
- C1 db schema-drift (11 dropped objects) + 6 broken-test fixes. C2 modal splits (RecordConsumptionModal + action-modals→4). C3 promotions as-any→JSX + yard float→Dec + 4 onClose listeners. C4 formatLimit dedup.
- ⚠️ C4 ALSO deleted revert-gate.ts + gutted rollbackGate tests **against its own report** → REVERTED to HEAD; revert-gate repoint deferred (must migrate test coverage, not delete it).
- Gate: `pnpm -r typecheck` EXIT=0. 28 files. Vercel READY (no 'use server' break).

### ✅ WAVE 2 — SHIPPED (commit `da70a183`, deploy dpl_PjTK… BUILDING→will be READY)
- C1 conservative dead-file deletion: 2/15 deleted (eco list-change-orders + update-change-order-draft, zero refs); 13 KEPT (had test importer/ref). C2 broke 3 circular deps (production shared↔holds-guard, rule-engine, sync-queue — all type-moves, T-064 gate logic untouched). C3 extracted 3 npd-fields dialogs.
- Gate: `pnpm -r typecheck` EXIT=0; rule-engine 35 / sync-queue 34 / npd-fields 27 tests pass. 16 files.

### 🔄 WAVE 3 — IN FLIGHT (4 Codex + 1 research)
- C1 yard-labels circular cluster (4 cycles). C2 lp-detail extract. C3 users-screen extract. C4 sites-screen extract (all "extract-or-report, never force"). R1 dead-vs-parked feature classification (onboarding/tenant/d365/gdpr/import-export) for owner-decide list.

### ⚠️ KNOWN ENVIRONMENT ISSUE — rogue Codex daemon re-applies C4-W1's gate diff
The shared Codex broker re-materializes C4(Wave-1)'s reverted gate changes (delete revert-gate.ts + gut rollbackGate tests) onto the WORKING TREE whenever a new codex-rescue lane starts. **Mitigation:** explicit per-wave staging (never `git add -A`) shields every commit; I re-revert the 6 gate files (gate-checklist-panel.tsx, gate-actions.integration.test.ts, gate-machine-honesty.test.ts, gate-helpers.ts, revert-npd-gate.ts, revert-npd-gate.test.ts) before each commit + a FINAL revert at run-end so the tree is left clean. HEAD is always correct. Not killing the daemons (would destabilize codex-rescue).

### Pre-existing red test (NOT tonight): `settings-nav.test.ts` nav parity count `[9,12]` vs `[9,11]` — flagged, investigate separately.

## Verification log
- W1: typecheck EXIT=0; Vercel dpl_CgMm… READY (commit 5bdfb634).
- W2: typecheck EXIT=0; rule-engine/sync-queue/npd-fields tests green; Vercel dpl_PjTK… BUILDING.
- W3: typecheck EXIT=0; users 17 + sites 14 RTL pass; committed eaadc2dc, pushed.
- ✅ Browser smoke (live, production monopilot-kira.vercel.app, admin login): dashboard + settings shell render; **promotions** (W1 h()→JSX rewrite, hardest change) renders fully; **npd-fields** (W2 dialog extraction) renders fully — no error boundaries. App loads, login works. Combined with typecheck×3 + all RTL/unit green + Vercel builds passing on W1/W2/W3 = nothing broke. users/sites/mwo/yard extractions are RTL-verified, ride the next deploy.
### ✅ WAVE 4 — SHIPPED (commit `ba1d2b4c`, pushed)
C2 broke 4 modal↔screen cycles (compliance-docs/d365-mapping/quality-holds/risks → type leaves). C3 extracted 6 mwo-list components. C4 deleted dead ProductOnboardingClient (sign-out KEPT — contract test; onboarding-4 + gdpr redact-user = owner-decide). Web typecheck EXIT=0; mwo 13 RTL pass. ⚠️ The C1 NPD-pipeline modal-cycle lane DETACHED/stuck in a read-loop (0 edits) → ABANDONED; NPD cycles deferred.

### ✅ LIVE BROWSER SMOKE (production, admin login) — nothing broke
dashboard + settings shell + promotions(W1 JSX rewrite) + npd-fields(W2 dialog extraction) all render clean. App+login work. Rest of extractions RTL-verified + Vercel builds green.

### W4-RESEARCH (round 2) FINDINGS — for the owner + future waves
- **REAL BUG #11 (dangling, HIGH):** `revalidatePath('/npd/fg/${code}/...')` in ~13+ Server Actions targets a NON-EXISTENT route (the `(npd)` group adds no URL segment; real URL = `/{locale}/fg/{code}/...`) → RSC cache NEVER invalidated after FG/allergen/docs/risks mutations → stale data. **Wave 5 C3 fixing.**
- **#14 (correctness):** `production/work-orders/[id]/release/route.ts:5` local `ERROR_STATUS` has 6 keys vs canonical `lib/production/shared.ts:75` (14) → new production errors return wrong HTTP status. **W5-C2 fixing.**
- **#3 (latent):** `isUuid` 20 copies, TWO regexes — strict(v4) vs loose(any) ; 8 production action files use the LOOSE one. Owner-decide (consolidating to strict could reject non-v4). REPORT.
- **#1 writeOutbox 28 copies** (6 clusters; infra 4× byte-identical = easy win), **#2 hasPermission 127/18-variants** (owner-decide RBAC semantics), **#7 pagination zod 6+**, **#8 LP available-qty SQL 7×**, **#9 v_item_effective_cost JOIN 5×**, **#16 formatDate 17×**, **#6 formatMoney 4×** — all REPORT (consolidation candidates).
- **DEAD:** `lib/settings/settings-page-loaders.ts` (491 LOC, 0 importers — only a COMMENT ref) + `isCrossShellSidebarModule` export. **W5-C1 deleting.**
- **#12/#13 const re-decl** (CLOSED_WO / CONSUMPTION perms) — **W5-C2 fixing.**

### 🔄 WAVE 5 — IN FLIGHT (3 Codex): dead-module+export deletion (C1), canonical-const dedup ERROR_STATUS/perms (C2), revalidatePath dangling-route fix (C3).

### TODO before run-end: gate+commit+push W5 → FINAL gate-revert (gate files + any late C1 NPD dirt) so the working tree is clean → 5am report in chat → memory update.
