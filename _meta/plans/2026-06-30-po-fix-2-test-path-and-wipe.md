# PO-fix-2 (2026-06-30) — owner test path + clean-slate wipe

Commit **997b4b56** on `main` (deploy verified READY before the wipe). Login: `admin@monopilot.test` / `Admin2026!!!`. App: https://monopilot-kira.vercel.app

This batch fixed 7 owner-reported issues. The DB for org -002 (Apex 22) was then **wiped to a clean field** (operational + master data only; login, roles, reference vocab, settings, UoM, NPD field-catalog, code-masks all kept). You re-enter everything from scratch and create the first WO + receive it. Each step below also says **what to verify** for the relevant fix.

## Re-entry order (each entity depends on the previous)

1. **Site** — Settings → Sites & lines → add a site (e.g. "Main"). (Site == warehouse entity.)
2. **Warehouse + locations** — Settings/Warehouse → add a warehouse for the site + at least one storage location (you need a receive location for the GRN).
3. **Supplier** — Planning → Suppliers → add a supplier (e.g. "WEB"), set its **currency** (GBP/EUR). ← used by fix #2.
4. **Material/component (RM/ING/PM)** — Technical → Materials (or Products) → create a raw material / ingredient / packaging item.
   - **FIX #1 (supplier on create AND edit):** on create you pick a supplier. Then **Edit** the same item from the list → the **Supplier** picker is now present in edit mode too (it was missing before). Pick/change the supplier → Save. ✅ verify the picker shows in edit.
   - **FIX #2 (spec price + currency prefill):** open the item detail → Supplier Specs tab → **Edit** a spec. The **Unit price** now pre-fills (from the spec's saved price, or the item's List price if none yet) and **Currency** pre-fills from the supplier (not blank/0.00). Add a price + (optional) document, Save. ✅ verify price + currency are pre-filled and editable.
5. **Product (FG) via NPD** — NPD → new project → fill brief incl. **Pack weight (g)** (e.g. 500) and **Packs per case** (e.g. 4) → formulation (recipe per 1 unit) → packaging.
   - **FIX #6 (scrap per packaging component):** in the **Packaging** editor, each component now has a **"Scrap %"** field ("Extra % requisitioned to cover packing loss"). Set e.g. box = 5%. Save. ✅ verify the field exists and persists.
   - Promote/handoff the project to create the FG item + production BOM.
   - **FIX #7 (base/order unit):** because pack weight is set, the FG is created **orderable in each/box** (output_uom = each), NOT silently kg. ✅ verify on the FG item that it is not forced to kg.
6. **BOM & recipe** — Technical → BOMs & recipes → open the FG.
   - **FIX #6 carry-through:** the packaging line shows your **Scrap %** in the Scrap column.
   - **FIX #5 (approve error styling):** click **Approve**. If a component's supplier spec isn't active/approved, the error is now a **compact, styled alert** with one line per failing component + readable labels (was a raw run-on string). Fix the supplier specs (activate/approve), then Approve succeeds. ✅ verify the error looks tidy.
   - **FIX #3/#4 (already correct, just verify):** on a **draft** BOM all actions are available. After it's **active**, click **Add component** → a notice says *"Saving creates a new draft version — the released version is never edited in place."* → it forks a new draft and does **not** auto-approve. ✅ verify that notice + that a new draft version appears.
7. **Work order** — Planning → Work orders → New WO → pick the FG.
   - **FIX #7 (order-unit override):** an **"Order unit"** selector appears (each / box / kg) when the item is convertible. Default = the FG's unit; switch to **box** to order in boxes. The quantity label + the live "= N kg" preview update accordingly. ✅ verify you can order in box vs each.
   - **FIX #6 (scrap → consumption):** create the WO; open its materials. The packaging component's **required qty is inflated by the scrap %** (e.g. 5% scrap → required = 1 / 0.95 ≈ 1.0526× per unit). ✅ verify required qty > nominal for the scrapped packaging line.
8. **Receive** — first create a PO to the supplier (Planning → Purchase orders), receive it (GRN) into the warehouse location → stock appears as license plates → then the WO can consume.
   - (Bonus, from the prior PO-fix wave) the PO line **unit price pre-fills** from the supplier spec/list price and the **item picker is filtered by the selected supplier**.

## Deferred (documented, not a blocker)
- **#7 explicit "base unit" dropdown in NPD packaging.** You asked for a conscious base-unit + items-per-box selector in NPD. Items-per-box already = "Packs per case" in the brief, and the order unit is now selectable on the WO (above) + auto-set to each for pack products. A *fully explicit* base-unit dropdown in NPD touches the formulation unit model (`qty_kg`) and is ambiguous enough to want your steer before building — so it's deferred. If you still want it after testing, tell me which of your three options (extra "each" unit / per-box / base-unit-box) you prefer and I'll build exactly that.

## NITs (low, non-blocking)
- New scrap arithmetic lacks a dedicated unit test (live-validated + cross-reviewed SHIP; coverage to add in a fast follow).
- Drizzle schema mirror (`packages/db/schema/packaging-components.ts`) not updated for `scrap_pct` (pre-existing drift pattern; runtime uses raw queries, no impact).
- Verify in your wave: the supplier-spec UI lets you add a **second** spec version (new validity window + price) for versioned pricing (from the prior PO-fix wave).

## Wipe details (what was cleared / kept)
- Scope: org_id = `00000000-0000-0000-0000-000000000002` ONLY (org -ee GDPR sentinel untouched).
- KEPT: organizations, users, roles, role_permissions, user_roles, org_security/auth policies, org_document_settings (code masks), all `Reference.*` vocab, npd_departments/field_catalog/department_field, unit_of_measure + conversions, waste/downtime categories, settings (integration/feature flags/scheduler/bom/signoff), reference_schemas, schema_migrations.
- WIPED: sites, warehouses, locations, suppliers, supplier_specs, items, products, bom_*, npd_projects + formulations + packaging_components + wip processes, license_plates + inventory + stock_moves, purchase/transfer/work orders + lines + outputs + materials + GRN, shipments/sales/customers, quality holds/inspections/NCR, maintenance, OEE, costing, audit/outbox/event logs, org_sequences (so doc numbers restart).
