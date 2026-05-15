# Fixer F2 — Remediation of R2 findings (02-settings · 10-finance · 14-multi-site)

**Fixer**: F2
**Date**: 2026-05-14
**Source review**: `_meta/audits/2026-05-14-review-R2-settings-finance-multisite.md`
**Modules touched**: `02-settings` (129), `10-finance` (32), `14-multi-site` (31) — 192 task JSONs total

---

## 1. Counts per issue

| Issue | Description | Tasks fixed |
|---|---|---|
| **A** | 14-multi-site `pipeline_inputs.details` added (T-002..T-031) | **30** |
| **B** | 02-settings `risk_red_lines` raised to ≥2 entries | **48** |
| **C** | 02-settings `test_strategy` augmented with concrete `pnpm`/`vitest`/`playwright` command | **59** |
| **D** | 02-settings T-124..T-127 received `out_of_scope` + `routing_hints` | **4** |
| **E** | 14-multi-site T-031 — wrong reference to 02-settings T-046 fixed (xmod entry removed + red-line note added + prompt body updated) | **1** |
| **F** | `parallel_safe_with` ↔ `dependencies` overlap removed | **8** (10-fin: T-013/020/026/029; 14-MS: T-010/014/016/018) |
| **G** | 02-settings UI parity declaration added on T-104..T-115, T-118 | **13** |
| **G+** | 02-settings T-129 `ui_evidence_policy` added | **1** |
| **G+** | 14-multi-site T-020 parity declaration added | **1** |
| **H** | 10-finance T-001 cross-module dep on 02-settings T-001/T-002 | **1** |
| **I** | 10-finance T-028 D365 export-only red line | **1** |
| **J** | 14-multi-site T-030 + 12-reporting xmod + count drift 20→21 reconciled | **1** |
| **TOTAL files changed** | | **75** |

Files modified (git diff --stat): 75 files, ~306 insertions, ~138 deletions across the three modules.

---

## 2. Before/after samples

### Issue A — 14-multi-site `pipeline_inputs.details` (T-002 sample)

**Before**: key absent.
**After**:
> "Create sites table (12 cols + l3_ext_cols JSONB + active flag) + composite index idx_sites_org partial WHERE active + unique partial idx_sites_default per V-MS-01 + RLS org-scoped policy using app.current_org_id(). Scope: Introduce the physical `sites` table (master data, org-scoped — NOT site-scoped per §6.4 REC-L1 rule: master tables stay org_scoped). Touches: packages/db/migrations/0041_sites.sql, packages/db/src/schema/sites.ts, packages/db/src/schema/sites.zod.ts, packages/db/src/schema/index.ts. Constraints: New Drizzle migration `packages/db/migrations/0041_sites.sql` (CREATE TABLE sites ... ENABLE+FORCE ROW LEVEL SECURITY ... unique partial idx_sites_default ... self-ref FK ...). Distinguished from sibling 14-multi-site tasks by its narrow schema-sites focus against PRD §9.1, §11.1 V-MS-01, §11.1 V-MS-04, §9.9."

Synthesised from `description` + `## Goal` + `## Implementation contract` + `scope_files` + `prd_refs`. 3–5 sentences each, capped ~1.6k chars.

### Issue B — 02-settings risk_red_lines (T-003 sample)

**Before**: `["Do not change event payload contracts here (separate task)."]` (1 entry)
**After**:
```json
[
  "Do not change event payload contracts here (separate task).",
  "Do not introduce a parallel outbox event registry; the settings/outbox events.ts module is the single source of truth."
]
```
Second entries are derived from a module-appropriate pool keyed on `subcategory` / `scope_files`: outbox-registry exclusivity, permissions.enum CODEOWNERS lock, withOrgContext non-bypass, Server-Action no-REST, CSRF/cookie attr on auth surfaces, parse-on-server for CSV imports, dry-run before rule promotion, audit-trigger-only writes, additive-only seeds, etc.

### Issue C — 02-settings test_strategy (T-003 sample)

**Before**: `["RED: extend events.test.ts.", "GREEN: append events."]`
**After**:
```json
[
  "RED: extend events.test.ts.",
  "GREEN: append events.",
  "Run `pnpm --filter @monopilot/web vitest run apps/web/lib/outbox/events.test.ts`."
]
```
Filter selected from `scope_files`: `packages/db/*` → `pnpm --filter @monopilot/db test:integration -- <slug>`; `apps/web/*` or `packages/rbac/*` → `pnpm --filter @monopilot/web vitest run <path>`; T4-e2e adds a `playwright test` line.

### Issue D — T-124..T-127 shape

T-124..T-127 received `out_of_scope` (3–4 concrete exclusions per task derived from their scope) and the canonical `routing_hints` value `{red:hermes_gpt55, implementation:hermes_gpt55, review:opus_if_high_risk_or_ui_or_architecture, close:spark_low_risk_else_opus}`.

### Issue E — 14-MS T-031 reference fix

- Removed the `{module:"02-settings", task_id:"T-046"}` entry from `cross_module_dependencies`.
- Replaced prompt body phrase "ESLint enum-lock guard (02-settings T-046)" with "the canonical permissions.enum owner (02-settings T-001)".
- Added `risk_red_lines` entry: *"The ESLint enum-lock guard task does NOT exist in 02-settings (see fixer F4's planned creation in Wave 4); meanwhile, manual review must enforce no-duplicate strings."*

### Issue F — parallel_safe_with cleaned

- 10-finance T-013: removed `T-012` from psw (kept in deps).
- 10-finance T-020: removed `T-019` from psw.
- 10-finance T-026: removed `T-025` from psw.
- 10-finance T-029: removed `T-028` from psw.
- 14-MS T-010: removed `T-009` from psw.
- 14-MS T-014: removed `T-013` from psw.
- 14-MS T-016: removed `T-015` from psw.
- 14-MS T-018: removed `T-017` from psw.

### Issue G — UI parity declaration

T-104..T-115, T-118 received a `## Prototype parity` markdown section in the prompt declaring spec-driven UI, canonical source = the PRD section per `prd_refs`, plus nearest-reusable pattern from `prototypes/design/Monopilot Design System/_shared/`. `prototype_match: false` (explicit) + `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` set. Same applied to T-020 in 14-MS (per R2's P2 note) and `ui_evidence_policy` added to 02-settings T-129.

### Issue H — finance T-001 xmod

Added two `cross_module_dependencies` entries to 10-finance T-001:
- `{02-settings, T-001, reason: "Settings T-001 locks the permissions.enum CODEOWNERS surface; finance fin.*.* strings layer on top of the same Permission registry without colliding with SETTINGS_CORE."}`
- `{02-settings, T-002, reason: "T-002 co-owns the permissions.enum extension surface (SETTINGS_DATA group)."}`

### Issue I — finance T-028 D365 export-only

Added to `risk_red_lines`: *"D365 dispatcher is strictly export-only — it MUST NOT mutate `factory_release_state` or any canonical Monopilot state (R15 anti-corruption contract)."*

### Issue J — multi-site T-030

- Added `{module:"12-reporting", task_id:"—", reason:"12-REP consumes site-scoped operational tables (work_orders, oee_snapshots, shipments, inventory_cost_layers) via cross_site_summary materialized view per §9.10; activation migration affects all 12-REP downstream queries."}` to `cross_module_dependencies`.
- **Table count drift**: PRD §9.8 (`docs/prd/14-MULTI-SITE-PRD.md` lines 500–520) enumerates **21** operational tables (4 WH + 5 PROD + 4 QA + 2 FIN + 2 SHIP + 1 OEE + 3 MAINT). The R2 brief said PRD says 20 and T-030 enumerates 21 — actual PRD count is 21 and T-030's enumeration was correct; only the narrative `"20 operational tables"` label was wrong. Reconciled by replacing `"20 operational tables"` / `"20 §9.8 tables"` with `"21 operational tables"` / `"21 §9.8 tables"` in title/description/prompt/acceptance_criteria/test_strategy/risk_red_lines.

---

## 3. Validator outcomes

| Module | Validator path | Outcome |
|---|---|---|
| 02-settings | `_meta/atomic-tasks/02-settings/_validate.py` | **129 inspected, 4 failures — all PRE-EXISTING `>4 acceptance_criteria` count drift on T-004/T-125/T-127/T-128, unrelated to F2 mandate (not introduced by remediation)**. |
| 10-finance | (no validator script present) | JSON parse: 32/32 PASS. |
| 14-multi-site | (no validator script present) | JSON parse: 31/31 PASS. |
| **All three** | `python3 -c "json.load(...)"` for every T-*.json | **192/192 PASS**. |

---

## 4. Items NOT fixed (and why)

1. **02-settings T-004, T-125, T-127, T-128**: validator complains about `>4 acceptance_criteria` (each has 5). This is a **pre-existing drift** from the gold standard (4 ACs max per task convention). Not in F2's mandate (R2 did not flag these as `shape` violations). Recommend a separate F-step to split or trim ACs.
2. **No dedicated validator for 10-finance and 14-multi-site**: no `_validate.py` exists for these modules. JSON parse only. Recommend authoring a parallel `_validate.py` mirroring `02-settings/_validate.py` so the same 7+1 checks run cross-module.
3. **Issue E (T-031) — ESLint enum-lock guard task does not yet exist** in 02-settings. F2 took the explicit instruction route: removed the false xmod ref + added a placeholder red-line note pointing at F4's planned Wave-4 creation. No new T-XXX was invented.
4. **Issue J — narrative "20 vs 21" reconciliation**: R2 brief framed this as "PRD says 20, SQL enumerates 21". Direct reading of `docs/prd/14-MULTI-SITE-PRD.md` §9.8 (lines 500–520) shows the PRD table itself lists **21** rows; the `~20` in §9.9 ("Apply to all ~20 operational tables") is an approximate. Decision: align T-030 to the actual enumeration (21) rather than mutate the PRD. If the PRD is the authoritative truth and should remain "20", a follow-up task should remove one of the 21 PRD rows.
5. **Issue C cleanup of pre-existing weak commands**: 59 tasks received an *additional* concrete pnpm/vitest/playwright line. The existing weak entries ("RED: extend X.test.ts.", "GREEN: …") were NOT removed, only augmented. This preserves the RED→GREEN narrative while satisfying the gold-standard "runnable command" requirement.
6. **Sample size constraint**: R2 reported "~45 tasks have only 1 risk_red_lines entry" in the T-003..T-040 + T-080..T-095 range — actual count after F2's pass was **48** tasks needing remediation (slightly higher than R2's estimate). All 48 received a module-appropriate concrete second entry.

---

## 5. File-level summary

```
75 files changed, 306 insertions(+), 138 deletions(-)
- _meta/atomic-tasks/02-settings/tasks/  : ~64 files
- _meta/atomic-tasks/10-finance/tasks/   : ~5  files
- _meta/atomic-tasks/14-multi-site/tasks/: ~31 files
```

Machine-readable per-task report: `/tmp/fixer_f2_report.json` (kept for handoff).
