# R3 Audit — 01-npd, 06-scanner-p1, 11-shipping (read-only)

Date: 2026-05-14
Reviewer: R3
Scope: atomic-task JSONs (manifests + task bodies) for the three assigned modules.

## Section 1 — Executive summary

### Counts

| Module        | Reviewed | Pass (no findings) | With issues | Verdict |
| ------------- | -------: | -----------------: | ----------: | :-----: |
| 01-npd        |     101  |                 97 |           4 | AMBER   |
| 06-scanner-p1 |      49  |                 49 |           0 | GREEN   |
| 11-shipping   |      32  |                 19 |          13 | AMBER   |
| **Totals**    |   **182**|            **165** |      **17** | AMBER   |

All 182 task JSON files parse. Top-level shape and `pipeline_inputs` schema are present on 180/182 (T-099, T-100 in 01-npd are skeletal).

### Top-5 systemic issues

1. **(11-shipping) Per-task `cross_module_dependencies` to `01-npd/T-001` are missing on FG/allergen/customer tasks.** The manifest declares the cross-dep at module level, but individual tasks (T-001, T-002, T-003, T-004, T-005, T-010, T-011, T-014, T-015, T-018, T-026, T-028, T-030) that reference product/allergen/FG concepts do not list `01-npd/T-001` in their per-task `cross_module_dependencies`. Downstream waves rely on this for ordering & coverage rollups.
2. **(01-npd) T-099 and T-100 are skeletal Wave0-hardening stubs.** No `source_prd`, no `prd_refs`, generic placeholder AC/test_strategy, no concrete test command, no `routing_hints`/`checkpoint_policy.closeout_requires`. They diverge from gold-standard shape and would be rejected by the ACP pipeline expansion contract.
3. **(01-npd) T-089 GDPR erasure is not wired to foundation T-113 (`@monopilot/gdpr` registry).** Function is implemented locally; dependencies are intra-module only (T-001/T-054/T-063/T-080/T-083). Per the audit checklist, NPD GDPR erasure must register tables with the foundation registry rather than ship a private SECURITY DEFINER function.
4. **(01-npd) Three UI tasks (T-076, T-094, T-095) lack `prototype_match: true`.** T-076 is correctly tagged `deferred/blocked` (Sensory is Technical-owned — acceptable), but T-094 (FG terminology refactor sweep) and T-095 (G3 create/map FG candidate) are labeled `T3-ui` yet have no prototype anchor. Either reclassify as `T-refactor`/`T4-wiring-test` or add prototype-pattern reference per UI-PROTOTYPE-PARITY-POLICY.md.
5. **(11-shipping T-029 wording risk)** the prompt includes the literal string `tenant_id ←→ org_id mapping per Wave0 v4.3` in the implementation contract. Reading agents may misinterpret as "create a tenant_id column"; the AC and risk-red-lines correctly mandate `org_id NOT NULL` and `Do not name business-scope column tenant_id`. Tighten the prompt to drop the bidirectional arrow, but no schema risk — purely prompt clarity.

### Module verdicts

- **01-npd: AMBER.** Gold-standard tasks (T-001, T-006, T-052, T-089) are well-formed; T-001 correctly uses `app.current_org_id()` (post-Pt1 fix), T-006 uses `org_id` (not `tenant_id`). The four flagged tasks are non-blocking but should be fixed before next wave dispatch. SSCC/lot/expiry trail to warehouse + production + shipping is implicit (T-001 product table) but not explicitly enumerated as a cross-module artifact dependency list — see Section 3.
- **06-scanner-p1: GREEN.** Scope is strictly P1 (receive/putaway/pick/consume/register). No P2 drift (no affirmative `transfer`/`replen`/`cycle-count` usage). GS1/SSCC tasks depend on Settings. Permission enum task present. Bcrypt-PIN auth (T-006/T-008) is in scope and does NOT need foundation T-124 e-sign — e-sign is for signing-bound critical events, not session login.
- **11-shipping: AMBER.** Core architectural posture is correct (FG SSOT via `01-npd/T-001`, allergen via 02-settings, SSCC via `organizations.gs1_company_prefix`, D365 export-only via R15 adapter excluding `factory_release_state`, POD SHA-256 + BRCGS 7y, quality-hold HARD BLOCK on critical via T-013). Per-task cross-module dep listing is incomplete on FG/allergen tasks but the manifest covers it.

## Section 2 — Per-task findings

| Task | Module | Severity | Finding |
| --- | --- | --- | --- |
| T-099 | 01-npd | HIGH | Skeletal stub. Missing `source_prd`, `prd_refs`, `routing_hints`, `closeout_requires`; generic AC; no concrete test command. Rebuild from gold-standard. |
| T-100 | 01-npd | HIGH | Same as T-099. |
| T-089 | 01-npd | MED | GDPR erasure ships local SECURITY DEFINER function — does not register with foundation T-113 GDPR registry. Add `00-foundation/T-113` to dependencies + registration step. |
| T-076 | 01-npd | LOW | `T3-ui` but no prototype_match. Acceptable: labelled `deferred` + `blocked` (Sensory is Technical-owned). Suggest changing `task_type` to `docs`. |
| T-094 | 01-npd | LOW | `T3-ui` refactor sweep but no single prototype. Reclassify `task_type: T-refactor` and add UX/PRD spec anchor per parity policy §"Spec-driven source". |
| T-095 | 01-npd | LOW | `T3-ui` G3 spine task without prototype. Reclassify to `T4-wiring-test` (it is an integration test) and add UX flow anchor. |
| T-001 | 11-shipping | LOW | Refers to FG product_id but missing `01-npd/T-001` in `cross_module_dependencies` (allergen cascade implicit). Add explicit cross-dep. |
| T-002..T-005 | 11-shipping | LOW | Customer schema/UI tasks reference allergen_families + product. Missing explicit `01-npd/T-001` cross-dep. |
| T-010 | 11-shipping | LOW | SO detail page references product/allergen. Missing explicit `01-npd/T-001` cross-dep. |
| T-011 | 11-shipping | LOW | inventory_allocations FEFO query — missing explicit `01-npd/T-001` cross-dep (variance_tolerance_pct + allergen). |
| T-014 | 11-shipping | LOW | allocation_global_page UI — missing 01-npd cross-dep. |
| T-015 | 11-shipping | LOW | pick_lists schema — missing 01-npd cross-dep. |
| T-018 | 11-shipping | LOW | Shipments + SSCC schema — has 02-settings + warehouse + foundation cross-deps but missing explicit `01-npd/T-001` for product trail. (Has `T-006` intra-dep which transitively depends — acceptable but make explicit.) |
| T-026 | 11-shipping | LOW | RMA references product/customer — missing explicit 01-npd cross-dep. |
| T-028 | 11-shipping | LOW | shipping_settings_page references FG concepts — missing explicit 01-npd cross-dep. |
| T-029 | 11-shipping | LOW | Prompt clarity: `tenant_id ←→ org_id mapping` arrow may confuse readers. AC + risk-red-lines are correct. Reword to "`org_id` (PRD wrote `tenant_id` per pre-Wave0 — corrected per Wave0 v4.3)". |
| T-030 | 11-shipping | LOW | shipping_dashboard refs FG — missing explicit 01-npd cross-dep. |

No issues found in any 06-scanner-p1 task.

## Section 3 — Cross-module integration gaps

### FG SSOT chain (01-npd → 11-shipping)

- **01-npd/T-001** is the canonical FG (product) table. Confirmed: uses foundation `app.current_org_id()`, RLS + FORCE RLS, fa view as read-only compatibility alias (security_invoker=true). ✅
- **11-shipping** consumes `product.product_id`, `product.variance_tolerance_pct` (for V-SHIP-PACK-04), and the allergen cascade via `customer_allergen_restrictions` joined to product allergen attributes. The manifest's `cross_module_dependencies."01-npd"` correctly names this. ✅
- Per-task linkage is **inconsistent** — see Section 2 LOW findings; not architecturally broken, but coverage rollups will under-count.

### Allergen cascade

- Settings `allergen_families` reference table → customer_allergen_restrictions → SO line validation (V-SHIP-SO-03) → allergen_override audit. T-001/T-008/T-029 references confirmed. ✅
- `01-npd` allergen attribute owned at product table — confirmed in T-001 schema (extension columns + ext_jsonb). ✅

### BOM SSOT

- NPD T-100 (BOM tab + formulation version read models) is the BOM SSOT task — currently a stub. Risk: downstream 11-shipping doesn't consume BOM directly (BOM consumption is 08-production / 05-warehouse territory), so the gap here is contained to NPD.

### SSCC/lot/expiry trail

- **Shipping side**: T-018 (shipments schema) + T-019 (SSCC generation) + T-020 (closeBox/confirmShipment) properly thread `sscc_serial` + `lot_no` + `expiry_at` through the box_contents structure. ✅
- **Scanner side**: T-003 (GS1-128 parser) + T-010 (lookup resolver) + T-028 (receive-po-line multi-LP) propagate the trail. ✅
- **Cross-module**: Scanner pick (T-040) + Pack (T-018-shipping, T-019-shipping) cross-reference is declared in shipping manifest's `06-scanner-p1` entry. ✅
- Production + warehouse downstream consumption of the SSCC trail is **NOT explicitly declared per-task in 11-shipping** beyond `05-warehouse/T-002` and `05-warehouse/T-013` (transition_lp DSL). Acceptable: the LP transition contract is the integration point.

### D365 export-only posture

- 11-shipping/T-029 R15 anti-corruption adapter explicitly excludes `factory_release_state` and any FG state field. AC #6 enforces this with grep. ✅

### Quality hold gate

- 11-shipping/T-013 evaluates `v_active_holds` (consumes 09-quality/T-010), HARD BLOCK on critical, emits `shipping.quality_hold.overridden` (consumed by 09-quality/T-011). ✅

### POD audit + BRCGS retention

- 11-shipping/T-025 Delivery tracker with POD: SHA-256 hash + BRCGS 7-year retention confirmed in body. ✅

### Foundation primitives compliance

- RLS via `app.current_org_id()`: **confirmed** in all schema tasks across the three modules (01-npd T-001, T-006; 11-shipping T-001, T-013, T-018, T-029).
- outbox via T-112: 11-shipping/T-029 ✅ (declared dep), 11-shipping/T-013 ✅ (declared cross-dep).
- worker via T-111: 11-shipping/T-019 ✅, T-029 ✅.
- e-sign T-124: scanner PIN session uses bcrypt (not e-sign — correct; e-sign reserved for signing events).
- rate-limit T-121: shipping manifest lists at module level; not individually wired (acceptable, but per-task could be tightened for write endpoints).
- permissions enum: 11-shipping/T-031 declared p0-blocker ✅.

## Section 4 — Prototype linkage report

Validated all `T3-ui`/`ui`-labelled tasks against `_meta/prototype-labels/prototype-index-{npd,shipping,scanner}.json` `entries[].label`.

| Module | UI tasks | Linked to a valid index label | Missing prototype_match |
| --- | ---: | ---: | ---: |
| 01-npd | ~30 | 27 | 3 (T-076, T-094, T-095) |
| 11-shipping | 16 | 16 | 0 |
| 06-scanner-p1 | 29 | 29 | 0 |

All `prototype_index_entry` values used (single or comma-list) resolve to actual labels in the corresponding `prototype-index-<module>.json` file. All linked UI tasks carry `ui_evidence_policy = _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`. ✅

Spot-check of T-052 (NpdDashboard) confirms structural-parity AC, prototype `file:lines` (`fa-screens.jsx:31-175`), Playwright/RTL evidence requirement, ui_evidence_policy field — fully compliant.

## Section 5 — Recommended fixes

### Required (before next dispatch wave)

1. **01-npd/T-099, T-100** — Rebuild from gold-standard shape. Add `source_prd: docs/prd/01-NPD-PRD.md`, real `prd_refs`, concrete AC, explicit `pnpm` test command, `routing_hints`, and `closeout_requires`. Without this the ACP pipeline expansion will fail validation.
2. **01-npd/T-089** — Add `00-foundation/T-113` to `dependencies` and add an implementation step to register the redaction function with the foundation GDPR registry (subject_id → table list).
3. **11-shipping/T-029** — Tighten prompt wording to remove the `tenant_id ←→ org_id` arrow; replace with a single line: "The PRD §9.3 SQL uses `tenant_id`; per Wave0 v4.3 this is corrected to `org_id` — implement as `org_id UUID NOT NULL`."

### Recommended (coverage cleanup)

4. **11-shipping per-task FG cross-deps** — Add `01-npd/T-001 (product FG SSOT)` to `cross_module_dependencies` on T-001, T-002, T-003, T-004, T-005, T-010, T-011, T-014, T-015, T-018, T-026, T-028, T-030. Single-line addition each.
5. **01-npd/T-094** — Reclassify `task_type` from `T3-ui` to `T-refactor`; the JSON labels already include `T-refactor`. Update prompt note that this is a sweep, not a single-screen UI build.
6. **01-npd/T-095** — Reclassify `task_type` to `T4-wiring-test` (the prompt is an end-to-end spine test through G3 stage gate).
7. **01-npd/T-076** — Move `task_type` to `docs` (it is a deferred decision record, not a UI build).

### Optional (no impact)

8. Scanner module: consider adding per-task `00-foundation/T-121 (rate-limit)` cross-dep on auth endpoints T-006/T-008 (currently relies on module-level entry).

## Process notes

- All 182 JSON files validate as JSON (`python3 -c json.load` over the set returns 0 errors).
- No task was modified; this is read-only review per assignment.
- Gold-standard exemplars consulted: `01-npd/T-001.json`, `01-npd/T-052.json`, `02-settings/T-001.json` (auth), `02-settings/T-041.json` (UI parity), `UI-PROTOTYPE-PARITY-POLICY.md`.
