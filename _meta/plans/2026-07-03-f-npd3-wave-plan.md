# Wave F-NPD-3 — build plan (charter round 3, rulings D19-D44 + U1-U4)

Charter + all rulings: `_meta/plans/2026-07-03-npd-round3-charter.md`.
Flow: Fable orchestrates · Composer/Codex implement · Opus = REGULATORY reviews (costing engine, WIP platform) + Gate-5b logic walk post-deploy. Real-DB test legs mandatory on W2/W3 (owner D29 warning). Next free migration = 425.

## Sub-wave W1 — fixes + foundations (no engine changes)

| Lane | Engine | Scope |
|---|---|---|
| L1 | Codex | **Production save fix**: catalog↔product-view key audit; `resource_requirement`→`staffing` + `equipment_setup`→`dieset` mapping (data migration on field catalog rows + mig-333 fallback + seed fn); regression test asserting EVERY physically-stored catalog key resolves to a product-view column; fix the ignored `componentIndex` (multi-component last-write-wins) in the production tab persist path |
| L2 | Codex | **Pilot WO pack** (D39/D40/U4-ready): line picker filtered by top-bar site (All sites → all lines); qty in FG BASE UNIT + planned date passed through; `documentNumber` override in createWorkOrderCore (kills the rename-orphan class); FG items-row guarantee at candidate creation; WO code-mask seed for org; role-bundle seed so pilot writers hold `npd.planning.write`; SPECIFIC error surfaces replacing the generic toast |
| L3 | Composer | **Checklists** (D36/D37/D38): remap migration for the 13 misplaced template items + sync open projects preserving checked state + fix the stale seed trigger; new Settings › NPD › Gate checklists screen (per-gate CRUD: text/required/sequence/add/remove) — advisory semantics unchanged |
| L4 | Composer | **Brief + packaging units** (D19/D20/D25/D30/U1): Brief gains numeric `weekly_volume_packs` + `runs_per_week` (required, universal); `packs_per_case` editable in BOTH Brief and packaging-modal header (one field); packaging modal = per-BOX entry with packs-per-box header + per-component `waste_pct` column |

Gate: tsc+vitest+build → deploy → targeted logic re-walk (brief→packaging with new fields).

## Sub-wave W2 — costing engine (REGULATORY — Opus review + real-DB leg)

| Lane | Engine | Scope |
|---|---|---|
| L5 | Codex (REGULATORY) | **One cost engine**: kill Path-B pct math — waterfall computes from the qty-based SSOT. Rows per U2: RM (per-pack from formulation) → Yield (REQUIRED, no silent 100% — D23) → Process labour (per-process THROUGHPUT in the process-OUTPUT unit, D24/D42: time = qty/throughput; cost = Σ(rate×headcount)×time + additional) → **Setup** (per-process setup cost × runs_per_week ÷ weekly_volume, D25) → Packaging (per-box components ÷ packs_per_box, per-component waste — D20/D41) → Overhead (£/kg org default + project override — D26) → Logistics (£/box org default + override — D27) → Total → Margin vs target. Distributor/Retail rows REMOVED (D28). **WIP-first recursion** (D29): WIP cost = (RM + processes)/yield in the WIP's unit, FG consumes WIPs at computed cost, full depth. Unit conversions for the 3-column display (pack_weight_g, packs_per_case, avg_batch in FG base unit — D22/D40) |
| L6 | Composer | **Costing UI**: 3-column waterfall (£/kg | £/pack | £/batch), inputs panel (avg batch, overhead/logistics overrides; volume + runs read-only from Brief), stale-costing badge + Recompute; **Settings › NPD › Cost parameters** (overhead £/kg, logistics £/box org defaults) |
| L7 | Codex | **Schema mig(s)**: process `throughput_per_hour` + `throughput_uom` + `setup_cost`; project `avg_batch_qty`; org cost-parameter store; brief fields from W1 wired to compute |

Gate: real-DB leg (pnpm test:pg) for the engine + Opus REGULATORY verdict + Gate-5b walk (costing must be computable on a fresh project that has recipe+packaging+processes — satisfiability test).

## Sub-wave W3 — WIP platform (REGULATORY — the big rock)

| Lane | Engine | Scope |
|---|---|---|
| L8 | Codex (REGULATORY) | **WIP definitions schema**: `wip_definitions` (org-wide, 1:1 items row — ONE shared item per WIP type D34, base_uom = creating process output unit D42, version, status) + `wip_definition_processes`/`_roles` (template chain home — unwelds chains from `prod_detail`); `creates_wip_item` toggle stays = STORABLE WIP; new `reusable` flag = publish to library (U3); `npd_wip_processes.wip_definition_id` reference (D32 — reference not copy) |
| L9 | Codex (REGULATORY) | **Per-level materialization** (D43): handoff builds BOM per level (RM→WIP bom on the WIP item; FG BOM consumes WIP items); WIPs storable as LP stock; planning creates the WO CHAIN (WIP WO → FG WO) — pilot too (U4); genealogy via existing LP-consume chokepoints (T-064 etc. UNTOUCHED) |
| L10 | Composer | **Technical › WIP library** (D35): list/detail, chain editor, where-used; recipe-side WIP PICKER (org-wide dropdown) importing chain by reference |
| L11 | Composer | **Change flow** (D33/U3): WIP definition edit → version bump → banner on referencing projects + notification inbox; FGs in production require explicit update+accept per FG |

Gate: real-DB integration tests (multi-level BOM build, WO chain, WIP LP genealogy) + Opus REGULATORY (adversarial traces: no hold/QA-gate bypass on WIP LPs, cost recursion correctness, cross-project reference integrity) + full Gate-5b end-to-end walk (create → … → handoff with a 2-level product) + HTML wave report.

## Sequencing & risks

W1 → W2 → W3 (W2 needs W1's Brief fields; W3's costing hooks need W2's engine). Owner's D29 warning drives W3's test weight. Deploy+walk after EACH sub-wave; escapes loop back before the next starts.
