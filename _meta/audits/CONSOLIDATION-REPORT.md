# MonoPilot Kira — Phase 1 Consolidation Report (2026-06-02)

Goal: one trustworthy **acyclic** task graph + normalized routing, ready for
`/kira:plan`. Tooling: `_meta/audits/graph_validate.py` (read-only validator) +
`_meta/audits/consolidate_apply.py` (surgical mutator). Both committed for re-run.

## Graph stats — before → after

| Metric | Before | After |
|---|---:|---:|
| Tasks (nodes) | 1041 | 1041 |
| Dependency edges | 2209 | **2307** |
| Cross-module edges parsed | 137 | **276** |
| **Cycles** | **7** | **0** ✅ |
| Truly-dangling refs | 3 | **0** ✅ |
| Misplaced refs (cross-mod in local `dependencies`) | 35 | **0** (reclassified) |
| Roots (no prereq) | 169 | 169 |
| Fully-isolated nodes | 84 | 84 (benign — see below) |
| Prose-only cross-module notes (informational) | — | 239 |

> Edge count rose because the validator initially missed **colon-form** refs
> (`00-foundation:T-125`); fixing the parser surfaced 110+ real edges (and 4 more
> latent cycles) that the legacy graph hid.

## 1. Count reconciliation
Task files == `manifest.json` `task_count` for **all 16 modules** already (the
stale 126/125/61 mismatch from the old foundation STATUS is gone). **No manifest
edits required.** STATUS.md now exists for all 16 (15 created in Phase 0).

## 2. Carry-forwards → already real tasks
Net open carry-forwards from Phase 0 (T-064, T-072, T-073) **already exist as
foundation task files** (T-064 audit-constraint validate, T-072 error-transition
test, T-073 JIT-provisioning flag). 09-quality/T-064 (WO consume-gate contract
pin) also exists. **0 new task files created** — harvesting resolved to existing
tasks + dependency edges, not decomposition.

## 3. DAG repair — 7 cycles broken with 6 surgical back-edge cuts
All cycles were a more-foundational task wrongly listing its *consumer* as a
prerequisite. Cut the back-edge, keep the natural direction:

| Cut | Reason |
|---|---|
| 01-npd/T-058 `dependencies -= T-095` | gate-advance **API** must not depend on the **UI** (T-095) that calls it |
| 09-quality/T-052 `dependencies -= T-041` | CCP-escalation **DSL rule** precedes the auto-create **wiring** |
| 09-quality/T-046 `dependencies -= T-044` | `ncr_close_modal` component precedes the `ncr_detail` page that hooks it |
| 09-quality/T-030 `xmod -= T-063` | **contract-pin T-063 runs AFTER** the wiring it pins |
| 09-quality/T-040 `xmod -= T-063` | (same — T-063 was the root of the quality tangle) |
| 09-quality/T-041 `xmod -= T-063` | (same) |

Re-validation after cuts: **0 cycles**.

## 4. Misplaced / dangling refs fixed
- **35 module-qualified refs** (mostly 11-shipping writing `00-foundation/T-125`
  into the *local* `dependencies` field, plus 3 prose like `02-settings
  (allergen_families reference table)`) were **moved into
  `cross_module_dependencies`**. Local `dependencies` now contain only bare
  `T-NNN`. The 3 prose ones stay as cross-module **notes** (no task_id to edge
  to) flagging real 02-settings prerequisites for shipping T-001/T-018/T-028.

## 5. routing_hints normalized — all 1041 tasks
Legacy tokens (`hermes_gpt55`, `spark_low_risk_else_opus`,
`opus_if_high_risk_or_ui_or_architecture`) **removed everywhere**. New shape:
`routing_hints: { "writer": <token>, "reviewer": <token> }`, derived from
`task_type` per `01-MODEL-ROUTING.md`:

| task_type | writer | reviewer |
|---|---|---|
| T1-schema / T2-api / T5-seed | `impl-standard` (Codex) | `review-codex-work` (Claude) |
| T3-ui | `impl-ui` (Opus) | `codex-review` (inverted lane) |
| T4-wiring-test / T4-e2e | `test` | `review-codex-work` |
| T0-root / docs | `plan` (Opus) | `codex-review` (spot) |

> `impl-logic` is **not** auto-assigned here — `/kira:plan` (Opus, has the
> per-module logic-families table) will bump the algorithmic cores (MRP, FIFO/WAC,
> SSCC mod-10, OEE math, cycle-detection, DSL executors) from `impl-standard` →
> `impl-logic`.

## 6. risk_tier set on every task (Gate-4 input for `/kira:plan`)
`pipeline_inputs.risk_tier` = **high** for `T1-schema` + `T3-ui` (RLS/parity
always high) or any task whose labels/category match security/RLS/money/finance/
cost/regulatory (e-sign, GDPR, BRCGS, GS1/SSCC, D365, HACCP/CCP, allergen, LOTO,
audit, RBAC, p0-blocker); **low** otherwise.
Result: **676 high / 365 low**. (Schema+UI dominate the high tier by design.)

## 7. Isolated nodes (84) — benign, not orphans
Breakdown: 46 in 00-foundation (mostly already ✅ IMPLEMENTED hardening/test
tasks), 13 each in 02-settings & 03-technical, rest scattered. These have **no
prerequisites and nothing depends on them** — independent leaves, not
unreachable-from-root orphans. They slot into the earliest wave their STATUS
permits; no repair needed. (Many foundation ones are already done.)

## 8. Deferred to module-run gap-triage (documented, not blocking)
Phantom **scaffold prerequisites** surfaced in Phase 0 — created when their
module's wave approaches (Phase 4 gap-triage), not now:
- `apps/scanner` workspace (06-scanner-p1) — currently scaffolded only inside `apps/web`
- `packages/reporting` (12-reporting), `packages/domain` (14-multi-site),
  `packages/integrations-d365` + `packages/events` (11-shipping)
- `packages/barcode-parser` → **reconcile to existing `packages/gs1`** (don't duplicate)
- 14-multi-site migration renumber `0040_`–`0053_` → `051`–`063` (collision w/ `040-tenant-l2.sql`)
- `apps/web/src/` path remap for planning-basic/ext, quality, maintenance, multi-site scope_files

## Outputs
- `_meta/audits/graph_validate.py`, `_meta/audits/consolidate_apply.py`, `_meta/audits/graph_report.json`
- 1041 task JSONs normalized (working tree, uncommitted — reviewable via `git diff`)
- This report.

**Graph is acyclic, edges classified, routing+risk normalized → ready for `/kira:plan`.**
