# Reviewer R2 — Atomic Task Audit (02-settings, 10-finance, 14-multi-site)

**Reviewer**: R2
**Date**: 2026-05-14
**Modules**: `02-settings` (129 tasks) · `10-finance` (32 tasks) · `14-multi-site` (31 tasks)
**Gold standards used**: `01-npd/T-001`, `01-npd/T-052`, `02-settings/T-001`, `02-settings/T-041`, `UI-PROTOTYPE-PARITY-POLICY.md`
**Raw evidence**: `_meta/audits/_r2_findings_refined.json` · `_meta/audits/_r2_table.md`

---

## Section 1 — Executive summary

### Counts

| Module | Reviewed | Tasks passing all 10 checks | Tasks with ≥1 issue | JSON parse |
|---|---|---|---|---|
| 02-settings | 129 | 60 | 69 | 129/129 ok |
| 10-finance | 32 | 28 | 4 | 32/32 ok |
| 14-multi-site | 31 | 1 (T-001) | 30 | 31/31 ok |
| **TOTAL** | **192** | **89** | **103** | **192/192 ok** |

Total distinct findings: **158** (P1: 102, P2: 56, P0: 0).
Distribution by category: shape 34, risk 48, test 54, ui 14, deps 8.

### Top-5 systemic issues

1. **14-multi-site: every task except T-001 omits `pipeline_inputs.details`** (30/31 tasks). Schema field is required by gold standard and consumed by the kira_dev pipeline templates. The descriptive content lives in `prompt` and the `description` field instead — pipeline conventions diverge from 01-npd / 02-settings.
2. **02-settings: ~45 tasks have only 1 `risk_red_lines` entry** (T-003 through T-040, T-080..T-095, T-016, T-018). Gold standard mandates ≥2 concrete entries per task. Many of these are T1-schema / T2-api enum-append tasks where the second red line ("don't drop existing strings", "don't widen scope") is trivially missing.
3. **02-settings: ~50 tasks have `test_strategy` arrays that do not contain a runnable `pnpm` / `vitest` / `playwright` command** (e.g. T-003: `["RED: extend events.test.ts.", "GREEN: append events."]`). Gold standard explicitly anchors each test_strategy entry on `pnpm --filter @monopilot/web vitest run …`.
4. **14-multi-site: chained-task `parallel_safe_with` declares the previous task while also depending on it** (T-010↔T-009, T-014↔T-013, T-016↔T-015, T-018↔T-017). Same defect appears in finance (T-013/020/026/029). Generator is putting the predecessor into both arrays; the audit invariant is they must be disjoint.
5. **02-settings: 12 spec-driven UI tasks (T-104..T-115, T-118) declare neither an exact prototype path nor an explicit "spec-driven" sentence from the parity policy**. They reference `02-SETTINGS-UX.md §X.Y` but omit the required parity declaration the policy demands. Reviewers cannot validate prototype linkage without that declaration.

### Overall verdict per module

| Module | Verdict | Rationale |
|---|---|---|
| 02-settings | **AMBER** | High value content (T-001..T-040 / T-041..T-115 enum + RLS + UI parity layer) is sound, foundation references (`app.current_org_id()`, `withOrgContext`) are correct, T-015 RLS contract is gold-standard quality. But 60% of tasks (69/129) have at least one P1/P2 quality drift: weak risk_red_lines, weak test_strategy, missing parity declaration, and 4 late-added tasks (T-124..T-127) missing `out_of_scope`/`routing_hints`. Quality "below npd/settings exemplar" exactly as the brief warned. |
| 10-finance | **GREEN** | Only 4 findings, all of the same class (parallel_safe_with overlap). Foundation primitives correctly referenced (T-014 wiring → outbox → 12-REP; T-027 finance_outbox schema; T-028 D365 dispatcher + DLQ). Cost-per-kg dual ownership documented across T-010/T-011/T-014. **One gap**: no task contains an explicit "NEVER mutates `factory_release_state`" red line for the D365 dispatcher (see §5). |
| 14-multi-site | **AMBER** | T-001 foundation extension (`withSiteContext` composing on `withOrgContext` / T-125) is exemplary — SECURITY DEFINER, LEAKPROOF, source-grep AC, cross_module_dependencies declared. T-030 activation migration is thorough. But systemic shape defect (`details` missing on 30/31 tasks) + perm-enum task T-031 mis-references "02-settings T-046" as the ESLint enum-lock guard (T-046 is SET-006 Onboarding Completion). |

---

## Section 2 — Per-task findings table

Full table in `_meta/audits/_r2_table.md` (158 rows). Excerpt below — representative entries; remediation should consume the full table file.

| Module | Task ID | Issue category | Description | Severity |
|---|---|---|---|---|
| 02-settings | T-003 | risk | <2 risk_red_lines (1) | P1 |
| 02-settings | T-003 | test | no concrete pnpm/vitest/playwright cmd | P2 |
| 02-settings | T-015 | test | no concrete pnpm/vitest/playwright cmd | P2 |
| 02-settings | T-104..T-115 | ui | UI task has neither prototype path nor spec-driven declaration | P1 |
| 02-settings | T-118 | ui | UI task has neither prototype path nor spec-driven declaration | P1 |
| 02-settings | T-124..T-127 | shape | missing pipeline_inputs.out_of_scope + routing_hints | P1 |
| 02-settings | T-129 | ui | UI task missing ui_evidence_policy | P2 |
| 10-finance | T-013 | deps | psw overlaps deps: {T-012} | P1 |
| 10-finance | T-020 | deps | psw overlaps deps: {T-019} | P1 |
| 10-finance | T-026 | deps | psw overlaps deps: {T-025} | P1 |
| 10-finance | T-029 | deps | psw overlaps deps: {T-028} | P1 |
| 14-multi-site | T-002..T-031 (30/31) | shape | missing pipeline_inputs.details | P1 |
| 14-multi-site | T-010 | deps | psw overlaps deps: {T-009} | P1 |
| 14-multi-site | T-014 | deps | psw overlaps deps: {T-013} | P1 |
| 14-multi-site | T-016 | deps | psw overlaps deps: {T-015} | P1 |
| 14-multi-site | T-018 | deps | psw overlaps deps: {T-017} | P1 |
| 14-multi-site | T-020 | ui | cites prototype path but prototype_match=false (not declared spec-driven) | P2 |

See `_meta/audits/_r2_table.md` for the complete 158-row matrix and `_meta/audits/_r2_findings_refined.json` for machine-readable form.

---

## Section 3 — Cross-module integration gaps

### 3.1 Settings hub references from other modules

| Module | Task | Action | Status |
|---|---|---|---|
| 10-finance | T-001 (`fin.*` perm enum) | Should declare `cross_module_dependencies` → Settings T-001/T-002 (enum file owner) | **MISSING** — `dependencies: []`, no `cross_module_dependencies`. |
| 14-multi-site | T-031 (`multi_site.*` perm enum) | Declares cross-module dep on Settings T-001 ✓ AND Settings T-046 as "ESLint enum-lock guard" | **WRONG REFERENCE** — Settings T-046 is "SET-006 Onboarding Completion (confetti + next-step cards)", not the enum-lock ESLint rule. There is no enum-lock-guard task in 02-settings; the rule appears to be implicit in T-001's CODEOWNERS lock and the radix-dialog ESLint rule lives at `apps/web/eslint.config.mjs:25` / `packages/ui/eslint.config.mjs:13`. |

**Recommendation**: either (a) add a Settings task that materialises an `ALL_<MODULE>_PERMISSIONS` ESLint enum-lock rule and re-point T-031, or (b) reword T-031 to reference Settings T-001 only and drop the false T-046 anchor.

### 3.2 14-multi-site T-001 foundation composition

T-001 correctly composes on top of foundation T-125 (`withOrgContext`) and T-007 (`set_org_context` pattern) via `cross_module_dependencies` — does NOT replace, does NOT couple to a single module. Red lines enumerate: "Do not bypass `withOrgContext` — site context is layered on top, not in place of, org context." **PASS.**

### 3.3 14-multi-site T-030 activation migration coverage

T-030 narrative says "20 operational tables across 9 modules" but `cross_module_dependencies` lists only **8 modules** (05/08/09/10/11/13/15 + 00-foundation). **`12-reporting` is named in §9.8 and the narrative but absent from cross_module_dependencies.** Verified via `grep -c "12-reporting" T-030.json` → 0. Add 12-reporting to cross_module_dependencies.

Table count check: 4 (warehouse) + 5 (production) + 4 (quality) + 2 (finance) + 2 (shipping) + 3 (maintenance) + 1 (oee) = 21 tables enumerated in the SQL. PRD §9.8 specifies 20. One spurious table or a count drift; reconcile.

### 3.4 02-settings T-015 → withOrgContext

T-015 explicitly imports `withOrgContext` semantics (NOT `SET LOCAL` GUC), references `app.set_org_context($1::uuid, $2::uuid)`, lists in risk_red_lines: "Do not use SET LOCAL app.current_org_id (spoofable GUC) — call app.set_org_context(session_token, org_id) instead." **PASS — gold-standard quality.**

### 3.5 Outbox / cron / e-sign / rate-limit primitives

Spot-checked across finance T-014, T-027, T-028 (outbox consumer registry, finance_outbox_events schema, daily-consolidator cron via `apps/worker`) — references are correct. Settings T-003 also locks the `outbox events.enum.ts` correctly. No misuse of legacy `current_setting('app.tenant_id')` was detected anywhere except inside explicit "Do not …" red lines.

---

## Section 4 — Prototype linkage report

### 4.1 02-settings UI parity

- Tasks with literal prototype `file:lines` reference + `prototype_match: true`: T-041..T-076, T-077..T-079 (partial), T-119, T-120, T-121, T-127, T-128 — gold-standard quality (e.g. T-041 cites `prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238`).
- Tasks correctly using **spec-driven** declaration (UX-only, no exact prototype): T-077, T-078, T-096..T-102 explicitly say "spec-driven from `prototypes/design/02-SETTINGS-UX.md`" with `prototype_match: false`. **PASS.**
- **Gap**: T-104..T-115, T-118 are §12.2/§13.4/etc UI tasks with `prototype_match: false` but the prompt body lacks both (a) the parity-policy "Spec-driven" sentence and (b) an exact prototype path. Per `UI-PROTOTYPE-PARITY-POLICY.md` lines 7-10 ("Every UI task must declare one of …"), this fails the policy. Either add the spec-driven sentence or declare a nearest reusable prototype pattern.
- T-129 (User Menu Language Picker SET-100) is missing `ui_evidence_policy` despite being a T3-ui task.

### 4.2 14-multi-site UI parity

- T-020 (Site Switcher / dropdown surface) cites prototype path in the prompt but has `prototype_match: false`. Either flip to `true` + add Prototype-parity section, OR add the spec-driven declaration sentence.
- Other UI tasks (T-021..T-026 admin surfaces) are spec-driven and correctly so flagged.

### 4.3 10-finance UI parity

No UI parity findings — finance UI tasks (T-021..T-026) all have either `prototype_match: true` + literal path, or the spec-driven UX declaration.

---

## Section 5 — Recommended fixes (prioritised)

### P1 (must fix before opening any task to the pipeline)

1. **14-multi-site: add `pipeline_inputs.details` to T-002..T-031** (30 tasks). Source text from existing `description` + first paragraph of `prompt.## Goal`. Bulk-regen via the BOOTSTRAP-REPORT-2026-05-14 generator would be cleanest.
2. **14-multi-site T-031: fix the false cross-module reference to "02-settings T-046"**. Either rename to T-001 only, or atomise an actual enum-lock-guard task in 02-settings (recommended: new T-130 "ESLint rule: `ALL_<MODULE>_PERMISSIONS` registry guard").
3. **All overlapping `parallel_safe_with` ↔ `dependencies` (8 tasks)**: 10-finance T-013, T-020, T-026, T-029; 14-multi-site T-010, T-014, T-016, T-018. Remove the predecessor from `parallel_safe_with`.
4. **02-settings T-104..T-115, T-118**: add either a literal prototype `file:lines` path OR the parity-policy spec-driven sentence "Spec-driven from `prototypes/design/02-SETTINGS-UX.md §X.Y` plus the nearest reusable prototype pattern at <path>".
5. **02-settings T-124..T-127**: add `out_of_scope` and `routing_hints` fields to match the gold-standard shape.
6. **02-settings: raise `risk_red_lines` to ≥2 entries on the ~45 single-line tasks** (T-003..T-040 and T-080..T-095 ranges). The natural second entry on each enum-append task is "Do not remove or rename existing strings" + "Do not extend scope beyond listed namespaces"; the natural second entry on schema-append tasks is "Do not weaken existing acceptance criteria from prior migrations."

### P1 (D365 / finance)

7. **10-finance T-028 D365 dispatcher**: add an explicit red line "**Dispatcher is export-only — MUST NOT mutate `factory_release_state` (or any 08-PROD owned table); writes are limited to `finance_outbox_events`, `d365_finance_dlq`, and `work_order_costs.posted_to_d365_at`/`d365_journal_id`**." Currently implied via the file-scope but not enforced as a red line.
8. **14-multi-site T-030 activation**: add `12-reporting` to `cross_module_dependencies` and reconcile the 20-vs-21 table count between PRD §9.8 and the SQL enumeration.

### P2 (quality lift)

9. **02-settings: enrich `test_strategy` on ~50 tasks** to include a concrete `pnpm --filter @monopilot/web vitest run <path>` (or `pnpm --filter @monopilot/db test:integration -- <slug>`) per gold-standard T-001.
10. **02-settings T-129**: add `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.
11. **14-multi-site T-020**: either flip `prototype_match` to `true` + add `## Prototype parity` section, or add the spec-driven declaration.

### Out of scope / informational

- 10-finance cost-per-kg dual ownership IS documented in T-010 (RLS policy), T-011 (precedence semantics), T-014 (outbox handler writes precedence). No remediation needed.
- 02-settings T-015 `withOrgContext` foundation reference IS correct.
- 14-multi-site T-001 foundation extension IS correct.

---

## Appendix A — Audit script & raw outputs

- Refined JSON findings: `_meta/audits/_r2_findings_refined.json` (158 rows)
- Initial findings (pre-spec-driven refinement): `_meta/audits/_r2_findings_raw.json` (185 rows)
- Findings table (markdown): `_meta/audits/_r2_table.md`
- Grouped per-task view: `_meta/audits/_r2_grouped.json`

## Appendix B — Audit checklist applied

For each of 192 task JSONs:

1. JSON parses → 192/192 PASS
2. Top-level shape vs gold standard → 34 violations
3. Required `pipeline_inputs` keys → covered by (2)
4. PRD §X.Y refs present → spot-checked, all 192 have non-empty `prd_refs`
5. Prototype linkage for UI tasks → 14 violations
6. Dependencies coherence → 8 overlap violations; remaining same-module refs verified
7. Cross-module deps declared → 2 gaps (finance T-001 → settings; multi-site T-030 → 12-reporting)
8. Foundation primitives (RLS via `app.current_org_id()`, async via apps/worker, outbox, e-sign, rate-limit, perm regex) → 0 violations (no GUC misuse)
9. Risk red lines ≥2 → 48 violations
10. Test strategy concrete commands → 54 violations
