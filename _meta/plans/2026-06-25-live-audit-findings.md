# Live page-by-page audit findings — 2026-06-25 (overnight, DB wiped; PREPARE on live khjvkhzwfzuwzrusgobp + static)

## Round 1 (first lanes)
### shipping (SO/shipments/customers) — CLEAN. All queries PREPARE-clean, badges localized, no UUID leaks/dead-buttons, create→persist sound. (per-shipment weight always null = documented placeholder.)
### technical/items — i18n LEAK (Sev3 cosmetic): ITEM_TYPE_LABELS/STATUS_LABELS hardcoded EN (items-manager.client.tsx:38-53), raw {item.status} on detail ([item_code]/page.tsx:373), + EN column headers/tabs/filter-pills/placeholder/footer. Data layer clean. → QUEUE i18n fix.
### warehouse locations/inventory/reservations/LP — CLEAN (RLS clean, edit round-trips verified). 
  - REAL GAP: LP split/merge/destroy buttons permanently "Coming soon" disabled (lp-detail.client.tsx:613-624) though splitLp/mergeLp/destroyLp backend (#12, shipped) has ZERO UI callers → wire the UI (modals + buttons). MED.
  - NOTE: locations LP-count 500-cap + LP-list 200-limit no-pagination (acceptable, surfaced in UI).
### quality haccp/ccp-monitoring/ccp-deviations/specifications — ALL CLEAN. quality_event grant (mig-337) CONFIRMED live (HACCP detail no longer 500s). Heavy ccp-deviations join PREPARE-clean. e-sign grants present.

## Round 2
### planning PO + TO — CLEAN (heavy TO lp_blockers lateral join PREPARE-clean, warehouse→code mapped, both perm-stores checked).
### planning suppliers — Sev2 REAL GAP: supplier EDIT missing (no updateSupplier action + no edit modal; name/currency/lead-time/contact write-once at create, only 3-state status mutable). + Sev3 dead `edit` label + paymentTerms read-only-never-settable. → BUILD updateSupplier action + edit modal.
### planning work-orders/forecasts/schedule — CLEAN (createWorkOrder snapshot, releaseWorkOrder gate, reschedule all PREPARE-clean; /new redirects ?new=1 not 404).
### planning MRP — CLEAN SQL; 3 LOW i18n (mrp-view.tsx: hardcoded EN card title/headers; row.type raw buy/make/transfer not labels.actionTypes; firm/released status fall-through to raw). post-persist-only.
### production wos/shifts/changeovers/waste — CLEAN SQL (all 7 WO-detail tab subqueries, corrections counter-entries, casing gates vs live CHECK all valid). 2 LOW:
  - corrections-actions.ts:820/940/1070 revalidatePath('/production/work-orders/${woId}') = WRONG (that's an API route.ts, not the page /production/wos/[id]) + missing [locale] → server-cache revalidate is a NO-OP (modals router.refresh() so acting user OK; cross-request stale). FIX: revalidatePath('/[locale]/production/wos/${woId}','page'). [3-line safe fix]
  - void/reverse buttons shown without production.{output,waste,consumption}.correct perm (canVoid=actions!==null; get-wo-action-context lacks *.correct) → click→server forbidden. = the A1 gap the reverted production-reverse lane targeted. CONFIRMED. (reverse-consume LOGIC otherwise verified correct: gates-before-mutation, throws-for-rollback, dup-correction backstop.)

## Round 3
### warehouse receiving (grns/counts/movements/adjustments) — **HIGH BUG FOUND** + 1 LOW
  - **HIGH (FIXED this session): `searchEligibleSupervisors` 42P10.** `adjustments/_actions/adjust-form-actions.ts:104-124` — `select distinct ... u.email::text as email ... order by u.email` (raw citext NOT in select list) → Postgres 42P10 "for SELECT DISTINCT, ORDER BY expressions must appear in select list" on EVERY supervisor-combobox open (incl. empty initial). Action catches→returns error→form shows searchError → operator can NEVER pick a supervisor → **every DECREASE adjustment is blocked** (increase unaffected). PREPARE-verified live (threw 42P10; `u.email::text` variant returns rows clean). → FIX: `order by u.name nulls last, u.email::text`. APPLIED.
  - LOW: `count-actions.ts:801` createCountSession revalidatePath no-op (route-group mismatch); cosmetic (list is force-dynamic). NOT fixed (cosmetic).
  - Everything else CLEAN: grns list/detail (incl. can_cancel LP sub-selects), cancel-line + cold-chain writes, counts detail + approve-and-apply write set, movements, applyDirectAdjustment write set — all PREPARE-valid, RLS org-scoped, no UUID-as-name.
### technical bom/routings/nutrition/cost/factory-specs — 1 SEV2 latent + 1 SEV3
  - **SEV2 (latent): disassembly BOM create + detail broken — 42703 `bom_co_products.expected_yield_pct` missing.** `bom/_actions/disassembly.ts:217` (INSERT, createDisassemblyBom→persistence_failed) + `:310` (SELECT, getDisassemblyBom, called on EVERY /technical/bom/[itemCode] load via page.tsx:296 → throws, but try/catch falls through to forward 7-tab view so no 500). Latent: 0 disassembly BOMs exist. But disassembly BOMs can never be created/viewed. → FIX: migration adding `expected_yield_pct numeric` to bom_co_products (actual cols: id,org_id,bom_header_id,co_product_item_id,quantity,uom,allocation_pct,is_byproduct,site_id,created_at,updated_at,schema_version) OR drop the col from both statements. QUEUE (owner-touch: schema).
  - SEV3: factory-spec bundle "History" panel always empty — writer/reader table mismatch. 3 write actions write to `public.audit_events` (create-factory-spec.ts:79, recall-spec.ts:87, factory-spec-flow.ts:108) but History loader reads `public.audit_log` (bundle-data.ts:254) — two distinct tables. → FIX: point bundle-data.ts:254 at audit_events. QUEUE.
  - CLEAN: routings, nutrition, cost(+history) all read+write PREPARE-valid; forward-BOM full path clean; no UUID-as-name.
### settings (sites/users/infra-warehouses) + npd (pipeline/brief/costing/formulation) — CLEAN
  - LOW (non-crash): settings/infra/warehouses "Active WO count" column always 0 — `work_orders.warehouse_id` absent on live DB; capability check correctly detects + takes safe branch (no 42703). Cosmetic data-completeness only.
  - All sites/users/warehouse + npd pipeline/brief/costing/formulation reads + creates PREPARE-clean; the prior-flagged npd `cross join lateral (values …)` over product PREPARE-clean; npd_projects.type is text-label not UUID-FK; "Import recipe"/"Import lines" buttons are sanctioned disabled affordances, not dead.
### finance / oee(+andon) / maintenance / scheduler(+changeover-matrix) — 1 SEV2 wiring dead-end, rest CLEAN
  - **SEV2 (code/wiring dead-end): changeover-matrix can never create its first entry.** `upsertMatrixByPair` requires an active `changeover_matrix_versions` row (`scheduler-actions.ts:493-499,137-147 loadActiveVersionId`) but NOTHING in the repo ever inserts a version (no migration seed, no action, no UI) → every first save → invalid_input. Compounded: axes derive only from existing changeover_matrix rows (scheduler-view-model.ts:166-173) → fresh org renders empty state w/ no cell to click. → FIX: seed an active version (migration) + axis-seeding flow, OR add "create version / add profile pair" UI. QUEUE.
  - CLEAN: finance wo-cost reads (RBAC role_permissions join correctly org-scoped via roles.org_id), oee/andon (incl. lateral-heavy single-line), maintenance MWO count/list/insert/transition/outbox + number allocator + FOR-UPDATE guarded transition + SoD cancel gate — all PREPARE-valid, honest empty states, no UUID-as-name.

## ACTIONABLE BACKLOG from audit (queue for fix phase)
- ✅ FIXED (this session): warehouse `searchEligibleSupervisors` 42P10 (HIGH — unblocks decrease adjustments). PREPARE-verified.
- ✅ FIXED (this session): production corrections revalidatePath wrong route+missing [locale]/'page' (3 sites → /[locale]/production/wos/${woId}).
- QUEUE SEV2 (owner-touch, schema): disassembly BOM 42703 — add `bom_co_products.expected_yield_pct numeric` migration OR drop col from disassembly.ts:217,310.
- QUEUE SEV2 (wiring): changeover-matrix first-entry dead-end — seed active version + axis-seeding flow / "add version+pair" UI.
- QUEUE SEV3: factory-spec history reader/writer table mismatch — point bundle-data.ts:254 at audit_events.
- MED: LP split/merge/destroy UI not wired (#12 backend shipped, 0 UI callers) — wire modals+buttons.
- Sev2: supplier edit missing — new updateSupplier action + modal.
- LOW: void/reverse affordance perm-gating (A1) — part of production-reverse re-do.
- COSMETIC: technical/items i18n (broad), MRP planned-orders i18n, settings/infra Active-WO-count column always 0 (work_orders.warehouse_id absent).
