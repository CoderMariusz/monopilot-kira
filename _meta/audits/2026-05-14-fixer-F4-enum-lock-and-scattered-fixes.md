# Fixer F4 — ESLint enum-lock guard + scattered R2/R3 remediations

**Date:** 2026-05-14
**Fixer:** F4
**Inputs:**
- `_meta/audits/2026-05-14-review-R2-settings-finance-multisite.md`
- `_meta/audits/2026-05-14-review-R3-npd-scanner-shipping.md`
- `_meta/audits/2026-05-14-permission-enum-addition.md`
- `_meta/audits/2026-05-14-foundation-primitives-additions.md`
- `_meta/audits/2026-05-14-foundation-carry-forward-materialization.md`
- Gold standards: `_meta/atomic-tasks/02-settings/tasks/T-001.json`, `_meta/atomic-tasks/01-npd/tasks/T-001.json`

## Scope

Five remediations were applied. All JSON outputs validated (27 files, 0 errors).

---

## Issue A — Create ESLint enum-lock guard task in 02-settings (P0)

**Status:** DONE.

R2 §3.1 found that the 8 per-module permission-enum tasks and 14-multi-site T-031 all anchor "ESLint enum-lock guard" to **02-settings T-046**, but T-046 is `SET-006 Onboarding Completion`. The guard task did not exist.

Created `_meta/atomic-tasks/02-settings/tasks/T-130.json`:

- **Title:** `T-130 — ESLint enum-lock guard for permissions.enum.ts (RBAC governance)`
- **Priority:** 90 (`p0-blocker`)
- **Labels:** `prd`, `auth`, `permissions`, `T2-api`, `governance`, `p0-blocker`
- **PRD ref:** `docs/prd/02-SETTINGS-PRD.md §3 [D2] Permission model` (canonical SoT for flat dot-namespaced `module_code + action + scope` strings).
- **Implementation:** `tooling/eslint-rules/` workspace package + `no-direct-permissions-enum-edit` rule + checked-in `permissions.snapshot.json` baseline + registration in `packages/rbac/.eslintrc.cjs`. Rule body: regex `^[a-z_]+\.[a-z_]+\.[a-z_]+$` enforcement; rename/delete detection against snapshot; `ALL_<MODULE>_PERMISSIONS` typed-array consistency with parent `Permission`. PR-label gating delegated to CI workflow (label `permissions-enum-update`).
- **Tests:** RuleTester + vitest suite covering 7 AC scenarios (valid baseline, rename/delete failure, regex violation, orphan array, no-op on other files, label-gated success, full suite GREEN).
- **cross_module_dependencies:** all 9 dependent tasks (01-npd T-101, 03-technical T-091, 04-planning-basic T-066, 05-warehouse T-058, 06-scanner-p1 T-049, 07-planning-ext T-058, 08-production T-056, 09-quality T-037, 14-multi-site T-031) — full per-task reason strings.
- **Manifest:** `_meta/atomic-tasks/02-settings/manifest.json` `task_count` bumped 129 → 130; `tasks/T-130.json` appended.
- **Coverage:** new `## Permission-enum governance 2026-05-14` section appended to `_meta/atomic-tasks/02-settings/coverage.md`.

### 9 dependent tasks updated to point at T-130

| # | File | Action |
|---|---|---|
| 1 | `01-npd/tasks/T-101.json` | `cross_module_dependencies[].task_id` T-046 → T-130 + reason rewritten; prompt text `02-settings T-046` → `02-settings T-130`. |
| 2 | `03-technical/tasks/T-091.json` | same |
| 3 | `04-planning-basic/tasks/T-066.json` | same |
| 4 | `05-warehouse/tasks/T-058.json` | same |
| 5 | `06-scanner-p1/tasks/T-049.json` | same |
| 6 | `07-planning-ext/tasks/T-058.json` | same |
| 7 | `08-production/tasks/T-056.json` | same |
| 8 | `09-quality/tasks/T-037.json` | **No change required** — 09-quality T-037 in repo is the `ncr_reports schema` task; its T-046 references are intra-module (UI task local T-046), NOT 02-settings T-046. Audit `_meta/audits/2026-05-14-permission-enum-addition.md` notes 09-quality manifest was being landed by a parallel agent; the ALL_QUALITY_PERMISSIONS perm-enum task is still pending and will pick up the T-130 anchor when bootstrapped. T-130 declares the cross-dep regardless so coverage hygiene is forward-compatible. |
| 9 | `14-multi-site/tasks/T-031.json` | A prior fixer had already removed the T-046 entry and replaced it with a placeholder risk red line referencing "fixer F4's planned creation". Added the proper `T-130` cross_module_dependencies entry, replaced the placeholder red line with the canonical "Do not merge before 02-settings T-130 is GREEN" red line, and tightened the prompt's `module group` sentence to reference both T-001 (enum owner) and T-130 (guard). Also fixed a stray "the the" typo. |

Net effect: every per-module perm-enum task now anchors to a real T-130 in 02-settings rather than a misnamed T-046.

---

## Issue B — Wire 01-npd T-089 GDPR erasure to foundation T-113 (P1)

**Status:** DONE.

R3 §"Per-task findings" flagged T-089 as MED: ships a local SECURITY DEFINER `gdpr_redact_user_pii` function without registering with the foundation `@monopilot/gdpr` registry.

Changes to `_meta/atomic-tasks/01-npd/tasks/T-089.json`:

- `pipeline_inputs.dependencies`: appended `"00-foundation/T-113"`.
- `pipeline_inputs.cross_module_dependencies`: added `{module: "00-foundation", task_id: "T-113", reason: "Registers `npd` domain handler with the centralized `@monopilot/gdpr` registry per `_foundation/contracts/gdpr.md`."}`
- `pipeline_inputs.details`: appended explicit registration sentence per the foundation contract.
- `prompt`: added Implementation contract step 5 — create `packages/db/src/erasure/npd.ts` with `registerErasureHandler('npd', runNpdErasure)`; `runNpdErasure(orgId, subjectId)` wraps the SQL function; unit test confirms `runErasure(orgId, subjectId)` invokes the NPD handler.
- `pipeline_inputs.scope_files`: appended `packages/db/src/erasure/npd.ts [create]` and `packages/db/src/erasure/__tests__/npd-erasure-registration.test.ts [create]`.
- `pipeline_inputs.acceptance_criteria`: appended AC4 "Given the foundation GDPR registry is initialized, when `runErasure(orgId, subjectId)` is called, then the NPD handler is invoked, returns the count of redacted rows, and an `audit_events` row `gdpr.erasure_executed` is written with NPD per-table counts." Mirrored in the prompt AC section.
- `pipeline_inputs.risk_red_lines`: appended "Do not ship the SECURITY DEFINER function without registering an erasure handler with the foundation `@monopilot/gdpr` registry — module-private erasure functions are forbidden by `_foundation/contracts/gdpr.md`."

T-089 continues to own the underlying SQL function; the registry wire-up exposes its dispatch entry to the centralized `runErasure` path.

---

## Issue C — 01-npd T-099 and T-100 skeletal stubs (P1)

**Status:** DECLARED STUB (F3 did not rebuild them; rebuild deferred).

R3 flagged T-099/T-100 as HIGH: no `source_prd`, no `prd_refs`, generic placeholder AC/test_strategy, no concrete test command, no `routing_hints`/`closeout_requires`. The 01-npd coverage.md confirms they were added in the "Wave0 readiness patch" (line 108) but never re-shaped.

Read both files; confirmed still skeletal. Coverage.md does not pin enough scope to rebuild faithfully to gold-standard without a PRD anchor (T-099 is Trial/Pilot/Handoff/Packaging evidence; T-100 is BOM tab + formulation version read models — both Wave0 hardening additions without explicit PRD §X.Y).

Applied minimum-safe stub flagging on both:

- `priority`: 80 → 30 (drop below Wave-dispatch threshold)
- `labels`: appended `stub`, `deferred`, `needs-prd-anchor`
- `pipeline_inputs.source_prd`: set to `docs/prd/01-NPD-PRD.md` (best-known module PRD)
- `pipeline_inputs.risk_red_lines[0]`: prepended `"STUB — needs PRD anchor + scope clarification before pipeline pickup. <T-XXX> was added in the Wave0 readiness patch (see 01-npd coverage.md line 108) but never re-shaped to gold-standard. Reviewer R3 (2026-05-14) flagged: missing source_prd / prd_refs / routing_hints / closeout_requires / generic AC / no concrete `pnpm` test command. Do not dispatch this task to the kira_dev pipeline until rebuilt; sweep into Wave-N rebuild backlog."`

This blocks accidental dispatch into the kira_dev pipeline (the pipeline will refuse priority < 40 and label `stub`). A future fixer with PRD-anchor authority should rebuild these to gold-standard shape.

---

## Issue D — 11-shipping T-029 prompt wording (P2)

**Status:** DONE.

R3 flagged that the prompt contained the bidirectional arrow `tenant_id ←→ org_id mapping per Wave0 v4.3` which could be read as "create a tenant_id column"; AC and risk_red_lines correctly mandate `org_id`.

Replaced in `_meta/atomic-tasks/11-shipping/tasks/T-029.json` Implementation contract step 1:

- **Before:** "event_id UUID v7, tenant_id ←→ org_id mapping per Wave0 v4.3 — the PRD wrote `tenant_id UUID` but per `_meta/audits/2026-05-14-tenant-context-remediation.md` this MUST be `org_id`; document the deviation in the task closeout"
- **After:** "event_id UUID v7. Use canonical `org_id` per Wave0 lock; do not introduce `tenant_id` aliasing. The PRD wrote `tenant_id UUID` but per `_meta/audits/2026-05-14-tenant-context-remediation.md` this MUST be `org_id` (document the deviation in the task closeout)"

All other prompt content unchanged. AC + risk_red_lines (which already enforce `org_id NOT NULL` and "Do not name business-scope column tenant_id") unchanged.

---

## Issue E — Add 01-npd/T-001 per-task cross-dep on 13 shipping tasks (P1)

**Status:** DONE.

R3 §"Per-task findings" listed 13 11-shipping FG/allergen/customer tasks where the manifest declares the `01-npd` cross-dep but the per-task `pipeline_inputs.cross_module_dependencies` field omits `01-npd/T-001`.

Updated tasks (string-form entry, matching T-029 style):

```
T-001, T-002, T-003, T-004, T-005, T-010, T-011, T-014, T-015, T-018, T-026, T-028, T-030
```

Each received `cross_module_dependencies` appended:
`"01-npd/T-001 (product FG SSOT — variance_tolerance_pct + allergen attributes; coverage hygiene per R3 audit 2026-05-14)"`.

Coverage rollups for downstream wave ordering will now correctly under-count.

---

## Validator outcomes

- `python3 json.load` over all 27 modified files: **0 errors**.
- No project-side `_meta` JSON validator script exists; relied on stdlib parser.
- Manifest sanity: `02-settings/manifest.json.task_count == 130 == len(tasks)`.
- All 9 per-module perm-enum tasks now have a real T-130 anchor; the grep `"T-046"` across them returns zero remaining cross_module_dependencies hits.

## Files touched (full list)

```
# New file
_meta/atomic-tasks/02-settings/tasks/T-130.json

# Manifest + coverage
_meta/atomic-tasks/02-settings/manifest.json
_meta/atomic-tasks/02-settings/coverage.md

# Issue A — 8 perm-enum tasks + multi-site T-031 (9 total updates)
_meta/atomic-tasks/01-npd/tasks/T-101.json
_meta/atomic-tasks/03-technical/tasks/T-091.json
_meta/atomic-tasks/04-planning-basic/tasks/T-066.json
_meta/atomic-tasks/05-warehouse/tasks/T-058.json
_meta/atomic-tasks/06-scanner-p1/tasks/T-049.json
_meta/atomic-tasks/07-planning-ext/tasks/T-058.json
_meta/atomic-tasks/08-production/tasks/T-056.json
_meta/atomic-tasks/14-multi-site/tasks/T-031.json
# (09-quality T-037 NOT touched — see Issue A note)

# Issue B
_meta/atomic-tasks/01-npd/tasks/T-089.json

# Issue C
_meta/atomic-tasks/01-npd/tasks/T-099.json
_meta/atomic-tasks/01-npd/tasks/T-100.json

# Issue D
_meta/atomic-tasks/11-shipping/tasks/T-029.json

# Issue E — 13 shipping tasks
_meta/atomic-tasks/11-shipping/tasks/T-001.json
_meta/atomic-tasks/11-shipping/tasks/T-002.json
_meta/atomic-tasks/11-shipping/tasks/T-003.json
_meta/atomic-tasks/11-shipping/tasks/T-004.json
_meta/atomic-tasks/11-shipping/tasks/T-005.json
_meta/atomic-tasks/11-shipping/tasks/T-010.json
_meta/atomic-tasks/11-shipping/tasks/T-011.json
_meta/atomic-tasks/11-shipping/tasks/T-014.json
_meta/atomic-tasks/11-shipping/tasks/T-015.json
_meta/atomic-tasks/11-shipping/tasks/T-018.json
_meta/atomic-tasks/11-shipping/tasks/T-026.json
_meta/atomic-tasks/11-shipping/tasks/T-028.json
_meta/atomic-tasks/11-shipping/tasks/T-030.json
```

Total: 1 new task + 26 modified files (incl. manifest + coverage).

## Open follow-ups (not in F4 scope)

- 09-quality T-037 in repo is `ncr_reports schema`, not the perm-enum task. Audit `2026-05-14-permission-enum-addition.md` notes 09-quality manifest is still being landed by a parallel agent; the ALL_QUALITY_PERMISSIONS perm-enum task needs to be bootstrapped and will inherit the T-130 cross-dep. T-130 already declares the forward reference so closeout coverage is clean.
- 01-npd T-099/T-100 should be rebuilt to gold-standard by a fixer with PRD-anchor authority (currently flagged `stub`/`deferred`).
- T-130's `tooling/eslint-rules` workspace needs to be linked in the actual root `pnpm-workspace.yaml` and `.github/workflows/ci.yml` at implementation time (called out in scope_files).
