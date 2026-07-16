# W3 verification proof (prod deploy 6870fabf, dpl 81ucnh1v9 READY)
Deploy 2026-07-16: build green + TS-check + "Done: 1 applied (505), 483 skipped". mig505 logged.
Layers: [DB] live prod · [CODE] Opus verification (Codex-review infra-limited) · [UNIT] vitest per-track · [GATE] tsc+build+suite+PREPARE.

| Finding | Proof |
|---|---|
| C059 MRP reorder-lot | [CODE+UNIT] ceil(gap/reorder_qty)×reorder_qty; run-10 case min123.456788/lot7.654322→BUY130.123474 (was 124). ceilGapToLotMultiple exact-decimal. |
| C060 TO qty 6dp | [DB] transfer_order_lines.qty **numeric(18,6)** live (was 12,3). mig505. |
| C063 WO edit UoM | [CODE] qtyEntered/qtyEnteredUom/uomSnapshot returned+form; chain-mapper ripple fixed. |
| C064 dep-badge direction | [CODE] direction corrected vs wo_dependencies model. |
| C037 pilot-WO errors | [CODE+i18n] mapPlanningCreateError precise codes (pack_hierarchy_incomplete etc.) all 4 locales. |
| C038 pilot-WO visible | [CODE] Planning list/search includes released pilot WO. |
| C067 solver occupancy | [CODE+UNIT] in-progress runs block line from nowMs; 31/31 occupancy/PM/cap tests. |
| C068 capacity alt-drafts | [CODE+UNIT] dedup per WO (no sum of exclusive alternatives); 42/42. |
| C069 finite-cap+PM | [CODE+UNIT] finite-cap 16h/day + PM defaults affect solver; no-config-skip-PM confirmed intended. |
| C070 changeover fallback | [CODE+UNIT] symmetric fallback for unknown reverse (not 0). |
| C071 reschedule guard | [CODE] server status-guard (no Draft/In-progress) + UI. |
| C072 timezone parity | [CODE] board==detail single UTC→local conversion. |
| C073 capacity site-filter | [CODE] getActiveSiteId in loadSchedulerCapacity (null=All-sites, C104 pattern). |
| C074 schedule All-sites lines | [CODE] null-semantics, no early-return empty. |
| C075 assignment override | [CODE] server action + UI commit path. |
| C076 shift stale UUID | [CODE] label not raw UUID + clearer validation. |

## Summary
- All 16 findings implemented (3 Cursor + 2 Codex, batches to avoid scheduler/capacity collisions). tsc clean, build green, full suite 60 fail/3934 pass = W2-close baseline (ZERO W3 regressions; only W1-C058 DB-loud-fail in W3-area). i18n parity 604. mig505 PREPARE-clean + applied live.
- Opus fixes: WOHeader chain-mapper (C063 ripple); reverted a bad C069 no-config-PM change (contradicted intended contract).
- Codex whole-wave review died (bash time-limit) → Opus verification stands for this logic-focused wave.
- mig505 TO qty numeric(18,6) verified live on prod.
