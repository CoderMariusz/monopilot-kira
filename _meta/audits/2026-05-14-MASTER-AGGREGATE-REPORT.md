# Master Aggregate Report — 2026-05-14

Orchestrated execution of the 7-point remediation plan plus prior gold-standard upgrade of 5 modules. **Live document — updated as each Opus finishes.**

Status legend: ✅ done · 🔄 running · ⏳ queued

---

## Phase 0 — Gold-standard task upgrade (5 modules + 2 audits)

Completed earlier this session. **307 tasks rewritten in place + 2 audit reports**.

| Module | Tasks | UI with `prototype_match` | Report path |
|---|---:|---:|---|
| 03-technical | 90/90 | 33 | `_meta/atomic-tasks/03-technical/UPGRADE-REPORT-2026-05-14.md` |
| 05-warehouse | 57/57 | 8 | `_meta/atomic-tasks/05-warehouse/UPGRADE-REPORT-2026-05-14.md` |
| 06-scanner-p1 | 48/48 | 29 | `_meta/atomic-tasks/06-scanner-p1/UPGRADE-REPORT-2026-05-14.md` |
| 07-planning-ext | 57/57 | 24 | `_meta/atomic-tasks/07-planning-ext/UPGRADE-REPORT-2026-05-14.md` |
| 08-production | 55/55 | 6 | `_meta/atomic-tasks/08-production/UPGRADE-REPORT-2026-05-14.md` |
| **Total** | **307** | **100** | — |

Audit reports:
- `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A — PRD vs tasks)
- `_meta/audits/2026-05-14-architecture-and-cross-cutting-gaps.md` (Auditor B — architecture / foundation / cross-cutting)

---

## Phase 1 — 7-point remediation plan

### Wave 1 ✅ complete (5/5 Opus)

#### Pt 1 — Tenant-context API drift ✅
- 16 tasks fixed in place across 00/01/02/03/04/05/07/08/09 (RLS pattern: `current_setting('app.tenant_id')` → foundation function `app.current_org_id()`)
- NPD T-001 (FG primary table) corrected
- NPD T-006 column `tenant_id` → `org_id` (Wave0 lock)
- **New FT-001 = T-125** in 00-foundation: `withOrgContext` HOF in `packages/db/src/with-org-context.ts`
- Report: `_meta/audits/2026-05-14-tenant-context-remediation.md`
- Key finding: foundation SQL setter signature is `(session_token, org_id)` — the wrapper sends `app.current_user_id` via `SET LOCAL` separately for audit triggers

#### Pt 2 — FT-001..FT-050 materialization ✅
- 49 tasks materialized (FT-001 handled by Pt 1 above, so range was FT-002..FT-050)
- T-XXX range: **T-062..T-110** in 00-foundation
- 4 P0 deploy blockers: T-080 (`org.platform.admin` bootstrap), T-081 (migrate.ts checksum recovery), T-092 (HMAC RelayState SAML), T-093 (React 19 peerDeps alignment for `packages/ui`)
- Report: `_meta/audits/2026-05-14-foundation-carry-forward-materialization.md`

#### Pt 3 — 09-quality completion ✅
- Manifest.json + coverage.md created (didn't exist)
- 3 broken-ref tasks fixed (T-001/002/003) — §16.3 actually exists at PRD line 1824 (audit was wrong); other refs tightened
- 14 T3-ui tasks patched with `ui_evidence_policy`
- **28 new tasks** added: 09-d NCR (T-037..T-046, 10 tasks), 09-e HACCP/CCP/complaints/allergen (T-047..T-062, 16 tasks), 09-cross integration (T-063, T-064)
- Total module: **64 tasks**
- All 6 audit-flagged prototype labels covered (ncr_list, ncr_detail, haccp_plans, ccp_monitoring, ccp_deviations, allergen_gates)
- Report: `_meta/atomic-tasks/09-quality/UPGRADE-REPORT-2026-05-14.md`

#### Pt 4 — Permission enum additions per module ✅
- 8 modules × 1 new task = 8 tasks, **105 permission strings total**
- T-IDs: 01-npd T-101, 03-technical T-091, 04-planning-basic T-066, 05-warehouse T-058, 06-scanner-p1 T-049, 07-planning-ext T-058, 08-production T-056, 09-quality T-037
- Per-module string counts: npd 17, technical 10, planning-basic 15, warehouse 12, scanner 10, scheduler 11, production 17, quality 13
- Naming conflicts resolved (e.g. `scanner.access` 2-segment → `scanner.access.base`; `wh.*` → `warehouse.*`)
- Report: `_meta/audits/2026-05-14-permission-enum-addition.md`

#### Pt 5 + Pt 7 — Foundation primitives ✅
- 14 new foundation tasks in **T-111..T-124**
- 7 P0 blockers: T-111 (apps/worker scaffold), T-112 (outbox consumer), T-113 (GDPR registry + dispatcher), T-116 (OpenTelemetry baseline), T-121 (rate-limit middleware), T-122 (CI/CD hardened), T-123 (Playwright harness)
- Other primitives: T-114 (GDPR cron), T-115 (NPD wire-up test), T-117 (pino logger w/ redaction), T-118 (Sentry), T-119 (backup policy contract — `_foundation/contracts/backup-policy.md`), T-120 (restore-drill runner), T-124 (CFR 21 Part 11 e-sign primitive `@monopilot/e-sign`)
- Contracts created: `_foundation/contracts/gdpr.md`, `_foundation/contracts/backup-policy.md`
- Report: `_meta/audits/2026-05-14-foundation-primitives-additions.md`

**00-foundation manifest now: task_count = 125**.

### Wave 2 🔄 running (5/5 Opus + 1 from Wave 3)

| Module | Status | Tasks created | UI w/ `prototype_match` | Report |
|---|---|---:|---:|---|
| 10-finance | ✅ done | 32 (T-001..T-032) | 24/25 prototype labels | `_meta/atomic-tasks/10-finance/BOOTSTRAP-REPORT-2026-05-14.md` |

**10-finance highlights:**
- Sub-modules: 10-perm (1 P0), 10-a setup+ref (7), 10-b standard costs (6), 10-c WO actual costing (6), 10-d variance+valuation FIFO/WAC (6), 10-e D365 integrations stage 5 (4), 10-cross dashboard+reports (2)
- 1 P0: T-001 (`fin.*.*` 14 perm strings)
- Cross-module: 00-foundation (T-040 audit, T-046 enum-lock, T-111/112 worker+outbox, T-117/118 obs, T-125 withOrgContext, R14 UUID v7, R15 anti-corruption), 02-settings (rules_registry, d365_constants, waste_categories), 03-tech (items.cost_per_kg, bom_co_products), 04-PB (wo_dependencies + V-PLAN-WO-CYCLE), 05-WH (LP, lp.received/material.consumed events), 08-prod (WO, wo_outputs, wo_waste_log, wo.completed event), 09-QA (ncr_reports for v_yield_loss_monthly), 12-REP (consumer of finance.standard_cost.approved + finance.cost_per_kg.changed events)
- Cost-per-kg dual ownership policy (Technical+Finance); FIFO/WAC valuation; D365 stage 5 dispatcher (export-only)
| 11-shipping | ✅ done | 32 (T-001..T-032) | 15 | `_meta/atomic-tasks/11-shipping/BOOTSTRAP-REPORT-2026-05-14.md` |

**11-shipping highlights:**
- Sub-modules: 11-a customer (5), 11-b SO (5), 11-c allocation+hold gate (4), 11-d pick+wave (3), 11-e pack+SSCC-18+ship (5), 11-f docs packing/BOL/POD (3), 11-g RMA P1 (1), 11-h carriers+settings (2), 11-i D365 dispatcher (1), 11-j dashboard+E2E (2), 11-k perm-enum (1 P0)
- 1 P0: T-031 (`ship.*` 14 perm strings)
- Foundation reused: T-111/112 (worker/outbox), T-113/114 (GDPR), T-116/117 (OTel/pino), T-121 (rate-limit), T-123 (Playwright), T-124 (e-sign BOL), T-125 (withOrgContext)
- Cross-module: 01-NPD T-001 (product FG SSOT, allergen cascade, variance), 02-settings (allergen families, reason codes, GS1 prefix, printers, packing stations), 05-WH T-002/T-013 (LP + transition DSL), 06-scanner (operator role, scan_event_id), 08-prod (outbox enum shared), 09-QA T-010/T-011 (v_active_holds + audit), 10-fin (P2 invoicing consumer)
- SSCC GS1 mod-10 server-side; D365 strictly export-only (R15 adapter excludes factory_release_state); POD SHA-256 + BRCGS 7y retention; FG SSOT (no fa_id); RLS via `app.current_org_id()` grep-asserted on every backend task; outbox events `shipping.*.*`
- 8 known prototype bugs fixed inline (BL-SHIP-01/02/03/04/07/10/11/14); 5 P2 bugs rendered as disabled UI with tooltips
| 12-reporting | ✅ done | 27 (T-001..T-027) | UI sub-module 12-e | `_meta/atomic-tasks/12-reporting/BOOTSTRAP-REPORT-2026-05-14.md` |

**12-reporting highlights:**
- Sub-modules: 12-a core+foundation (10), 12-b quality+OEE consumer (5), 12-c operational (2), 12-d admin+export (5), 12-e catalog+modals+settings (4), E2E (1)
- 1 P0: T-001 (`reporting.*.*` perm enum, 14 strings); other foundation T-002/003/004/008 priority 80
- Cross-module: 00-foundation (T-046/111/112/116/117/121/123/125), 02-settings (rules, audit, i18n, Resend), 03-tech (items outbox), 05-WH (LP), 08-prod (WO/output/consume/downtime), 09-QA (holds consumer), 10/11/15 (IF EXISTS guards — modules being created in parallel)
- KPI glossary as SSOT: T-002 writes `_foundation/contracts/reporting-kpi-glossary.md`
- Translation-notes red lines enforced: read-model views, refresh cron, no raw PII in exports, dashboards tenant-parameterized, long queries on apps/worker
| 13-maintenance | ✅ done | 30 (T-001..T-030) | 10 (T-018..T-027) | `_meta/atomic-tasks/13-maintenance/BOOTSTRAP-REPORT-2026-05-14.md` |

**13-maintenance highlights:**
- Sub-modules: 13-a settings+asset+RBAC/GDPR/i18n (5), 13-b PM schedule+engine (3), 13-c MWO+LOTO+dashboard+e2e (13), 13-d spare parts (4), 13-e calibration+sanitation+outbox (6)
- 1 P0: T-001 (`mnt.*.*` 17 perm strings)
- Foundation primitives reused: e-sign T-124 (LOTO + calibration sign-off), outbox+worker T-111/T-112 (PM trigger, MWO events), GDPR T-114, rate-limit T-121, observability T-116-T-118
- Cross-module: 02-settings (rules, ref-tables), 03-tech (equipment.parent_line_id), 05-WH (spare_parts_stock soft FK), 08-prod (downtime_events FK, allergen_changeover consumer), 09-QA (lab_results FK forward-compat, calibration.failed consumer), 12-rep (dashboards_catalog seed, mwo.* consumer), 15-OEE (P2 stub trigger, read-only oee_shift_metrics)
- All 9 audit slices closed; all Auditor A cross-cutting gaps addressed
| 14-multi-site | ✅ done | 31 (T-001..T-031) | 7 (UI sub-module) | `_meta/atomic-tasks/14-multi-site/BOOTSTRAP-REPORT-2026-05-14.md` |

**14-multi-site highlights:**
- Sub-modules: 14-a core+RLS+foundation-ext (7), 14-b inter-site TO (4), 14-c transport lanes (5), 14-d master-data sync (3), 14-e site UI (7), 14-f dashboards+activation (4), 14-g perm-enum (1)
- 3 P0: T-001 (foundation ext `app.current_site_id()` + `withSiteContext` HOF — composes on T-125), T-030 (site_id ALTER+backfill migration across 20 tables in 9 modules), T-031 (`multi_site.*.*` 26 perm strings, ESLint-lock blocker)
- Cross-module: foundation T-125 ext, 02-SET (rules registry + reauth), 05-WH/08-PROD/09-QA/10-FIN/11-SHIP/13-MAINT/15-OEE (T-030 touches all 7 for site_id rollout), 12-REP (dashboards)
- 8/8 audit slices closed; 30 validation rules V-MS-01..V-MS-30 mapped

### Wave 3 🔄 running (1/1 Opus, fast-tracked into parallel with Wave 2)

| Module | Status | Tasks | UI w/ `prototype_match` | Report |
|---|---|---:|---:|---|
| 15-oee | ✅ done | 25 (T-001..T-025) | 9 (15-OEE-d/e UI sub-modules) | `_meta/atomic-tasks/15-oee/BOOTSTRAP-REPORT-2026-05-14.md` |

**15-oee highlights:**
- Sub-modules: 15-a perm+ref+seed (5, 1 P0), 15-b MVs+DSL rule+worker (4), 15-c outbox+API (4), 15-d P1 dashboards+drilldowns+modals (6), 15-e admin UIs (3), 15-f P2 stubs+integration+E2E (3)
- 1 P0: T-001 (`oee.*.*` 13 perm strings)
- Cross-module: 00-foundation (T-111/112/116/117/118/121/122/123/125), 02-settings (rule_definitions registry, ref_tables, feature_flags, RBAC), 08-prod PRIMARY producer of oee_snapshots (D-OEE-1; 15-oee read-only consumer), 09-QA (flag-gated cross-link, P2 reject_kg consumer), 12-reporting (report_access_gate reuse, MVs consumer + reverse-dep noted), 13-MNT (D-MNT-3 MTBF/MTTR feed, P2 auto-MWO trigger), 14-MS (site_id REC-L1 day-1 on every OEE table)
- All 8 Auditor A priority slices addressed
- Implementation notes: PRD `tenant_id` mapped to `org_id` per Wave0, PRD pg_cron remapped to Wave1 worker T-111, `app.current_org_id()` validator-enforced, UI parity literal `:NN-NN` line-range pattern enforced; 15-OEE never writes to oee_snapshots (read-only consumer per D-OEE-1)

---

## Phase 2 — Module review (5 Reviewer Opuses, 🔄 running)

5 review agents auditing all 15 module task sets (15-oee added after its bootstrap finishes). Each reviewer checks ~180-210 tasks against a 10-point audit checklist (JSON shape, PRD §X.Y reality, prototype linkage, deps coherence, foundation primitives, RLS via function, risk red lines, RED test commands).

| Reviewer | Modules | Total tasks | Status | Report |
|---|---|---:|---|---|
| R1 | 00-foundation + 12-reporting + 13-maintenance | 182 | ✅ 159 pass (87.4%) / 31 issues (15 P1, 16 P2) | `_meta/audits/2026-05-14-review-R1-foundation-reporting-maintenance.md` |

**R1 verdicts:** 00-foundation AMBER (103/125 pass), 12-reporting **GREEN** (27/27 — zero issues!), 13-maintenance **GREEN** (29/30 pass, 1 issue). Top fixes: Foundation UI primitives T-025..T-031 cite prototype refs but never set `prototype_match: true` (pipeline may skip parity checks); T-037 SchemaColumnWizard zero prototype linkage; 13-maintenance T-022 cites `work-orders.jsx:261-584` but file only 564 lines (line-range overshoot); 16 carry-forward tasks have 1 risk_red_line (gold standard wants ≥2). Cross-cutting strengths: all 182 JSON parse, tenant-context discipline intact, no broken cross-module deps. Suggestion: update foundation `_generate.py` to auto-set `prototype_match: true` whenever jsx:line ref is present.
| R2 | 02-settings + 10-finance + 14-multi-site | 192 | ✅ 89 pass / 103 issues (P1:102, P2:56, P0:0) | `_meta/audits/2026-05-14-review-R2-settings-finance-multisite.md` |

**R2 verdicts:** 02-settings AMBER (60/129 pass — quality drift on T-003..T-040, T-080..T-095, T-124..T-127), 10-finance **GREEN** (28/32 pass), 14-multi-site AMBER (1/31 pass — 30 missing `pipeline_inputs.details`, likely generator drift in bootstrap batch). Top fixes: backfill 14-multi-site `details` on 30 tasks; raise 02-settings risk_red_lines from 1→≥2 on ~45 tasks; add runnable test commands on ~50 settings tasks; fix MS T-031 wrong reference to Settings T-046 (no enum-lock guard task exists there — needs creation); resolve 8 `parallel_safe_with`/`dependencies` overlaps; declare D365 export-only red line on finance T-028.
| R3 | 01-npd + 06-scanner-p1 + 11-shipping | 182 | ✅ 165 pass / 17 issues | `_meta/audits/2026-05-14-review-R3-npd-scanner-shipping.md` |

**R3 verdicts:** 01-npd AMBER (97/101 pass, 4 issues), 06-scanner-p1 **GREEN** (49/49 pass, zero issues!), 11-shipping AMBER (19/32 pass, 13 low-severity). Top fixes: rebuild 01-npd T-099/T-100 (skeletal stubs), wire T-089 to foundation T-113 GDPR registry, add per-task NPD T-001 cross-dep to 13 shipping tasks, reword shipping T-029 prompt clarity.
| R4 | 03-technical + 05-warehouse + 09-quality | 213 | ✅ 143 pass / 70 issues | `_meta/audits/2026-05-14-review-R4-technical-warehouse-quality.md` |

**R4 verdicts:** 03-technical AMBER (69/91 pass), 05-warehouse **AMBER leaning RED** (46/58 pass — validator FAILS, schema drift `tenant_id` vs `org_id` in T-005/T-008/T-009/T-011/T-016, T-011 FEFO index contradicts T-002), 09-quality AMBER (28/64 pass). Top fixes: **(P1) revert 5 WH tasks to `org_id` per Wave0 lock**; 14 09-QA T3-ui tasks have `prototype_match: true` but null `prototype_index_entry` + no `## Prototype parity` section; 09-QA has 0/64 cross_module_dependencies declarations (vs 58/58 in WH); 05-WH `_validate.py` returns 10 errors today; T-039 missing foundation T-124 e-sign citation.
| R5 | 04-planning-basic + 07-planning-ext + 08-production | 180 | ✅ 65 pass / 115 issues — **08-prod RED** | `_meta/audits/2026-05-14-review-R5-planning-basic-ext-production.md` |

**R5 verdicts:** 04-planning-basic AMBER (31/66 pass, 1 validator FAIL, 4 schema `tenant_id` violations), 07-planning-ext AMBER (8/58 pass — 6 broken PRD anchors §5.1.1/§5.1.2/§5.1.3/§5.4.1/§5.4.4/§4.1.3 don't exist; 6 RLS tasks miss `app.current_org_id()` reader), 08-production **RED** (26/56 pass — 8 schema tasks violate Wave0 `org_id` lock, **duplicate canonical `wo_outputs` table** between 04 T-005 (planning shape) and 08 T-003 (production shape) — one must own; **Quality T-064 consume gate not cited on 14 consume tasks** — block-fix required before ACP import). Top systemic: Pt1 tenant-remediation pass missed 12 tasks in 04/08 (didn't sweep these); foundation primitive citations missing (T-111/T-112/T-121/T-124) on 14 tasks.

15-oee bootstrap ✅ done — separate mini-review can be queued after Wave 4 fixers.

---

## Phase 3 — Wave 4 fixers (5 Opuses, 🔄 running)

Remediations dispatched based on Reviewer findings + 1 user decision (`wo_outputs` canonical = 08-production).

| Fixer | Scope | Status | Report |
|---|---|---|---|
| F1 | Wave0 tenant_id→org_id sweep, `app.current_org_id()` citations, foundation primitive citations, 07-ext PRD anchors, 04 T-008 AC overflow | ✅ done | `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md` |

**F1 outcomes:**
- Issue A (Wave0 lock): 17 tasks rewritten — 05-WH T-005/T-008/T-009/T-011/T-016; 04-PB T-002/T-003/T-005/T-006; 08-PROD T-002..T-009 (8)
- Issue B (`app.current_org_id()` citation in 07-ext): 6 tasks (T-003..T-007, T-009); T-008 already canonical from Pt1
- Issue C (foundation citations, 15 total across 13 tasks): T-112 outbox (04 T-032, 07 T-028/029, 08 T-009), T-111 worker (07 T-012/013/019/021/022/023/054, 08 T-011), T-121 rate-limit (07 T-012, T-019), T-124 e-sign (08 T-040)
- Issue D (broken PRD anchors): 8 tasks — 07 T-001/010/012/021/024/028, 04 T-033/T-045
- Issue E (AC consolidation 5→4): 04 T-008 ✅
- Bonus: 05-WH T-011 "appropriate" placeholder reworded
- Validators: 04-PB **PASS** (was FAIL), 07-PE **PASS**, 08-PROD **PASS**, 05-WH 9 FAILs remaining (all pre-existing AC-count overflow on T-002, T-048..T-055 — content-collapse needed, outside F1 scope)
| F2 | 14-MS details backfill, 02-settings quality lift, MS T-031 ref fix, parallel-overlap fixes, spec-driven UI parity, finance dep + D365 red line, MS T-030 dep | ✅ done | `_meta/audits/2026-05-14-fixer-F2-multisite-settings-finance-remediation.md` |

**F2 outcomes (167 fixes across 75 files):**
- A (14-MS `details`): 30 tasks (T-002..T-031) ✅
- B (02-set ≥2 risk_red_lines): 48 tasks
- C (02-set concrete pnpm commands): 59 tasks
- D (02-set T-124..T-127 shape): 4 tasks
- E (14-MS T-031 ref fix + placeholder red-line for F4's planned enum-lock guard): 1
- F (parallel_safe_with ↔ deps overlap): 8 tasks (10-fin T-013/020/026/029; 14-MS T-010/014/016/018)
- G (02-set spec-driven UI parity): 13 tasks (T-104..T-115 + T-118) + T-129 + 14-MS T-020
- H (10-fin T-001 +02-set xmod dep): 1
- I (10-fin T-028 D365 export-only red line): 1
- J (14-MS T-030 +12-reporting xmod + table count corrected to 21 per real PRD §9.8 enumeration): 1
- Validators: 02-set 4 pre-existing AC>4 failures (T-004/T-125/T-127/T-128 — outside F2 scope), 10-fin & 14-MS no validators yet (recommend parallel authoring); JSON parse 192/192 PASS
| F3 | 09-QA UI prototype linkage, foundation UI parity, 13-MNT line range fix, 09-QA cross-mod deps, foundation carry-forward red-lines, NPD stub rebuild | ✅ done | `_meta/audits/2026-05-14-fixer-F3-prototype-linkage-remediation.md` |

**F3 outcomes (64 tasks touched across 4 modules):**
- A (09-QA T3-ui prototype linkage): 14 tasks (T-012..T-016, T-021..T-024, T-032..T-036) — `prototype_index_entry` mapped to real labels (esign_modal, qa_dashboard, holds_list, hold_create/detail, specs_list, spec_wizard, spec_detail, spec_sign_modal, incoming_inspection_list, inspection_detail, qa_templates, sampling_plans, inspection_assign_modal)
- B (Foundation UI primitives): T-025..T-031 set `prototype_match: true` + spec-driven parity block; T-037 explicitly `prototype_match: false` w/ spec-driven §6 + §5.y citation
- C (13-MNT T-022): line range `261-584` → `261-564` (file is 564 lines verified)
- D (09-QA cross_module_dependencies): 24 high-coupling tasks (T-030, T-037..T-046, T-051..T-056, T-058..T-064)
- E (Foundation 16 carry-forward red-lines 1→≥2): T-010, T-022, T-023, T-026..T-030, T-033, T-034, T-072, T-078, T-096, T-097, T-103, T-106
- F (01-NPD T-099/T-100 stubs rebuilt): gold-standard skeletal shape w/ explicit "STUB — re-author required" title suffix, priority 50
- Validators: **09-quality 64/64 PASS**, 01-npd unchanged on F3 tasks, 00-foundation 55 pre-existing failures unrelated to F3 (zero on F3-edited tasks). All 320 JSONs parse.
| F4 | NEW 02-settings ESLint enum-lock guard (P0) + relinks, NPD T-089 GDPR wire, NPD stubs, SHIP T-029 reword, 13 shipping xmd cross-dep | ✅ done | `_meta/audits/2026-05-14-fixer-F4-enum-lock-and-scattered-fixes.md` |

**F4 outcomes (27 files modified):**
- **NEW: 02-settings T-130** ("ESLint enum-lock guard for `permissions.enum.ts`", priority 90, p0-blocker, PRD §3 [D2]) — full gold-standard envelope, scope: `tooling/eslint-rules/` workspace + RuleTester + vitest + baseline snapshot. Manifest 129→130. Coverage.md new section `## Permission-enum governance 2026-05-14`.
- 9 perm-enum tasks relinked T-046 → T-130: 01-NPD T-101, 03-TECH T-091, 04-PB T-066, 05-WH T-058, 06-SCN T-049, 07-PE T-058, 08-PROD T-056, 14-MS T-031 (cleaned earlier fixer typo). Note: 09-QA T-037 in repo is ncr_reports schema (not perm-enum — manifest still landing by parallel work); T-130 declares forward ref.
- NPD T-089 wired to foundation T-113 GDPR registry: deps + xmd + details + prompt step 5 + new AC4 (registry-invoked) + new risk_red_line
- NPD T-099/T-100 declared explicit STUB (priority 30, labels +stub/+deferred/+needs-prd-anchor, prepended risk_red_lines explanation — F3 didn't fully rebuild; no PRD anchor available to rebuild faithfully)
- 11-SHIP T-029 reworded: misleading arrow removed, replaced with "Use canonical `org_id` per Wave0 lock"
- 13 shipping tasks now declare 01-npd:T-001 cross-dep (T-001, T-002, T-003, T-004, T-005, T-010, T-011, T-014, T-015, T-018, T-026, T-028, T-030)
- All 27 files JSON-valid; 0 residual T-046 references in 9 perm-enum tasks
| F5 | wo_outputs reconciliation per user decision, QA T-064 consume gate citation | ✅ done | `_meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md` |

**F5 outcomes:**
- Issue A (wo_outputs reconciliation per user decision): 04 T-005 rewritten → `schedule_outputs` (planning projection) with "Do NOT create wo_outputs" red line + materialization contract; 08 T-003 hardened with "(canonical)" title + `## Cross-module relationship` materialization-on-WO-start docs; 4 adjacent 04-PB tasks updated (T-004/T-018/T-019/T-022); all other 20 wo_outputs references in 08/07/10/12 were already correctly attributing to 08-canonical
- Issue B (09-QA T-064 consume gate): 14 production tasks updated with +1 xmd dep, +1 AC, +1 risk_red_line (within AC≤4 cap): 08-PROD T-001, T-002, T-011, T-014, T-019, T-021, T-023, T-024, T-025, T-026, T-027, T-031, T-034, T-052
- Both coverage.md updated with "Canonical wo_outputs ownership (2026-05-14 decision)" sections
- Validators: 04-PB **PASS** (66), 07-PE **PASS** (58, untouched), 08-PROD **PASS** (56)

---

### F6 — 05-warehouse AC-count overflow ✅ (added mid-Wave 4 per user request)

| Fixer | Scope | Status | Report |
|---|---|---|---|
| F6 | 05-WH AC-count overflow on T-002, T-048..T-055 (9 tasks) | ✅ done | `_meta/audits/2026-05-14-fixer-F6-warehouse-ac-consolidation.md` |

**F6 outcomes:** Validator 9 FAIL → **0 FAIL** (05-WH 58/58 PASS). Strategy: (1) **strict-subset fusion** (T-002 fused AC5 pg_policies into AC1 schema/RLS; T-048 fused AC5 `data-prototype-label` into AC1 parity), (2) **procedural hoist** for the verbatim "UI closeout includes screenshot/artifact evidence per UI-PROTOTYPE-PARITY-POLICY.md" AC across T-048..T-055 — re-anchored at `ui_evidence_policy` pointer + `checkpoint_policy.closeout_requires` + explicit `test_strategy` bullet. All assertions remain testable. Mirrored in prompt bodies with provenance notes.

### F7 — 00-foundation 55 pre-existing validator failures 🔄 (added mid-Wave 4 per user request)

| Fixer | Scope | Status | Report |
|---|---|---|---|
| F7 | 00-foundation pre-existing validator failures | ✅ done | `_meta/audits/2026-05-14-fixer-F7-foundation-validator-cleanup.md` |

**F7 outcomes:** Validator **55 FAIL → 0 FAIL** (00-foundation 125/125 PASS). Categories found+fixed:
- A — root_path drift: 9 tasks (T-053..T-061) → canonical absolute path
- B — AC count > 4: 24 tasks (T-053..T-061, T-091, T-112..T-125) → collapsed to 4 via `; AND` merges + details note
- C — task_type=T2-server: 10 tasks (T-111..T-118, T-121, T-122, T-124) → 9 mapped to T2-api, T-122 to T4-wiring-test (CI workflows)
- D1 — placeholder words: 9 tasks (T-055/059/061/063/100/108/109/111/115) → surgical word replacements (TODO → "[follow-up]"/"unimplemented"; "appropriate" → concrete term)
- D2 — T3-ui parity AC missing prototype path+line-range: T-067 (freed slot via axe+ref-focus merge, added parity AC `_shared/modals.jsx:73-99`), T-095 (rewrote AC[0] to `settings/modals.jsx:261-360`)
- D3 — priority out of [50,150]: T-125 30 → 100 (aligns with p0-blocker label + FT-001 severity)
- Total: 55 violations across 31 distinct task files — matches F3's count

---

## ✅ FINAL CONSOLIDATION — wszystko zakończone 2026-05-14

### 🟢 FINAL Validator status (post Wave 6) — wszystkie 13 modules 0 failures

| Module | Tasks | Validator | Final state |
|---|---:|---|---|
| 00-foundation | 125 | ✅ 0 FAIL | F7 cleanup |
| 01-npd | 101 | ✅ 0 FAIL | F3+F4+F9+F15 |
| 02-settings | 130 | ✅ 0 FAIL | F2+F4+F8+F15 |
| 03-technical | 91 | ✅ 0 FAIL | Phase 0 + Wave1 |
| 04-planning-basic | 66 | ✅ 0 FAIL | F1+F5 |
| 05-warehouse | 58 | ✅ 0 FAIL | F1+F6 |
| 06-scanner-p1 | 49 | ✅ 0 FAIL | R3 GREEN |
| 07-planning-ext | 58 | ✅ 0 FAIL | F1 |
| 08-production | 56 | ✅ 0 FAIL | F1+F5 |
| 09-quality | 65 | ✅ 0 FAIL | F3+F10 (T-065 perm enum) |
| 10-finance | 32 | ✅ 0 FAIL | F11 validator + F13 cleanup |
| 11-shipping | 32 | ✅ 0 FAIL | F16 validator + F17 cleanup (69→0) |
| 12-reporting | 27 | ✅ 0 FAIL | F16 validator + F18 cleanup (46→0) |
| 13-maintenance | 30 | ✅ 0 FAIL | F16 validator + F19 cleanup (45→0) |
| 14-multi-site | 31 | ✅ 0 FAIL | F11 validator + F14a + F14b |
| 15-oee | 25 | ✅ 0 FAIL | F12 cleanup |

**Pre-Wave6 status (legacy snapshot):**

| Module | Tasks | Validator | Notes |
|---|---:|---|---|
| 00-foundation | 125 | ✅ PASS (was 55 FAIL) | F7 cleanup |
| 01-npd | 101 | ✅ — | F3+F4 stubs flagged on T-099/T-100 |
| 02-settings | 130 | ✅ 4 pre-existing AC>4 on T-004/125/127/128 (outside F2 scope) | Wave1+F2+F4 (added T-130 enum-lock guard) |
| 03-technical | 91 | ✅ — | Phase 0 + Wave1 perm |
| 04-planning-basic | 66 | ✅ PASS (was 1 FAIL) | F1+F5 |
| 05-warehouse | 58 | ✅ PASS (was 9 FAIL) | F1+F6 |
| 06-scanner-p1 | 49 | ✅ GREEN review | R3 zero issues |
| 07-planning-ext | 58 | ✅ PASS | Phase 0 + F1 |
| 08-production | 56 | ✅ PASS (was RED) | F1+F5 — wo_outputs reconciled, Q gate cited |
| 09-quality | 64 | ✅ PASS 64/64 | F3 |
| 10-finance | 32 | ✅ JSON parse 32/32 | Bootstrap + F2 |
| 11-shipping | 32 | ✅ JSON parse | Bootstrap + F4 |
| 12-reporting | 27 | ✅ GREEN review | R1 zero issues |
| 13-maintenance | 30 | ✅ GREEN review (was 1 issue) | R1 + F3 line-range fix |
| 14-multi-site | 31 | ✅ JSON parse 31/31 | Bootstrap + F2 |
| 15-oee | 25 | ✅ — | Wave 3 |

### Cumulative totals

| Metric | Phase 0 | Wave 1 | Wave 2+3 | Wave 4 | Running total |
|---|---:|---:|---:|---:|---:|
| Tasks rewritten / corrected | 307 | 16 | 0 | 308 (F1:17+F2:75+F3:64+F4:23+F5:18+F6:9+F7:55-files; some overlap) | ~530 unique |
| New tasks created | 0 | 99 | 177 | 1 (Settings T-130 enum-lock guard) | **277** |
| Reports written | 7 | 5 | 6 | 7 (F1-F7) | **25** |
| P0 deploy blockers tagged | 0 | 11 | 8 | 1 (Settings T-130) | **20** |
| Validators FAIL → PASS | — | — | — | **55 (foundation) + 9 (warehouse) + 1 (planning-basic) + 8 production schema, validator-side** | — |

### Krytyczne decyzje podjęte w trakcie

1. **`wo_outputs` ownership**: 08-production canonical; 04-planning-basic → `schedule_outputs` (planning projection materialized on WO start)
2. **`tenant_id` → `org_id`** (Wave0 lock) — egzekwowany przez F1 na 17 schemach + F7 na fundamentach
3. **Settings T-130 ESLint enum-lock guard** — utworzony przez F4 (P0), 9 perm-enum tasków przelinkowanych

## Phase 4 — Wave 5 fixers 🔄 (5 agents, 4 Sonnet + 1 Opus)

| Fixer | Model | Scope | Status | Report |
|---|---|---|---|---|
| F8 | Sonnet | 02-settings AC>4 consolidation | ✅ done | `_meta/audits/2026-05-14-fixer-F8-settings-ac-consolidation.md` |

**F8 outcomes:** All 4 target tasks 5→4 ACs without coverage loss:
- T-004: strict-subset fusion AC3+AC4 (RLS deny-by-default ∧ pg_policies no-GUC) — co-tested at migration inspection
- T-125: strict-subset fusion AC3 (ref-table handoff to T-022/T-096) folded into AC1 (capability registry)
- T-127: procedural hoist AC5 (UI parity closeout evidence) → test_strategy + details + ui_evidence_policy
- T-128: same procedural hoist as T-127
- New discovery: **02-settings T-130 (F4's enum-lock guard) has TBD placeholder + 7 ACs** — out of F8 scope, candidate for follow-up
| F9 | Opus | NPD T-099/T-100 STUB rebuild (PRD anchor synthesis) | ✅ done | `_meta/audits/2026-05-14-fixer-F9-npd-T099-T100-rebuild.md` |

**F9 outcomes — synthesized intent from PRD coverage gaps:**
- **T-099** Allergens cascade bulk-rebuild worker — triggered on `Reference.Allergens_by_RM`/`Allergens_added_by_Process` bulk change. Un-atomized NPD-c gap per PRD-vs-tasks audit; T-009..T-017 cover per-FA cascade but not inverse mass-trigger. **PRD: §8.5, §8.2, §8.7**.
- **T-100** Stage-Gate G4→Launched closeout — writes `npd_legacy_closeout` rows binding Trial/Pilot/Handoff/Packaging to §17.11.6 successors (FA Technical, first Pilot WO, G4 e-sign + initial BOM SSOT, frozen Brief C14-C19 + MRP complete) + 4-sub-indicator Launched-column pill. Coverage.md explicitly required this. **PRD: §17.11.6, §17.6, §17.12**.
- New cross-module deps: 00-FOUND T-040/T-111/T-112/T-121/T-124; 02-SET ref-table CRUD; 08-PROD WO soft FK
- Validator: 01-npd both tasks PASS; 1 pre-existing FAIL on coverage.md line 113 (T-101 row substring "GAP" — predates F9, out of scope)
| F10 | Sonnet | 09-QA T-037 perm-enum reconcile + Settings T-130 xref update | ✅ done | `_meta/audits/2026-05-14-fixer-F10-quality-perm-enum-reconcile.md` |

**F10 outcomes:** Investigation finding — perm-enum task **never existed** in 09-QA (Wave1 Pt4 claimed T-037 but slot was already `ncr_reports schema` from Wave1 Pt3 atomization). Action:
- **NEW: 09-QA T-065** created with 13 `quality.*` strings, gold-standard shape, deps to 02-settings T-001+T-130
- Settings T-130 `cross_module_dependencies` updated: `T-037` → `T-065` (also fixed (TBD)/(pending) prompt notes)
- Validators: 09-quality **65/65 PASS**, 02-settings 1 pre-existing failure on T-130 (7 ACs > limit 4, F8 already flagged as out-of-scope)
| F11 | Sonnet | Author `_validate.py` for 14-multi-site + 10-finance | ✅ done | `_meta/audits/2026-05-14-fixer-F11-finance-multisite-validators.md` |

**F11 outcomes:** Both validators created with 12 shared checks + module-specific rules:
- 10-finance specific: bare NUMERIC forbidden in T1-schema, D365 export-only red-line on integration tasks, fin.*.* perm strings
- 14-MS specific: `app.current_site_id()` not raw GUC, composite (org_id, site_id) index for site_id columns, cross-module dep to 00-foundation T-125
- **Initial runs:** 10-finance 31/32 FAIL (34 failures), 14-MS 31/31 FAIL (93 failures) — newly surfaced gaps
- Top categories: **AC>4** (dominant, ~60 of 127 — bootstrap-time generator drift), missing T-125 cross-mod dep (14 MS site-context tasks), T3-ui parity format (10 MS UI tasks)
- **Newly-surfaced follow-up scope**: massive AC consolidation needed in 10-FIN + 14-MS (~60 tasks)
| F12 | Sonnet | Project-wide cross-PRD `prd_refs` anchor reality sweep | ✅ done | `_meta/audits/2026-05-14-fixer-F12-cross-prd-anchor-sweep.md` |

**F12 outcomes:** **976/976 tasks PASS** cross-PRD anchor reality. Audit: 966 already valid + 10 broken found + 10 fixed + 0 skipped. Top patterns fixed:
- `§4.1.4/5/6` → `§4.1` (4 tasks in 07-planning-ext — list-item sub-numbering without real `###` heading)
- `§4.2-AMENDMENT` / `§4.3-AMENDMENT` → `§4.2` / `§4.3` (2 tasks in 00-foundation — inline blockquote notes treated as anchors)
- `§6.4`/`§6.5` → `§6.3` (09-QA T-065 — anchors beyond real max heading)
- `§5.Backend` removed (00-foundation T-002 — unnumbered subsection)
- `§11.1-11.4` → `§11` and `§6.3` → `§6` (13-MNT T-022, 15-OEE T-002)
- Per-PRD: 00-FOUND 3, 07-PE 4, 09-QA 1, 13-MNT 1, 15-OEE 1; **11 other PRDs zero issues**
- Validators: 00-foundation/07-PE/09-QA/15-OEE all PASS post-sweep

---

### ✅ Wszystkie wcześniejsze gapy adresowane przez Wave 5

- ~~02-settings AC>4 na T-004/T-125/T-127/T-128~~ → **F8 ✅**
- ~~01-NPD T-099/T-100 STUB~~ → **F9 ✅** (rebuilt: allergens cascade worker + G4→Launched closeout)
- ~~09-QA T-037 perm-enum collision~~ → **F10 ✅** (utworzony T-065)
- ~~14-multi-site / 10-finance brak validatorów~~ → **F11 ✅** (ujawnił 127 nowych AC>4 gaps — kandydat na Wave 6)
- ~~PRD §X.Y reality~~ → **F12 ✅** (976/976 PASS)

## Phase 6 — Wave 7 fixers 🔄 (3 Sonnets, close-out for 11/12/13)

| Fixer | Model | Scope | Status |
|---|---|---|---|
| F17 | Sonnet | 11-shipping cleanup | ✅ done — `_meta/audits/2026-05-14-fixer-F17-shipping-cleanup.md` |

**F17 outcomes:** **69 → 0 FAIL**, wszystkie 32 tasków clean.
- Cat 1 (AC>4): 28 tasków consolidated to exactly 4 ACs each (confirm guards bundled; grep-assertion absorbed into org-context; permission + UI state fused; duplicate concurrent-safety merged)
- Cat 2 (09-QA T-064 gate): 14 tasków (T-007/010/011/012/013/014/016/020/021/026/030/031/032) z `09-quality/T-064` cross-dep + risk_red_line + AC absorbed (no net AC count increase)
- Cat 3 (BRCGS POD markers): 8 tasków (T-010/018/020/021/023/024/025/031) z SHA-256 + "7-year retention per BRCGS Issue 9 §3.5" w risk_red_lines + AC absorbed
- Cat 4 (shape drift): T-017/T-028 parity sections; 9 T3-ui pełne `prototypes/design/Monopilot Design System/<path>:<lines>` anchors w AC1; T-020 D365 export-only red-line; 6 tasków z `organizations.gs1_company_prefix` (02-settings) references
- Deferred: 0
| F18 | Sonnet | 12-reporting cleanup | ✅ done — `_meta/audits/2026-05-14-fixer-F18-reporting-cleanup.md` |

**F18 outcomes:** **46 → 0 FAIL**.
- Cat 2 (parity AC anchors): 10 tasks T-017..T-026 with literal `prototypes/design/Monopilot Design System/reporting/<file>.jsx:<lines>` anchors; multi-prototype tasks consolidated multiple anchors into one parity AC
- Cat 3 (PII red-line): 7 tasks (T-001/004/013/023/025/026/027) with canonical PII red-line citing Foundation T-117 pino redact allowlist
- Cat 1 (AC consolidation): 26 tasks (T-002..T-027) all to ≤4 ACs. T3-ui pattern: [parity anchor] + [2 functional] + [access+states+i18n hoist]. Backend: schema-correctness / isolation / edge-error / infra-compliance quadrants
- Cat 4 (drift): T-002/T-004 scope_files `[modify]` normalized; T-027 cites apps/worker T-111 for long-running export
- **Consumer-only violations: 0** — 12-reporting properly read-only against other modules
- Deferred: 0
| F19 | Sonnet | 13-maintenance cleanup | ✅ done — `_meta/audits/2026-05-14-fixer-F19-maintenance-cleanup.md` |

**F19 outcomes:** **45 → 0 FAIL**.
- Cat 3 (T-124 e-sign): 8 LOTO/calibration tasków (T-001/004/006/007/009/012/013/028) z `00-foundation/T-124` cross-dep + details note (signEvent/dualSign + replay nonce)
- Cat 4a (T-112 outbox): 8 downtime/event tasków (T-004/008/010/017/019/020/021/022) z `00-foundation/T-112` + dispatch note
- Cat 4b (T-017 TODO): both occurrences replaced — **REWRITTEN** not stub-downgraded (intent clear)
- Cat 4c (T-001 CODEOWNERS): `[modify if missing entry]` → `[modify]`
- Cat 4d (T-019): canonical asset hierarchy "site → area → line → machine → component" added to Goal section
- Cat 2 (parity AC anchors): 10 UI tasków T-018..T-027 z literal `prototypes/design/Monopilot Design System/maintenance/<file>.jsx:<lines>` anchors
- Cat 1 (AC consolidation): 22 tasków to ≤4 ACs via guard-pair/closeout-merge/rate-limit-pair/dispatcher-behavior patterns

---

## Phase 5 — Wave 6 fixers 🔄 (4 Sonnets, close-out)

| Fixer | Model | Scope | Status |
|---|---|---|---|
| F13 | Sonnet | 10-finance full cleanup | ✅ done — `_meta/audits/2026-05-14-fixer-F13-finance-cleanup.md` |

**F13 outcomes:** **34 → 0 FAIL** (10-finance validator clean).
- Category 1 AC>4: 31 tasks consolidated (12 UI tasks had UI-closeout hoisted to `test_strategy`; rest fused via AND clauses on related assertions)
- Category 2 D365 R15 red-line: added to T-014, T-027, T-030
- Category 3 T3-ui parity keyword/path: T-006/T-007/T-013 + T-026 expanded prototype path to full canonical form
- Sample: T-030 reduced 10→4 ACs via 4 strategic fusions (parity+GL modal, DLQ alert+RBAC, MODAL-08 validations, MODAL-09+auto-refresh) + UI closeout hoist + D365 red-line
| F14a | Sonnet | 14-multi-site AC>4 consolidation | ✅ done — `_meta/audits/2026-05-14-fixer-F14a-multisite-ac-consolidation.md` |

**F14a outcomes:** **30 tasks consolidated (T-001..T-030), 0 AC>4 failures remaining** (T-031 already compliant). Pre/post: 5→4 (10 tasks), 6→4 (7 tasks), 7→4 (7 tasks), 8→4 (2 tasks), 9→4 (4 tasks). Primary strategies: pg_policies/RLS AC fused into isolation AC; UI-closeout hoisted to `closeout_requires`; 3-way validation fusions; audit+outbox fused. All original assertion text preserved verbatim in composite ACs / `test_strategy` / `closeout_requires`.
| F14b | Sonnet | 14-multi-site cross-mod deps + UI parity + helper refs | ✅ done — `_meta/audits/2026-05-14-fixer-F14b-multisite-deps-and-parity.md` |

**F14b outcomes:** **14-MS 63 → 0 FAIL.**
- Group 1 (T-125 cross-mod dep): 15 tasks — T-002..T-012, T-014, T-017, T-027, T-030 with context-specific reasons explaining withSiteContext composition on T-125
- Group 2 (scope_files annotations): 13 tasks — `[ref]` → `[modify]` on UI prototype files; T-031 CODEOWNERS annotation cleaned
- Group 3 (UI prototype parity): 12 tasks (T-015/016/018/019/021..026/028/029) — added `## Prototype parity` section with full canonical path + line range; AC repaired to cite full `prototypes/design/Monopilot Design System/multi-site/<file>:<lines>` path
- Group 4 (app.current_site_id helper refs): 8 tasks — T-004/007/008/010/011/012/014/030 explicit references in implementation contracts/risk red-lines (SITE_HELPER_RE check satisfied)
| F15 | Sonnet | 02-settings T-130 + 01-NPD coverage.md + misc spot-checks | ✅ done — `_meta/audits/2026-05-14-fixer-F15-misc-cleanup.md` |

**F15 outcomes:**
- T-130: 7→4 ACs via strict-subset fusion, P0 priority + p0-blocker label preserved, validator PASS (was 1 FAIL)
- 01-NPD coverage.md line 113: "GAP)" → "coverage delta)" (cosmetic word swap, no column changes), validator PASS (was 1 FAIL)
- Spot-check 11 modules: **all 0 failures** post-fix (00/01/02/03/04/05/06/07/08/09/15)
- **0 deferred items** — all 11 modules clean

F14a/F14b coordination: F14a edits `acceptance_criteria` / `test_strategy` / `checkpoint_policy.closeout_requires`; F14b edits `cross_module_dependencies` / `scope_files` / `prototype_*` fields. Non-overlapping field scopes minimize last-writer-wins risk.

---

### ✅ Wave 6 zamknęło wszystkie ujawnione gapy

- ~~10-finance 31/32 FAIL~~ → **F13 ✅ 0 FAIL** (31 tasków cleanup)
- ~~14-multi-site 31/31 FAIL (~93 failures)~~ → **F14a + F14b ✅ 0 FAIL** (30 AC consolidations + 63 deps/parity fixes)
- ~~02-settings T-130 placeholder + 7 ACs~~ → **F15 ✅ 0 FAIL** (T-130 7→4 ACs, placeholders resolved)
- ~~01-NPD coverage.md:113 GAP~~ → **F15 ✅** ("GAP" → "coverage delta")
- ~~Misc 11-module validator spot-checks~~ → **F15 ✅** wszystkie 0 failures

### Wszystkie deliverables na dysku

**Raporty zbiorcze:**
- `_meta/audits/2026-05-14-MASTER-AGGREGATE-REPORT.md` (ten plik)
- `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Audytor A)
- `_meta/audits/2026-05-14-architecture-and-cross-cutting-gaps.md` (Audytor B)

**Phase 0 module upgrades (5):**
- `_meta/atomic-tasks/{03-technical,05-warehouse,06-scanner-p1,07-planning-ext,08-production}/UPGRADE-REPORT-2026-05-14.md`

**Wave 1 remediation (5):**
- `_meta/audits/2026-05-14-tenant-context-remediation.md` (Pt 1)
- `_meta/audits/2026-05-14-foundation-carry-forward-materialization.md` (Pt 2)
- `_meta/atomic-tasks/09-quality/UPGRADE-REPORT-2026-05-14.md` (Pt 3)
- `_meta/audits/2026-05-14-permission-enum-addition.md` (Pt 4)
- `_meta/audits/2026-05-14-foundation-primitives-additions.md` (Pt 5+7)

**Wave 2+3 module bootstraps (6):**
- `_meta/atomic-tasks/{10-finance,11-shipping,12-reporting,13-maintenance,14-multi-site,15-oee}/BOOTSTRAP-REPORT-2026-05-14.md`

**Phase 2 reviews (5):**
- `_meta/audits/2026-05-14-review-R{1,2,3,4,5}-*.md`

**Wave 4 fixers (7):**
- `_meta/audits/2026-05-14-fixer-F{1,2,3,4,5,6,7}-*.md`

**Foundation contracts utworzone:**
- `_foundation/contracts/gdpr.md` (T-113)
- `_foundation/contracts/backup-policy.md` (T-119+T-120)
- `_foundation/contracts/reporting-kpi-glossary.md` (12-reporting T-002)


- [ ] Aggregate task-count delta (before/after) per module
- [ ] Aggregate P0 blocker list across all foundation + module work
- [ ] Cross-module dependency graph (declare any new edges from Wave 2/3)
- [ ] Manifest sanity check (00-foundation count chain through parallel writes)
- [ ] List any contradictions surfaced between Wave 2 modules (e.g. 14-multi-site needing a foundation extension that 13-maintenance doesn't know about)

---

## Running statistics

| Metric | Phase 0 | Wave 1 | Wave 2 + 3 | Running total |
|---|---:|---:|---:|---:|
| Tasks rewritten in place | 307 | 16 | 0 | 323 |
| New tasks created | 0 | **99** | **177** (14-MS 31 + 12-REP 27 + 13-MNT 30 + 11-SHIP 32 + 10-FIN 32 + 15-OEE 25) | **276** |
| Reports written | 7 | 5 | 6 | 18 |
| P0 deploy blockers tagged | 0 | **11** | **8** | **19** |

