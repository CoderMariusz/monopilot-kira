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

## Verification log
- (filled per wave: build-gate result, tests, Vercel deploy state, browser smoke)
