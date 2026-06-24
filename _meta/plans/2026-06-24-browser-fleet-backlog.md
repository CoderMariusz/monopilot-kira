Below is the deduplicated, severity-grouped backlog.

# MonoPilot Kira — Browser Audit Backlog

## Summary

**92 raw findings → 85 deduplicated** (7 exact page+control duplicates merged).

**By severity:** L1 = 9 · L2 = 41 · L3 = 35

**By klass:** i18n-leak = 27 · logic-inconsistency = 16 · data-not-loading = 14 · crash-500 = 7 · render-then-reject = 6 · no-reverse = 5 · stale-after-write = 4 · dead-button = 4 · empty-table = 3 · cant-clear = 3 · missing-create = 3 · other = 1

### Systemic patterns (fix once, fix many)

1. **🔴 Quality/Warehouse e-sign asks for "account password" but verifies a PIN — 6 modules dead.** `signEvent({ pin: signature.password })` is hardcoded across holds-release, NCR-close, inspection-decision, spec-approve, complaint/CCP-deviation, and direct stock-adjust. Every PIN-enrolled user (incl. admin) is rejected with a raw English `PIN verification failed` on the PL locale. This is the single highest-leverage fix — one credential-resolution change unblocks 6 critical write flows. (`sign.ts:99-111`, `hold-actions.ts:825`, `ncr-actions.ts:614`, `inspection-actions.ts:798`, `direct-adjust-actions.ts:466`.)

2. **🔴 Technical module is entirely English on `/pl`** — Items, BOM, Routings, Factory-Specs, Allergens, Compliance render EN because `pl.json` mirrors the EN values for the whole `technical/*` namespace (standing task I18N-1 / #28). Plus a long tail of partial leaks everywhere else (NPD ICU literal, raw enums `received`/`completed`/`PENDING_TECHNICAL_APPROVAL`, EN 404 page that drops to `/en/dashboard`).

3. **🟠 `COALESCE`-can't-clear** recurs on every edit form: PO (fixed), but still live on TO notes, WO planned-start, Forecast cells, NPD trial notes. Clear-to-empty is silently swallowed server-side.

4. **🟠 Stale-after-write** (missing `router.refresh()`/revalidate) on: spec create, count-session create, NPD trial edit — DB persists, list shows nothing until hard reload.

5. **🟠 UUID-instead-of-name leak** across detail loaders: NCR `detected_by`, WO `Linia`, NPD handoff `Kod BOM` + packaging H1, settings location bin codes.

6. **🟠 Production "released WO" is a desktop dead-end** — release never writes a `wo_executions` 'planned' row, so Start is gated off, badge mislabels as 'Zaplanowane', and no Consume/Output affordance exists. Only the scanner can progress it.

---

## L1 — Critical (9)

### crash-500
- **`/pl/quality/ccp-monitoring`** · page load (RSC render) · L1 — Cold-chain board renders on every load → **crashes to error boundary on every load** (digest 1240281559). Root: `page.tsx:160` passes the next-intl translator function as a prop to client `CcpBoardClient` via `t={t as unknown as Translator}`; React refuses to serialize the function. Whole screen 100% dead. · `quality-ccp-monitoring-crash.png`
- **`/pl/planning/suppliers/{id}/scorecard`** · scorecard page · L1 — Renders supplier scorecard → **deterministic Server-Components crash** (digest 3219981815) on both a new supplier and seeded SUP-DEMO-01, so not data-dependent — every scorecard broken. · `planning-supplier-scorecard-crash.png`
- **`/pl/pipeline` (Kanban + Tabela)** · pipeline board/table + KPI tiles · L1 — Lists 9 real `npd_projects` → **list 500s on every load**; both views show 'Nie można załadować pipeline' and KPIs show 0. Root: Postgres `42P01 invalid reference to FROM-clause entry for table "pfa"` — alias `pfa` referenced but absent from FROM. Primary NPD entry point fully dead; projects reachable only by typing a UUID. (Merges the `/pl/pipeline` board-load-error duplicate.) · `npd-pipeline-list.png`
- **`/pl/pipeline/{id}/{stage}` (project detail layout)** · header chrome + 'Etapy projektu' stepper · L1 — On any fresh/hard load of brief/approval/formulation/packaging/handoff the **header + stage stepper are absent** (same RSC error); they appear only on SPA nav post-create. Refresh/bookmark/open-from-kanban leaves the user unable to navigate stages, Delete, or advance. · `npd-project-detail-brief.png`

### empty-table
- **`/pl/warehouse/counts/{id}`** · blind-count work-list / entry table · L1 — Should seed a count work-list from on-hand → **every count session is permanently empty and un-countable**. `createCountSession` inserts 0 `count_lines`, nothing seeds them, and there is no add-item / record-count UI; proven over an 11-LP/4192 kg warehouse. The per-line `approveAndApplyVariance` e-sign flow is unreachable. Cycle counting is fundamentally non-functional. · `wh-counts-full-count-empty-deadend.png`

### render-then-reject
- **`/pl/production/wos/{id}` (RELEASED WO)** · 'Rozpocznij' (Start) button · L1 — A DB-RELEASED WO should be startable → **Start permanently disabled** with hint 'release it in Planning first' though it is already released. Gate keys on `wo_executions.status==='planned'` (`gating.ts:31`) but the release flow never creates that row, so all 3 RELEASED WOs have `exec_status=null`. No desktop path to start a released WO. · `prod-wo-released-start-disabled.png`

### data-not-loading
*(Covered by the L1 pipeline crash above; the `42P01` data-not-loading entry and the crash-500 board entry are the same page+control and merged.)*

---

## L2 — High (41)

### logic-inconsistency (e-sign credential mismatch — systemic)
- **`/pl/quality/holds/{id}` (release modal)** · 'Hasło' e-sign field · L2 — Account password should apply the CFR Part 11 signature and release the hold → server rejects with EN 'PIN verification failed'; `releaseHold` passes `signature.password` as the `pin` arg (`hold-actions.ts:825`), verified against the enrolled PIN. Dead-end for every PIN-enrolled user. · `quality-hold-release-pin-error.png`
- **`/pl/quality/ncrs/{id}` (close modal)** · 'Zamknij NCR' e-sign field · L2 — Same root cause; `ncr-actions.ts:614` calls `signEvent({ pin: signature.password })`. Copy is even more explicit about "account password", worsening the broken promise. · live modal copy
- **`/pl/quality/specifications/{id}` (approve modal)** · '🔒 Zatwierdź specyfikację' · L2 — Account password should approve (in_review→active) → EN 'PIN verification failed', spec stuck. Same pattern as `complaint-actions.ts:689` / `ccp-deviation-actions.ts:258`. · approve-modal snapshot
- **`/pl/warehouse/adjustments/new`** · 'Hasło konta' → 'Zastosuj korektę' · L2 — Label says account password but `applyDirectAdjustment` → `signEvent({ pin: signature.password })` → `verifyPin`. Correct account password → `EPinFailedError` → full rollback. Operator following the label can never apply an adjustment. · `wh-adjustments-filled-increase.png`

### render-then-reject
- **`/pl/quality/inspections/{id}` (decision modal)** · 'Hasło konta' Zalicz/Odrzuć/Wstrzymaj · L2 — Correct account password → 'PIN verification failed'; decision not applied (`inspection-actions.ts:798`). Pass/Reject/Hold flow unusable for any PIN-enrolled user. · `quality-inspection-decision-pin-fail.png`
- **`/pl/technical/items/{code}` (edit wizard, invalid status transition)** · 'Create item' submit · L2 — Disallowed transition (Active→Draft, Blocked→Active) → generic **EN** 'Please check the values and try again.' on `/pl`; server returns `invalid_transition` but client collapses it, so the user can't tell status is the problem. · `tech-edit-draft-rejected.png`

### crash-500
- **`/pl/warehouse/grns/{grnId}` ('Anuluj przyjęcie' on idle session)** · cancel-receipt-line Server Action · L2 — Idle session should redirect to login → action POST is 307'd to `/pl/login?reason=idle`; the Server-Action client can't follow a 307 and throws, **full-page crash** instead of graceful re-auth. Any Server-Action submit on this surface is exposed. · `grn-line-cancel-crash.png` *(severity raised to L2 to group with the surface; was L3 in source)*

### no-reverse
- **`/pl/technical/items/{code}` (reactivate blocked item)** · Status dropdown + submit · L2 — Deactivate is one-way: a blocked item gets no Activate affordance, yet the Edit wizard offers Active/Draft/Deprecated and then server-rejects (`update-item.ts:63-67`). Genuine dead-end + render-then-reject. · `tech-reactivate-blocked-rejected.png`

### cant-clear (COALESCE — systemic)
- **`/pl/planning/transfer-orders/{id}` (draft)** · Edytuj → Notatki clear+save · L2 — Save succeeds (`updated_at` advances) but cleared note not persisted after reload; non-empty values persist. Server `COALESCE(notes, existing)`. · `planning-transfer-order-detail-draft.png`
- **`/pl/planning/work-orders/{id}` (draft)** · Edytuj → Planowany start clear+save · L2 — State-history row written but cleared date not persisted; only clear-to-empty fails. · `planning-work-order-detail-draft.png`
- **`/pl/planning/forecasts`** · week cell clear (FG1234 W26) · L2 — Clear POSTs 200 but reverts to old value after reload (×3); new values persist. COALESCE-can't-clear. · `planning-forecasts-cant-clear.png`

### stale-after-write (missing revalidate — systemic)
- **`/pl/quality/specifications` (create modal)** · + Utwórz specyfikację · L2 — DB row persists (AUDITSPEC-CC-001) but list still 'Wierszy: 0' until hard reload; create doesn't invalidate the list. · `quality-specifications-list.png`
- **`/pl/warehouse/counts` (create session modal)** · Nowa inwentaryzacja → Utwórz · L2 — New session persists but list still 'Liczenia: 1' until reload. · `wh-counts-create-modal.png`
- **`/pl/pipeline/{id}/trial` (edit)** · Edytuj save (clear notes) · L2 — DB row already `notes=NULL` but table row shows old value until reload; the CREATE path refreshes, EDIT doesn't. · DB trial 2c2d4076

### data-not-loading (UUID/identity/empty leaks)
- **`/pl/quality/ncrs/{id}`** · 'Wykrył:' (detected_by) field · L2 — Should show display name → renders raw UUID; `detected_by` not joined to a name (topbar resolves the same id to 'Apex Admin'). (Merges the two duplicate NCR detected-by findings.) · `quality-ncr-detail.png`
- **`/pl/quality/complaints` (create modal)** · free-text 'Klient' + auto number · L2 — Customer name is concatenated into `batch_ref` and `customer_id` stays NULL ('Brak klienta'); `complaint_number` is NULL ('—') though the spawned NCR auto-numbered. Customer lost + batch ref corrupted. · `quality-complaints-list.png`
- **`/pl/warehouse/grns` (list)** · 'Pozycje' line-count column · L2 — Every row '—'; `grns/page.tsx:110` hardcodes `itemCounts={{}}` and `listGrns` never counts lines (data exists: 1–2 `grn_items`/GRN). Same pattern as products 'Linia'. · `grn-list.png`
- **`/pl/settings/infra/locations`** · FG L4 bin row labels · L2 — Shows uppercased ltree segment 'BIN_1'/'BIN_2' instead of DB code `BIN-A1-01`/`BIN-A1-02` (public hierarchy shows them correctly) — real code unrecoverable from the management screen. · `wh-loc-02-settings-infra-locations-i18n-leak.png`
- **`/pl/planning/work-orders/{id}` (detail header)** · 'Linia' field · L2 — Renders raw production-line UUID though list + edit-dropdown resolve the name ('DEMO-LINE-1'/'AUDIT2-LINE'); detail loader never resolves it. · `planning-work-order-detail-draft.png`
- **`/pl/technical/compliance`** · per-regulation 'open gaps' count · L2 — All 5 cards render 'NaN open gaps' (coverage list + 19-row table compute fine, so source data exists). · `tech-compliance-dashboard.png`
- **`/pl/pipeline/{id}/handoff` (launched)** · 'Docelowy BOM' → 'Kod BOM' · L2 — Raw UUID instead of a BOM code (SKU row directly below resolves correctly). · `npd-handoff-launched.png`
- **`/pl/pipeline/{id}/packaging`** · page H1 · L2 — H1 = 'Opakowania — {project UUID}'; raw UUID leaks into the heading instead of project name/code. · browser_evaluate
- **`/pl/shipping/shipments/{id}` (after Generate-BOL)** · 'Referencja BOL' row · L2 — Value cell echoes its own label ('Referencja BOL') because `bolRef`/`bolHref` are null on page load (`shipment-ship-controls.tsx:337`). · `ship-05-shipment-detail-delivered.png`
- **`/pl/shipping` (generateBol action)** · `bol_pdf_url` write · L2 — Stores `JSON.stringify(bolPayload)` (metadata) instead of a PDF URL (`ship-actions.ts:288`); no PDF ever generated, so `documentUrl()` returns null and there's no real BOL link/download anywhere. · DB `bol_pdf_url` = JSON object

### empty-table
- **`/pl/quality/inspections/{id}`** · 'Parametry badań' table + 'Zapisz wyniki' · L2 — Every inspection shows 'Brak zarejestrowanych parametrów' and a permanently-disabled save; manual-create offers no spec linkage and there are 0 active specs, so a manual inspection can never have measurable parameters. Record-results half is non-functional. · `quality-inspection-detail-no-params.png`

### logic-inconsistency
- **`/pl/warehouse/inventory` (Wg lokalizacji tab)** · per-location 'Razem' total · L2 — Sums mixed UoM into one unitless number (LOC1 = 567.15 kg + 3545 pcs = 4112.150000, no unit); `getInventoryByLocation` groups by location only with no `uom` field. Aggregate is meaningless for mixed-UoM locations. · `wh-03-inventory-by-location.png`
- **`/pl/warehouse/grns/{grnId}` (header)** · GRN lifecycle action (Complete/Cancel) · L2 — No GRN-level complete/cancel anywhere (only per-line); all 6 GRNs stuck 'draft' forever despite goods received + LPs created. Zakończone/Anulowane tabs are permanent dead-ends. · `grn-detail.png`
- **`/pl/technical/bom` (list)** · status tiles + filter tabs · L2 — `technical_approved` ('✓ Approved') has no tile and no tab, so Approved BOMs are uncounted/unfilterable (tiles sum 8 vs 'All 9'). · `tech-bom-list.png`
- **`/pl/production/wos/{id}` (RELEASED header)** · status badge · L2 — A RELEASED WO renders badge 'Zaplanowane' (derives from runtime exec status null→planned instead of `work_orders.status`), reinforcing the wrong Start hint. · DB status=RELEASED
- **`/pl/production/wos/{id}` (desktop consume, RELEASED)** · Start/Consume/Output/Waste · L2 — Released WO is a dead-end: Start disabled (wrong hint), Consume tab has no 'Zarejestruj zużycie', no Output/Waste; only Anuluj + Skanuj LP enabled. · live eval
- **`/pl/production/wos/{id}` (desktop Consume modal, IN_PROGRESS)** · 'Zarejestruj zużycie' submit · L2 — Failure shows generic 'Nie można zarejestrować zużycia.' with no reason (over-consume / no stock / needs approval). Every active-WO component has 0 available LP, so the only usable path dead-ends opaquely. · `prod-wo-consume-error.png`
- **`/pl/finance`** · WO actual-cost 'Wyjście kg' / 'Koszt / kg' · L2 — Completed WO that produced 798 kg shows 'Wyjście kg = 0' / 'Koszt / kg = b/d' because Finance reads empty `wo_outputs` while `work_orders.actual_qty=798`; Reporting (reads `actual_qty`) shows 798 — same WO, two numbers. · `deepscan-finance-wo-cost-all-zero.png`
- **`/pl/yard` vs `/pl/yard/appointments`** · scheduled-time display · L2 — Same appointment (stored 08:00+00 = 10:00 Warsaw) shows 09:00 on the board and 08:00 on the list, neither correct: board uses runtime TZ (`yard-board.client.tsx:142`), list hardcodes `timeZone:'UTC'` (`appointments-view.client.tsx:144`). · `deep-yard-board.png`

### render-then-reject
- **`/pl/technical/factory-specs` (bundle-approval, already-released spec)** · Reject radio + submit · L2 — Reject is enabled on a terminal `approved_for_factory` spec, accepts a reason, then server refuses with vague 'Could not complete the action. Please try again.'; Reject also skips the e-sign PIN Approve requires. · `tech-factory-spec-reject-approved-error.png`

### missing-create
- **`/pl/shipping` (SO create modal)** · line items table (no unit price) · L2 — No unit-price field; every line persists `unit_price_gbp=0`, header `total_amount_gbp=null`, list 'Razem' = '0,00 GBP' for all orders. Commercially incomplete. · `ship-01-so-list.png`
- **`/pl/scheduler/changeover-matrix`** · matrix grid / first-entry create · L2 — With 0 rows the axes (derived only from existing rows) are empty → permanent empty state, no clickable cell, no add affordance; write action unreachable. Empty hint is misleading (allergen profiles already exist and don't populate the matrix). Downstream: scheduler 'Łączny koszt przezbrojeń: 0'. · `deep-scheduler-changeover-matrix.png`

### dead-button
- **`/pl/planning/purchase-orders/{id}` (after reopen)** · Wyślij + Anuluj transition buttons · L2 — After 'Przywróć do wersji roboczej' the forward actions render but stay disabled until reload: `onReopen` success path never calls `setReopening(false)` (`po-detail-view.tsx:298-316`), and `router.refresh()` preserves client state. · `po-reopen-dead-transitions.png`
- **`/pl/technical/allergens-config`** · matrix cell click drill-down · L2 — Subtitle promises 'Select a cell to see source ingredients' but clicking a cell does nothing (no popover/panel/state change). Dead control across the matrix. · `tech-allergens-config-matrix.png`
- **`/pl/pipeline/{id}/handoff` (launched)** · 'Przejdź do Uruchomiony →' CTA · L2 — Href is identical to the secondary 'Wróć do projektu' link (both →`/brief`); performs no status transition. No real 'mark launched' action exists. · `npd-handoff-launched.png`

### i18n-leak (whole-page / high-visibility EN-on-PL)
- **`/pl/technical/items` (list + detail + wizard + import)** · all body copy · L2 — Entire Items master renders EN on `/pl`; root cause: `pl.json` stores EN strings as the PL values for the whole `technical/items` namespace (task I18N-1 / #28). · `tech-items-list.png`
- **`/pl/technical/bom` + `/pl/technical/routings`** · entire UI text · L2 — Whole BOM + Routings UI EN on `/pl` (lists, headers, tabs, all modal copy); only a few PL strings leak in. · `tech-bom-list.png`, `tech-routings-list.png`
- **`/pl/technical/factory-specs` (list + review + bundle dialogs)** · all chrome · L2 — Hardcoded EN throughout; only '+ Nowa specyfikacja', the create modal and the e-sign block are PL. Plus raw enum 'PENDING_TECHNICAL_APPROVAL' rendered verbatim in the Review dialog. · `tech-factory-specs-list-english.png`
- **`/pl/technical/allergens-config`** · whole page · L2 — Fully EN on `/pl` (H1, 14 column headers, legend). · `tech-allergens-config-matrix.png`
- **`/pl/technical/compliance`** · whole page · L2 — Fully EN on `/pl` (H1, table headers, issue strings, severity labels, 'Route →'). · `tech-compliance-dashboard.png`
- **`/pl/settings/infra/locations`** · workspace + Add/Edit modals · L2 — ~13 hardcoded EN strings on `/pl` (H1 'Locations hierarchy', 'Locations (8)', filters, badges, modal helper text). Partial leak isolated to this component. · `wh-loc-02-...-i18n-leak.png`
- **`/pl/settings/infra/locations`** · breadcrumb + 'Open full LP list →' links · L2 — Two links hardcoded to `/en` (`/en/warehouse`, `/en/warehouse/lps`) → cross-locale jump into the EN app. · `wh-loc-02-...-i18n-leak.png`
- **`/pl/quality/capa` (+ any unknown `/pl/*`)** · 404 page · L2 — 404 renders fully EN on `/pl` and 'Back to dashboard' points to `/en/dashboard`, sending a PL user into the EN app (`<html lang=pl>`). (Same EN-404 also reproduced under `/pl/maintenance/{id}`.) · `quality-capa-404-english.png`
- **`/pl/pipeline/{id}/formulation`** · 'Alergeny' detected-allergen alert · L2 — Raw ICU plural literal (`{count, plural, one {…} …}`) leaks verbatim into the alert; count never interpolated. High-visibility food-safety banner. · `npd-formulation.png`
- **`/pl/pipeline/{id}/handoff` (launched)** · handoff checklist · L2 — All 6 items EN ('Recipe locked', 'Pilot production successful', …). · `npd-handoff-launched.png`
- **`/pl/pipeline/{id}/gate` (G4)** · gate checklist item labels · L2 — All 17 checklist items EN under PL headings; blocking-items alert lists them in EN. · `/gate` snapshot
- **`/pl/warehouse/license-plates` (list + detail badge)** · `received` status badge · L2 — Raw EN enum 'received' on `/pl` (page status map omits `received`; falls through to raw enum). 8 of 14 LPs affected. *(L3 in source; grouped here as a visible enum-leak across list+detail.)* · `wh-04-lp-received-i18n-leak.png`

---

## L3 — Medium (35)

### no-reverse
- **`/pl/planning/purchase-orders/{id}` (cancelled PO)** · Status panel · L3 — Cancelled PO has zero actions; `PO_TRANSITIONS.cancelled=[]` and reopen only accepts `sent`. A mis-cancelled PO (even from draft, no receipts) is unrecoverable. · `po-detail-cancelled-no-reopen.png`
- **`/pl/planning/work-orders/{id}` (released)** · status/action area · L3 — Released WO offers no 'Cofnij wydanie' / Anuluj on the Planning detail; a mis-released WO can't be walked back from Planning (compare in-transit TO which exposes Anuluj). · `planning-work-order-detail-released.png`
- **`/pl/technical/routings`** · version row actions + Edit modal · L3 — No delete/discard anywhere; a routing created in error (even published) is unremovable from the UI (had to be deleted via SQL), inconsistent with deletable BOM versions. · `tech-routings-list.png`
- **`/pl/pipeline/{id}/trial`** · trial row actions · L3 — Only 'Edytuj'; no delete/void for a mistakenly-logged trial (cleanup needed raw SQL). · trial row

### render-then-reject
- **`/pl/warehouse/license-plates/{id}` (consumed/terminal LP)** · Zarezerwuj + Zablokuj buttons · L3 — Reserve/Block stay enabled on a 0-available consumed LP; modal shows 'Dostępne: 0' yet accepts qty 5 and enables submit; server rejects. Other 5 actions correctly disabled, so these two escape the state gate client-side. · `wh-02-lp-detail.png`

### dead-button
- **`/pl/warehouse/adjustments/new`** · failed-e-sign error feedback · L3 — Failed e-sign surfaces generic 'Nie udało się zastosować korekty. Spróbuj ponownie.'; the outer catch maps any signEvent error to code 'error', so the dedicated `esign_failed` copy + PIN message-sniffing are dead code. User retries the wrong credential with no guidance. · `wh-adjustments-filled-increase.png`
- **`/pl/technical/items` (list)** · per-row 'Allergens' quick-action · L3 — Link href is the bare detail URL (no `?tab=allergens`), so it lands on Overview, identical to clicking the code. · `items-manager.client.tsx:136`

### logic-inconsistency
- **`/pl/quality/complaints/{id}` (post-convert)** · 'Powiązany NCR' section · L3 — After a successful convert (success banner + working 'Zobacz NCR'), the section body still shows 'Potrzebujesz uprawnienia do tworzenia…' — misleading permission copy. Cosmetic. · `quality-complaint-detail.png`
- **`/pl/technical/items/{code}` (edit modal)** · title/steps/submit · L3 — Edit reuses the create wizard verbatim ('Create item' title + submit, 'Ready to create…') while editing; update does persist but every label says "create". · `tech-item-detail-fg1.png`
- **`/pl/technical/items` (detail + wizard step 3)** · price/cost currency · L3 — List/detail use zł ('Cost / kg (zł)') but the wizard field is 'List price (GBP / base UoM)' (`list_price_gbp`) — GBP on a zł deployment, no FX context. · `tech-item-detail-fg1.png`
- **`/pl/technical` (dashboard)** · quick-action / section / D365 links · L3 — Several hrefs drop the `/pl` prefix (`/technical/items?modal=create`, `/settings/integrations/d365`, section cards); work only via default-locale rewrite, risk a locale switch on non-default locales. · `/pl/technical` snapshot
- **`/pl/pipeline/{id}/brief` (launched)** · brief editor + 'Zapisz zmiany' · L3 — Brief fully editable on a launched project (handoff page says 'Receptura jest zamrożona'); no lock/warning. · launched-brief.yml
- **`/pl/pipeline/{id}` + `/{id}/{stage}` (soft-nav)** · bare-project redirect + stage resolution · L3 — Non-deterministic wrong-destination redirects (bare id → `/settings/schema`; `/sensory` → `/settings/company`) correlating with prefetched routes — a soft-nav/prefetch race; hard reload always resolves correctly. · observed redirects
- **`/pl/production/wos/{id}` (IN_PROGRESS header)** · 'Brak konsumpcji' badge vs Consume tab · L3 — Header warns 'no consumption' (reads `wo_material_consumption`, 0 rows) while the Consume tab shows 72 kg/180% (reads `wo_materials.consumed_qty`) — two sources contradict, both render. · DB
- **`/pl/reporting`** · 'Ukończone ZP' vs 'Produkcja (kg)' · L3 — Headline kg doesn't reconcile with completed-WO count/detail (7d: 0 completed but 226.15 kg; month: 1 WO @798 kg but headline 1529.75). Headline aggregates all output; count/detail count only fully-completed WOs. · `deepscan-reporting-dashboard.png`

### other
- **`/pl/warehouse/adjustments/new`** · 'Numer partii' input · L3 — No `autocomplete=off`/`name`, so browser autofills the account email into the batch field (value='admin@monopilot.test' on load) — would write garbage onto the new LP's `batch_number`. · `wh-adjustments-new.png`

### missing-create (deferred-feature placeholder)
- **`/pl/quality/ncrs/{id}`** · 'CAPA P2' section · L3 — Hardcoded placeholder ('CAPA — Faza 2 (Epic 8G). Nie przypisano CAPA.'); no CAPA list/create/resolve anywhere, `/pl/quality/capa` → 404, despite two screens advertising CAPA. · `quality-ncr-detail-capa-p2.png`

### crash-500
- **`/pl/shipping/shipments/{id}`** · page hydration on load · L3 — React #418 hydration text-content mismatch (likely date/time locale formatting of lifecycle timestamps); page renders but SSR/CSR inconsistent. · console error

### data-not-loading
- **`/pl/shipping/shipments` (list + detail)** · 'Waga' total weight · L3 — `total_weight_kg` null even for delivered shipments with packed LPs; list 'Waga' all '—', detail has no weight row. Weight never computed at pack/ship. · `ship-04-shipments-list.png`
- **`/pl/oee`** · Śr. OEE tile + OEE%/A%/P% columns + Andon OEE · L3 — All '—' (only Q% populated) because `oee_snapshots.performance_pct`/`oee_pct` are NULL (`ideal_cycle_time_sec` NULL) — the module's flagship metric never displays; a 'brak normy cyklu' hint would beat a bare '—'. · `deepscan-oee-dashboard.png`

### i18n-leak (partial / label / link)
- **`/pl/planning/forecasts` (clear path)** — covered above under cant-clear.
- **`/pl/technical/items/{code}` (Commercial & weight panel + header/tabs)** · field labels · L3 — Partial split: pack-hierarchy fields PL, original item fields EN ('Base UoM', 'Weight mode', 'Shelf life'); header 'Wycofaj' next to 'Edit'/'Deactivate'. · `tech-item-detail-fg1.png`
- **`/pl/technical/nutrition`** · macronutrient row labels · L3 — Chrome is PL but the 7 nutrient rows are EN (Energy, Fat, Saturates, Carbohydrate, Sugars, Protein, Salt). · `tech-nutrition-panel.png`
- **`/pl/technical/cost`** · '↻ Recompute' button + confirm dialog · L3 — Trigger + dialog fully EN on an otherwise-PL page. · `tech-cost-recipe-page.png`
- **`/pl/planning` (dashboard)** · alert-card CTA links · L3 — All three alert lists (ZP/ZZ/transfers) use hardcoded 'Zobacz ZP →'; hrefs correct, label wrong. · dashboard snapshot
- **`/pl/planning/suppliers/{id}` (detail)** · scorecard link · L3 — Renders raw i18n key 'detail.scorecard' as the link text (entry point to the crashing scorecard). · `planning-supplier-detail-i18n-leak.png`
- **`/pl/planning/mrp` + shared Modal** · status badge + close aria-label · L3 — MRP shows raw EN 'completed'; shared Modal close button `aria-label='Close'` (seen on Forecasts CSV + create-supplier modals). · `planning-mrp-results.png`
- **`/pl/pipeline` (list / wizard / brief / approval)** · static labels · L3 — EN-on-PL: KPI tiles 'Active projects / Awaiting approval / At risk', 'Pack weight (g)', 'Delete', approval fix-hints ('na etapie Nutrition'…), 'Approver'. · `npd-projects-list.png`
- **`/pl/pipeline` (list)** · '+ New project' link · L3 — Href = `/en/pipeline/new` on a `/pl` page (works only via middleware rewrite; breaks copy-link/SSR/no-JS). · `npd-projects-list.png`
- **`/pl/pipeline/{id}/formulation`** · 'Porównaj wersje' dialog · L3 — Dialog EN ('Compare versions', 'Version A/B', 'Pick two different versions to compare.') inside an otherwise-PL workbench. · compare-versions snapshot
- **`/pl/reporting`** · Quality + Procurement Status columns · L3 — Raw EN enums ('open'/'pending'/'closed_in_window'; 'cancelled'/'draft'/'partially_received'/'received'/'sent'). · `deepscan-reporting-dashboard.png`
- **`/pl/oee/andon`** · board-card 'Ostatnia aktywność' timestamp · L3 — US-English `toLocaleString` + runtime TZ ('6/24/2026, 2:00:15 PM') while the Andon detail formats correctly ('24 cze, 15:00'); leak isolated to the board-card. · `deepscan-oee-andon-board.png`