# FIXER F11 — Finance & Multi-Site Validator Authoring

**Date:** 2026-05-14
**Author:** FIXER 11 (Claude Sonnet)
**Modules:** 10-FINANCE (32 tasks), 14-MULTI-SITE (31 tasks)

---

## Validator Paths

- `_meta/atomic-tasks/10-finance/_validate.py`
- `_meta/atomic-tasks/14-multi-site/_validate.py`

---

## Common Ruleset (both validators)

12 shared checks enforced on every task file:

1. JSON parses without error
2. Required top-level fields present: `title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`
3. Forbidden runtime-injected fields absent (e.g. `task_id`, `status`, `claim_token`)
4. `pipeline_name == "kira_dev"`
5. `pipeline_inputs` required keys all present and non-empty: `root_path`, `description`, `details`, `scope_files`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`
6. `root_path` is an absolute path
7. `prd_task_id` matches the filename stem (T-001, T-002, …)
8. No placeholder text in prompt/details/description/AC: `TBD`, `TODO`, `fill in`, `appropriate`, `similar to previous`
9. `acceptance_criteria`: 1..4 entries
10. `task_type` in `{T1-schema, T2-api, T3-ui, T4-wiring-test, T5-seed, docs}`
11. `checkpoint_policy.required_checkpoints` present
12. `priority` in 30..150; `risk_red_lines` ≥ 2; `scope_files` entries carry `[create]` or `[modify]`
13. T3-ui with `prototype_match=true` requires: parity AC with `prototypes/design/Monopilot Design System/<path>:<lines>`, `parity` keyword in AC, `ui_evidence_policy` field, `prototype_index_entry` field, `## Prototype parity` section in prompt

---

## Module-Specific Rules

### 10-FINANCE (3 additional checks)

**Finance #17 — NUMERIC precision on schema tasks**
T1-schema tasks must not use bare `NUMERIC` without explicit precision `(p,s)`.
Finance money fields must declare e.g. `NUMERIC(15,4)` for costs or `NUMERIC(15,6)` for FX rates.
Bare `NUMERIC` without precision is a finance data-quality smell — scale ambiguity leads to rounding errors in P&L.

**Finance #18 — D365 export-only red-line**
Tasks classified as D365 integration / wiring (by subcategory containing `d365`/`outbox`/`consolidat`/`integration`/`dispatcher`, or `task_type=T4-wiring-test` with `d365` in prompt body) must carry a `risk_red_lines` entry asserting the dispatcher is export-only and does not mutate canonical Monopilot state (R15 anti-corruption contract).
Matched patterns: `export-only`, `must not mutate`, `anti-corruption`, `R15`, `no.*canonical.*state`.

**Finance #19 — fin.*.* permission prefix on perm-enum task**
The permissions-enum task (subcategory contains `perm` or `enum`) must list `fin.*.* ` strings matching `^fin\.[a-z_]+\.[a-z_]+$`.

### 14-MULTI-SITE (3 additional checks)

**Multi-site #17 — app.current_site_id() helper contract**
T1-schema / T2-api / T4-wiring-test tasks that involve site_id or site context must not read `current_setting('app.current_site_id')` directly. If the task sets up RLS/policies and references site_id, it must call `app.current_site_id()`. (Exception: T-001, which creates the SECURITY DEFINER helper.)

**Multi-site #18 — D-MS-13 composite (org_id, site_id) index**
T1-schema tasks that create a new table (migration `[create]` in scope_files) with a `site_id` column must include a composite `(org_id, site_id)` index in the prompt (D-MS-13 mandatory).

**Multi-site #19 — cross_module_dependencies to 00-foundation T-125**
T1-schema / T2-api tasks involving site/org context must carry a `cross_module_dependencies` entry referencing `T-125` or `withOrgContext` (the withOrgContext HOF in 00-foundation). `withSiteContext` composes on top of T-125; every site-scoped task must declare this dependency. (Exception: T-001 which is the one that introduces this relationship.)

---

## Initial Run Outcomes

### 10-finance

```
[validate:10-finance] 32 task files inspected
[validate:10-finance] 34 FAILURES:
  - T-002..T-032 (30 tasks): >4 acceptance_criteria
  - T-014, T-027, T-030: D365 integration task missing export-only red-line
```

**Pass: 1 task (T-001)**
**Fail: 31 tasks (34 total failure records)**

### 14-multi-site

```
[validate:14-multi-site] 31 task files inspected
[validate:14-multi-site] 93 FAILURES:
```

**Pass: 0 tasks**
**Fail: 31 tasks (93 total failure records)**

---

## Top-3 Failure Categories

### Category 1 — `>4 acceptance_criteria` (BOTH modules, ~60 of ~127 total failures)

**ALL** non-T-001 tasks in both modules have more than 4 ACs. Finance tasks have 5–10 ACs, multi-site tasks have 5–9 ACs.
This is the dominant failure type. The atomicity gate (≤4 AC per task) was not enforced during generation.
A follow-up decomposition pass is needed to either:
(a) split tasks with >4 ACs into finer-grained atomic tasks, or
(b) merge the weakest ACs to bring count under 4.

### Category 2 — Missing T-125 cross-module dependency (14-multi-site, ~15 failures)

14 tasks in 14-multi-site (T-002 through T-030) that touch `site_id` or site-scoped context do not declare a `cross_module_dependencies` entry to `00-foundation T-125` (`withOrgContext` HOF).
This is a structural coverage gap: the site context layer composes on `withOrgContext` and the dependency chain must be explicit so the scheduler can enforce ordering.

### Category 3 — T3-ui prototype parity format (14-multi-site, ~30 failures)

10 multi-site T3-ui tasks (`T-018` through `T-029`) have `prototype_match=true` but:
- Prototype is listed in `scope_files` with a non-standard `[ref]` annotation instead of line-range in the AC (e.g. `prototypes/design/Monopilot Design System/multi-site/modals.jsx [ref]`)
- ACs do not include the mandatory `prototypes/design/Monopilot Design System/<path>:<line-range>` parity reference
- Prompt lacks the `## Prototype parity` section

These tasks need prototype line-range pins added to ACs and the parity section added to prompts.

### Subcategory — D365 export-only red-line missing (10-finance, 3 failures)

T-014, T-027, T-030 are D365 integration tasks missing the export-only/R15 anti-corruption red line that T-028 correctly carries. This is a low-volume but HIGH risk gap — the R15 contract is the primary guard against the dispatcher mutating canonical Monopilot state.

---

## Recommended Follow-up Tasks for FIXER 12+

1. **AC atomicity pass (both modules):** Trim or split all tasks with >4 ACs (highest volume fix — 60 failures).
2. **Multi-site T-125 cross-dep pass:** Add `cross_module_dependencies` entry to 00-foundation T-125 on 14 tasks (T-002..T-030 that are site-context-aware).
3. **Multi-site UI prototype parity pass:** Add line-range pins to T3-ui ACs and `## Prototype parity` sections to 10 task prompts (T-018..T-029).
4. **Finance D365 export-only red-line pass:** Add R15 anti-corruption red-line to T-014, T-027, T-030.
