# Dead-end / bug audit — consolidated findings (2026-06-23, run 2)

8 read-only audit lanes swept the whole app (NPD, Settings/Infra, Inventory, Scanner, Planning,
Production, Quality, Technical+Shipping+OEE+Finance) hunting disabled buttons, dead-end flows,
non-displaying data, 404s, broken handoffs. This is the consolidated, prioritized result — woven into
the master plan ([[remaining-backlog-master-plan-2026-06-23]]). Source agent reports are exhaustive with
`file:line`; this doc is the actionable digest + fix-lane plan.

## Live-DB verifications (done this run, via Supabase MCP)
- **SO schema is NOT broken.** Live `sales_orders` = mig-211 schema (`order_number`, `promised_ship_date`,
  `ext_data`, `total_amount_gbp`) — matches the actions code. The mig-288 "alt schema" never took over.
  → Planning finding #9 DOWNGRADED from Sev1 to migration-hygiene cleanup.
- **`sales_order_lines` has NO `uom` column** — the SO create modal collects UoM with nowhere to store it
  (line UoM derives from `items.uom_base`). → small: drop the modal field OR add the column.
- **`production_lines` has `site_id` but NO `warehouse_id`** — confirms the "lines don't show after adding a
  warehouse" root cause is structural.
- **`warehouses` has NO `site_id`** at all — warehouses are org-scoped only. Foundation gap for WAVE SW.

## Cross-cutting patterns (fix once, fix everywhere — biggest wins)

### XC-1 — Stale UI after every mutation (missing `router.refresh()` / `revalidatePath`) — EPIDEMIC
The single most common defect. After a successful create/release/approve/close, the screen does NOT
re-render new state — user thinks it failed and may double-submit. Confirmed in:
- **Quality (all of it):** holds release/create, NCR close/create, spec approve, inspection decide —
  7 client islands never call `router.refresh()` AND 5 action files never call `revalidatePath`
  (Quality #1-7, #15). `inspection-actions.ts` revalidates only `/quality` root, not the detail path.
- **NPD handoff:** `handlePromote` no `router.refresh()` on success (NPD #2).
- **Planning:** `createPurchaseOrder` + `transitionPurchaseOrderStatus` don't revalidate (Planning #5);
  the ENTIRE TO actions file has zero `revalidatePath` (Planning #6).
- **Settings:** warehouse/line create actions don't revalidate (Settings #9).
- **Finance:** the "Refresh" button increments orphan state, never refetches (Finance #11).
→ Fix = add `router.refresh()` in each client success path + `revalidatePath(detailPath)` in each action.

### XC-2 — "Coming soon" permanently-disabled buttons that look live
Many `disabled` controls with `title="Coming soon"` that have no backing action. Mostly honest deferrals,
but several are real operator dead-ends (see Sev2). Inventory LP: split/merge/reserve/block/destroy +
expiry "Force block" (Inventory B-8/B-9). NPD: Watch/Duplicate/Generate-label-PDF/D365-build. Production:
Downtime "Log downtime". Decide per-item: wire vs hide.

### XC-3 — Free-text where an entity picker belongs
Complaint customer/LP/owner are free-text (Quality #14); CAPA owner never resolved (Quality #13). NPD
approval shows raw approver UUID (NPD #13). WO output LP column shows UUID prefix not LP code (Production #2).

### XC-4 — Scan fields that send raw text as a UUID
Pick destination (Scanner #1, Sev1) and shipping pack LP scan (Shipping #7) send typed codes straight into
`$1::uuid` → Postgres 22P02, surfaced as a generic error. Fix = resolve code→UUID first (pattern already in
putaway/move screens).

---

## Sev1 — confirmed, must-fix (no owner decision needed unless noted)

| ID | Area | What | Fix | File:line |
|----|------|------|-----|-----------|
| S1-1 | Technical | **Packaging items CAN be given allergens** (data-integrity: corrupts BOM allergen cascade) = WAVE P | guard `item_type='packaging'` in `saveAllergenOverride`/`upsertProfile` + cascade reader + render `mode='na'` in allergens-tab-server | `technical/.../_actions/allergen-profile.ts`, `lib/technical/allergens/service.ts:74`, `allergens-tab-server.tsx` |
| S1-2 | Shipping | **No `packing→packed` transition** → entire ship/BOL/POD lane permanently blocked | add `sealShipment(id)` (packing→packed, needs ≥1 box) + "Seal shipment" button on pack screen | `shipping/_actions/ship-actions.ts:126`, `pack-actions.ts:71` |
| S1-3 | Inventory | **LP metadata edit silently overwrites `best_before_date`** with the expiry value (data corruption) | remove `best_before_date = coalesce($2::timestamptz, best_before_date)` from updateLpMetadata | `receipt-corrections-actions.ts:395` |
| S1-4 | Quality | **CCP deviation resolve never releases the linked auto-hold** → permanently stuck hold blocks warehouse | `resolveCcpDeviation` must `releaseHold(hold_id)` when present | `quality/_actions/ccp-deviation-actions.ts:269` |
| S1-5 | Scanner | **Pick destination sends raw text as `toLocationId` UUID** → 422, loop broken | add `resolveLocation()` + resolved-chip (copy putaway/move pattern), send `.id` | `scanner/pick/_components/pick-screen.tsx:442` |
| S1-6 | NPD | **Handoff "Promote to BOM" effectively always disabled** (user-reported): the `factory_specs` preflight blocker is never surfaced; promote also lacks `router.refresh()`; never advances stage to `launched` | surface each release-preflight blocker in `getHandoff` with remediation links + `router.refresh()` on success + decide auto-advance | `handoff-screen.tsx:249,422`, `release-preflight.ts:228`, `promote-to-production.ts` |
| S1-7 | Settings | **Lines don't display after adding a warehouse** (user-reported): `production_lines` has no `warehouse_id`; warehouse filter never lists a new warehouse | add `warehouse_id` to `production_lines` + `site_id` to `warehouses` (mig) + wire create forms + lines query/filter — **bundle into WAVE SW foundation** | `settings/infra/lines/page.tsx:216`, `lines-screen.client.tsx:261` |
| S1-8 | Production | **`registerDisassemblyOutput` orphaned** — full service + tests, zero UI callers (data-loss risk if disassembly WOs exist) | add WO-detail trigger gated on `bomType='disassembly'` + route handler — **OWNER: are disassembly WOs in scope this wave?** | `register-disassembly-output.ts:283` |

## Sev2 — broken-with-workaround / operator blockers

| ID | Area | What | File:line |
|----|------|------|-----------|
| S2-1 | Settings | Lines page "Bulk Deactivate" is a dead control (no onClick) | `lines-screen.client.tsx:387` |
| S2-2 | Settings | Sites: "Import Lines" button no-op (handler never passed); Primary-site toggle hardcoded disabled; operating-hours/HACCP read-only though `updateSiteSettings` exists | `sites-screen.client.tsx:247,452,458` |
| S2-3 | Inventory | Inventory browser shows only FEFO-available stock (received/reserved/blocked invisible) — title implies total on-hand (**owner: total vs pickable?**) | `inventory-actions.ts:32` |
| S2-4 | Inventory | LP detail "reserve"/"block" + expiry "Force block" are dead-ends (no desktop path to reserve/block an LP) | `lp-detail.client.tsx:490`, `expiry-dashboard.client.tsx:173` |
| S2-5 | Inventory | GRN line "Cancel receipt" renders for users lacking `warehouse.receipt.correct` (action rejects, but button shows) | `grns/[grnId]/page.tsx:269` |
| S2-6 | Inventory | LP metadata edit can't CLEAR expiry (empty string fails Zod + COALESCE keeps old) | `lp-metadata-edit-modal.client.tsx:164`, `receipt-corrections-actions.ts:394` |
| S2-7 | Planning | TO in `partially_received` shows ZERO action buttons (state-machine has the transitions; UI map omits them) | `to-detail-view.tsx:148` |
| S2-8 | Planning | TO ship insufficient-stock → generic "Persistence failed" (error key not mapped) | `transfer-orders/[id]/page.tsx:151` |
| S2-9 | Planning | SO lines hardcode `unit_price_gbp=1.0` (**owner: pricing source?**); user-selected UoM discarded (no column) | `shipping/_actions/so-actions.ts:534,537` |
| S2-10 | Scanner | "My line" WO filter is a tautology (never filters by session.lineId); labor clock-in state not hydrated (double clock-in) | `wo-list-screen.tsx:83`, `wo-execute-screen.tsx:63` |
| S2-11 | Production | Waste modal Confirm needs free-text `shift_id` (no picker); Pause needs free-text `lineId` for WOs without a line (**owner: mandatory?**) | `action-modals.tsx:1058,184` |
| S2-12 | Production | Genealogy `correctionOfId` dropped in mapping → "Reverse…" shows on already-reversed rows | `get-work-order-detail.ts:506` |
| S2-13 | Finance | "Refresh" button never refetches (orphan state) | `wo-cost-table.client.tsx:53` |
| S2-14 | NPD | `risks/page.tsx` `canWrite ?? true` → write controls show to users without `npd.risk.write` (action still rejects) | `risks/page.tsx:170` |
| S2-15 | NPD | C5 "allergens declared" hardcodes `audited:true`; C4 sensory hardcoded `required:false` (gates bypassed) | `evaluate.ts:141,143` |
| S2-16 | OEE | `/oee/andon` is a hard 404 (no stub) | route missing |

## Sev3/4 + stubs (polish / documented deferrals)
- NPD: breadcrumb not a link; approval shows approver UUID; single-approver hardcoded; post-promote list has no module deep-links (NPD #4,12,13,14,15).
- Settings: `/settings` index renders `null` (blank); several legacy redirect round-trips; `/settings/infra/machines` URL-only (NPD #14,15,16).
- Scanner: topbar avatar/menu dead on 11+ screens; sync badge hardcoded "ONLINE"; QA scan-ring tautology; Consume/Output home tiles both → WO list; `dev/scanner` orphan (Scanner #4,5,7,8,9).
- Production: duplicate "QA" column header; WO output LP shows UUID prefix; revalidatePath targets wrong route segment (client refresh saves it); Downtime "Log downtime" deferred (Production #1,2,7,10).
- Technical: BOM deep-link loses locale; no item→inventory / BOM→WO deep links (Technical #2,3,4).
- **Full `ModuleStubNotice` stubs:** `/scheduler`, `/multi-site`. **Partial stubs:** `/planning/import` (TO/WO cards), `/warehouse/print-history` (reprint), `/settings/infra/printers` (`upsertPrinter`), OEE dashboard advanced tabs.
- **Phantom RBAC perms** (seeded mig 192, no action/UI): `warehouse.lp.split/merge/block/ship/force_unlock`, `warehouse.fefo.override`.

## Consolidated owner decisions (batch for the owner)
1. NPD promote: auto-advance to `launched`, or keep a separate "Advance" click? (S1-6)
2. Disassembly WOs in scope this wave? (S1-8)
3. Inventory browser: total on-hand vs FEFO-pickable only? (S2-3)
4. Implement `warehouse.lp.reserve` + `warehouse.lp.block` desktop actions? (S2-4)
5. SO line pricing source: items master / customer price list / manual? (S2-9)
6. Waste `shift_id` + Pause `line_id` mandatory, or nullable? (S2-11)
7. Confirm deferrals (Watch/Duplicate/label-PDF/D365/downtime/NCR-CAPA/complaint-pickers) stay deferred.

---

## Fix-lane execution plan (Codex backend / Claude UI; sequenced to avoid shared-file clobbers)

**ROUND 1 (parallel — disjoint files):**
- **R1a [Claude]** Quality stale-UI: add `router.refresh()` + success callbacks to the 7 quality client islands (XC-1 / Quality #1-7). Client only.
- **R1b [Codex]** WAVE P packaging-allergens guard + `mode='na'` (S1-1). technical/items allergen files.
- **R1c [Codex]** `best_before_date` corruption + expiry-clear (S1-3 / S2-6). receipt-corrections only.

**ROUND 2 (after R1a — quality _actions free of R1a's islands):**
- **R2a [Codex]** revalidatePath in actions: quality (5 files), PO (create+transition), TO (whole file) + map TO insufficient_stock error + CCP hold-release (XC-1 backend + S1-4 + S2-8). All `_actions`.
- **R2b [Claude]** NPD handoff: surface preflight blockers + `router.refresh()` (S1-6).
- **R2c [Codex]** Shipping `sealShipment` packing→packed + pack LP code→UUID resolve (S1-2 / Shipping #7); **R2c-ui [Claude]** "Seal shipment" button.

**ROUND 3 (foundation + scanner):**
- **R3a [Codex+mig]** WAVE SW foundation: `warehouse_id` on production_lines + `site_id` on warehouses (mig 312) + wire create forms + lines filter (S1-7) — first slice of app-level site scoping.
- **R3b [Claude]** Scanner pick resolveLocation (S1-5) + labor hydration + my_line filter + QA ring + receive-PO onSubmit (Scanner batch).
- **R3c [Claude/Codex]** Sev2 settings dead controls (S2-1/2), TO partial-received buttons (S2-7), production genealogy correctionOfId (S2-12), finance refresh (S2-13).

**ROUND 4:** remaining Sev3/4 + stubs + the master-plan E-waves (E2B/E4A/E5/E8/E9/E10), each per the master plan.

---

## ⛔ CRITICAL — production build was BROKEN on main (found + fixed run-2, 2026-06-23)

`next build` (the Vercel production build) failed on `main` — meaning recent deploys very likely
FAILED and the "live" site was a stale older build. Three accumulated errors, all from recent
E-IO / E7 features, all now fixed:
1. **Client→server-only `pg` leak:** `technical/bom/_components/disassembly-bom-create.tsx` ('use client')
   value-imported `createDisassemblyBomDraft` from the `server-only` `_actions/disassembly.ts` (imports
   `pg` via `withOrgContext`) → pulled pg/tls into the client bundle. Fix: new `'use server'` boundary
   `bom/_actions/disassembly-client-actions.ts`; the client imports the action from there.
2. **`'use server'` file with a sync export:** `planning/_actions/forecasts.ts` exported a SYNC
   `buildForecastWeeks` — a `'use server'` file may export only async actions. Fix: dropped `export`
   (internal-only; no importers).
3. **`'use server'` file with a const export:** `purchase-orders/_actions/create-export-job.ts` exported
   `const PO_EXPORT_CSV_COLUMNS`. Fix: dropped `export` (internal-only; no importers).

Scanned both error classes repo-wide: these were the only occurrences. After the fix `pnpm --filter web
build` was re-run to green. **Owner: confirm the next Vercel deploy succeeds** — if deploys had been
failing since E7 (commit c744f350), the live site needs this fix pushed to catch up.
**Lesson:** add `next build` to the pre-push / CI gate — typecheck + vitest do NOT catch the
'use server' export rule or client-bundle leaks.
