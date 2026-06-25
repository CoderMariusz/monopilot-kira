# Night Build — Dispatch Tracker (2026-06-25 → 05:00)

Living tracker for the autonomous night build. Source backlog = union of both
2026-06-25 reports (deduped):
- `2026-06-25-detailed-gaps-report.md` §4 BUILDABLE-NOW (items #1–#50)
- `2026-06-25-shippable-options-and-reports.md` §1 quick-wins (qw#1–#42) + §2 high-value (no-owner) + §3 roles table

**Owner-locked decisions (2026-06-25 22:15):**
1. **RBAC write/approval grants → DEFERRED.** Reads already live (mig 341). No migrations tonight. All lanes = read / dashboard / export / UI only. Write-matrix → 05:00 decision list.
2. **Priority = per-role unlock first** (dept_manager / viewer / npd_manager / operator land on real surfaces).
3. **Documents = print-HTML** (no chromium-on-Vercel) when reached.
4. **Charts = existing Sparkline + HTML/CSS bars** (no new dep).

**Excluded (standing):** D365, fa→FG, §5 owner-decision items.

## Loop mechanics
3 lanes/wave · Codex default, Claude(kira-ui) for UI · S-pairing (≤2×S/lane, ≤6/wave) ·
after 3 lanes → cross-review (`kira-codex-review` / Opus; reversal·RBAC·money·regulatory = mandatory review) ·
PASS → ONE build gate (`pnpm --filter web build`, BUILD_EXIT=0, never `| tail`) → commit → push (`open /tmp/mk_push.command`) → next wave ·
FAIL → rework same lane. Lanes file-disjoint. SQL PREPARE-tested on live before push. Honest reporting — no hidden gaps.

**Deep-check** (owner spec): after every 2 waves, live on Vercel — click each new option → does it CREATE the thing / PERSIST / change LOGICALLY → cross-ref → never mock. New bugs → fix lane.

**Final phase (if time before 05:00):** browser test + full **E2E 75-point** produce→sell walk
(`docs/guide/pl/PRZEPLYW-E2E-TESTOWY.md` + `docs/guide/pl/01-golden-flow-end-to-end.md`).

## Status legend
queued · in-progress · review · rework · done(local) · pushed

---

## WAVE 1 — landing per-role + manager surfaces  [status: in-progress]
| Lane | Model | Item(s) | Files | Status |
|---|---|---|---|---|
| A | kira-ui | post-login → /dashboard redirect + profile shows role + dashboard quick-actions permission filter (qw#35/#34/#42, det#47) | `(app)/page.tsx`, profile (3 files + i18n), dashboard `page.tsx` + new `quick-action-permissions.ts` + tests | **review✓** display_order exists; npd.planning.write+planning.mrp.run in role_permissions & admin holds them (affordance==action gate); 21+24 vitest, tsc0 |

⚠️ **i18n concurrent-edit risk:** A/B/C ran in parallel, all edited en/pl/ro/uk.json → possible key clobber. MUST verify each lane's keys survived in all 4 locales + run i18n parity test BEFORE push. (Future waves: serialize i18n / lanes report keys, don't co-edit.)
| B | Codex | NPD pipeline funnel/conversion analytics + pipeline CSV export (qw#27/#28, det#36 subset) | `(npd)/pipeline/{_actions/get-pipeline-analytics.ts(new),_components/pipeline-tabs.tsx,page.tsx}` + 4 i18n | **review✓** npd_projects cols (current_stage/current_gate+CSV set) verified live, 24/24 vitest + tsc 0. Note: CSV `notes` col empty (not on client KanbanProject) — cosmetic. Awaiting build/push. |
| C | Codex | Quality KPI dashboard tiles QA-001 (det#10, qw#8 subset) | `(modules)/quality/page.tsx` + new `_actions/get-quality-dashboard.ts` + 4 i18n | **review✓** SQL PREPARE-verified live (all status literals match CHECK constraints), 182/182 vitest. Awaiting build/push w/ wave. Minor: pass-rate denom includes pending/in_progress (refine later). |

## WAVE 2 — role dashboards + operator  [status: queued]
| Lane | Model | Item(s) |
|---|---|---|
| A | Codex | Maintenance global KPI tile + MWO backlog-ageing + planned-vs-unplanned + MWO CSV (qw#31/#32, det#29) |
| B | Codex | OEE target-vs-actual RAG + MTTR/MTBF + yield-trend sparkline + line-filter (qw#2/#3/#4/#5, det#26) |
| C | kira-ui | Scanner: site/line/shift pill + label-reprint + allergen-badge LP + pick QA-hold + PWA sw.js (qw#17/#18/#19/#20/#21) |
→ **DEEP-CHECK #1** after Wave 2.

## Queue (waves 3+, auto-composed from disjoint modules)
- **Compliance/exports:** audit-log CSV wire (det#46/qw#1), e-sign quality register, hold/release log CSV (qw#7), trace polish (det#48: CSV+customer linkage+LP expiry/QA cols+deep-links), inspection pass-rate banner (qw#8), recall-drill CSV+schedule KPI (qw#9/#41).
- **Finance:** cost-variance page (det#18), inventory valuation (det#19), material spend by supplier (det#21), finance period+CSV (det#20/qw#24), finance KPI strip (qw#25), downtime-cost line (qw#26), labor/scrap reports.
- **Technical:** where-used (qw), portfolio cost roll-up, supplier-spec coverage, CSV exports (allergen/cascade/lab/shelf-life/traceability/bom-diff qw#10/#11), nutrition+factory-spec print (print-HTML).
- **Warehouse:** stock valuation (qw), ABC/slow-mover/location-util/cycle-count-accuracy (qw#14/#15), adjustments list, inventory/movements/GRN/genealogy CSV (qw#12), stock-move date filter+CSV.
- **Shipping:** OTIF + carrier perf + shipment weight/required-date cols (qw#38) + delivery-exception filter + SO/shipment CSV (qw#39) + status board.
- **Planning:** PO aging + cross-supplier OTIF (det#31), MRP/TO/WO CSV (det#32/qw#13), MRP→PO last-price (det#33), WIP report, open-PO book, reorder one-click PO.
- **NPD (rest):** owner-workload + dept blocked-FA drilldown (qw#28) + costing roll-up (qw#29) + launch-readiness matrix + gate-approval audit + formulation version-compare wire (qw#30).
- **Production:** QA-results tab read-model (det#8), over-production badge/filter/KPI (det#23), WO-list CSV (det#24), mass-balance tab (det#25), schedule adherence (det#28), downtime Pareto WoW (qw#6).
- **Platform/settings:** Settings→Roles DB-driven list (det#7) + full PERMISSION_GROUPS dialog (det#6), deactivate/reactivate user (det#5), multi-site KPI strip (qw#33), threshold settings UIs (qw#36/#37 near-expiry/count-variance/npd), config-consumption (date-format/currency, catch-weight).
- **High-risk (mandatory review):** critical-NCR dualSign SoD (det#15), FEFO-override audit (det#45), CAPA-from-NCR (det#14), customer master edit (det#34), NPD price→list_price (det#35).

## 05:00 → owner decision list (write-matrix + §5 owner items) — assembled at final report.

## Progress log
- 22:17 BST — kickoff. Decisions locked. Wave 1 dispatched (A kira-ui, B+C Codex). main @ 5a5c06aa.
- 22:2x — pulled Wave-2 OEE-RAG lane early (disjoint) to keep Codex maxed.
- ~22:35 — 3 lanes back + SQL PREPARE-verified live: **C** quality-KPI (all status literals match CHECK constraints; 182 vitest), **B** npd-pipeline (current_stage/current_gate+CSV cols exist; 24 vitest+tsc0), **OEE** RAG+trend (oee_alert_thresholds+oee_snapshots cols exist; 4+4 vitest, has catch+console.error). All read-only, no migrations. Pending: Lane A (kira-ui) still running → then ONE build gate + i18n parity test + commit/push. OEE i18n RAG-label reuse to re-check at page review.
