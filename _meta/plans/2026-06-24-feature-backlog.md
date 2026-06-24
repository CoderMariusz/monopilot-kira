# MonoPilot Kira — Feature backlog (schema-ahead-of-implementation), 2026-06-24

Scoped read-only (Codex) by cross-checking `packages/db/migrations` `CREATE TABLE` against
`apps/web/**/_actions` writers. "Stub" = table + RBAC exist, no production action/UI. This is
the "features to build" list the owner asked for. (Bug backlog is separate — deep-scan fleet.)

## P1 — operationally blocking
- **Customer child-domain + SO ship-to.** `createCustomer` IS built and the SO modal has a working
  customer picker. GAP: `customer_contacts` / `customer_addresses` / `customer_allergen_restrictions`
  (mig 211) have schema but no writer; SO-create inserts `customer_id` but NOT the selected
  `shipping_address_id`. Need: child-domain writers + customer detail/edit UI + SO ship-to picker. (M)

## P2 — CMMS / Maintenance (mig 201; only MWO open→in_progress→completed is wired)
- Maintenance master data: `maintenance_settings`, `technician_profiles`, `equipment` (action reads
  machines, not equipment). (M)
- PM schedules / due-generation engine: `maintenance_schedules` (read-only today). (L)
- MWO checklist execution: `mwo_checklists`. (M)
- LOTO apply/release + dual e-sign SoD: `mwo_loto_checklists`, RBAC `mnt.loto.apply/clear`. (L)
- Spare parts catalog/stock/txns/consume: `spare_parts`, `maintenance_spare_parts_stock`,
  `spare_parts_transactions`, `mwo_spare_parts`. (L)
- Calibration instruments + records + dual signoff + cert: `calibration_instruments`,
  `calibration_records`. (L)
- Sanitation checklists + allergen-change gate: `sanitation_checklists`. (L)
- Downtime→MWO auto-trigger / work-request triage: MWO `source` enum has auto_downtime/oee_trigger +
  `downtime_event_id` FK, but `createMwo` only makes `open`. (M)
- Maintenance meters/usage counters: no meter table — add if usage-based PM is wanted. (L)

## P3 — other orphan schema (table exists, no writer)
- Shipping waves/pick-lists/BOL/SSCC counters (mig 211). (L)
- SO line-level allocation bridge `sales_order_line_allocations` (mig 288) — align to it or retire (SO
  alloc currently writes `inventory_allocations`). (M)
- Reporting builder/saved-configs/scheduled-export (mig 213) — reporting is read-only today. (L)
- Finance cost master + costing ledger: `standard_costs`, `wo_actual_costing`, `inventory_cost_layers`,
  `item_wac_state`, `cost_variances` (mig 199). (L)
- Rough-cut capacity planning `capacity_plans(_lines)` (mig 179). (M)
- WO dependency graph `wo_dependencies` (mig 177) — needs cycle detection. (M)
- Scheduler config/version governance (mig 204). (M)
- OEE config: alert thresholds / non-production days / big-loss categories (mig 203). (M)
- Downtime & waste reason catalogs CRUD (mig 183) — screens read them, no writer. (S)
- Lab results `lab_results` (mig 162). (M)
- Technical sensory evaluations (migs 166/237). (M)
- Allergen profile governance / overrides / contamination-risk CRUD+approval (mig 161). (L)
- Multi-site registry + inter-site transfers (mig 215). (L)
- Rule registry + dry-runs (mig 039). (M)
- D365 sync run/job control actions (migs 065/164) — catalog reads only. (M)
- Security admin: SSO/SCIM/IP-allowlist/policies writers + UI (migs 017/063/044/053/224). (L)
- Master-data catalogs without writers (warehouses, tax_codes, role_categories, etc.). (M)
- Legacy placeholder tables `lot/work_order/quality_event/shipment/bom_item` (mig 014) — confirm
  deprecation / remove. (S)

## P4 — confirmed deferred "coming soon" (per owner)
- Integrations catalog connect/browse (non-D365) — disabled "Coming soon" affordances. (M)
- MFA recovery-code flow — button exists, `verifyMfaCode` has no recovery branch. (S)
- Avatar/profile image upload — UI text only, no schema column / action. (M)

---
NOTE: most of these are deliberate product decisions (build order, scope) — they are NOT autonomous
build targets. Owner prioritizes; then each becomes a scoped slice (schema is mostly already there).
