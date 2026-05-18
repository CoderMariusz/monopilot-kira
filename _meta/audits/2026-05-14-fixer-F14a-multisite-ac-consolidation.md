# Fixer F14a — 14-multi-site AC Consolidation

**Date:** 2026-05-14
**Scope:** `acceptance_criteria` ≤4 consolidation only (single-responsibility)
**F14b handles:** `dependencies`, `cross_module_dependencies`, `scope_files`, `prototype_*`

## Pre/Post AC>4 Failure Count

| State | AC>4 failures |
|-------|--------------|
| Before | 30 |
| After  | **0** |

Remaining 49 validator failures are all F14b scope (cross_module_dependencies, scope_files/prototype_match/prototype_index_entry, prototype parity AC naming, ## Prototype parity section).

## Per-Task Before→After AC Count

| Task | Before | After | Fusion strategy |
|------|--------|-------|-----------------|
| T-001 | 6 | 4 | AC6 source-grep hoisted → test_strategy; AC5 fused into AC4 (400+403 route guards) |
| T-002 | 5 | 4 | AC5 pg_policies fused into AC2 (RLS isolation + policy reference) |
| T-003 | 5 | 4 | AC5 pg_policies fused into AC3 (RLS cross-org + policy reference) |
| T-004 | 5 | 4 | AC4 pg_policies + AC5 org-isolation fused into AC2 (RLS + dual policy reference) |
| T-005 | 5 | 4 | AC5 pg_policies fused into AC4 (site-scoped isolation + policy reference) |
| T-006 | 5 | 4 | AC5 source-grep hoisted → test_strategy |
| T-007 | 6 | 4 | AC4+AC5 super_admin+getSiteContext fused into AC2; AC6 JWT fallback kept as AC4 |
| T-008 | 5 | 4 | AC2+AC3 constraint violations fused; AC4+AC5 schema/default fused |
| T-009 | 5 | 4 | AC2+AC3 transition-guard rejections fused into one composite AC |
| T-010 | 6 | 4 | AC1+AC2 approval-required guards fused; AC4+AC5 outbox+idempotency fused |
| T-011 | 6 | 4 | AC1+AC2 allocation methods fused; AC3+AC4 error+observability fused |
| T-012 | 6 | 4 | AC2+AC5+AC6 constraint violations fused into AC2; AC3+AC4 unique+RLS kept |
| T-013 | 6 | 4 | AC1+AC2 DDL+date fused; AC3+AC4 zod+cycle fused; AC5+AC6 supersede+index kept |
| T-014 | 6 | 4 | AC1+AC2 suggestLane happy+null fused; AC3+AC4 pending+tie-break fused |
| T-015 | 7 | 4 | AC7 UI-closeout hoisted → closeout_requires; AC1+AC2 list+detail pages fused; AC3+AC4 role+empty fused |
| T-016 | 9 | 4 | AC9 UI-closeout hoisted; AC3+AC4 date+currency validations fused into AC2; AC5+AC6 overlap+approval fused; AC7+AC8 rollback+template fused |
| T-017 | 5 | 4 | AC3+AC5 check_violation+partial-index fused |
| T-018 | 9 | 4 | AC9 UI-closeout hoisted; AC2+AC3+AC4 esig guards fused; AC5+AC6 audit+resolution fused; AC7+AC8 role+choose-all fused |
| T-019 | 7 | 4 | AC7 UI-closeout hoisted; AC3+AC4 validation errors fused into AC2 |
| T-020 | 7 | 4 | AC7 UI-closeout hoisted; AC1+AC2 single/multi label fused; AC3+AC5 cookie set+persist fused |
| T-021 | 7 | 4 | AC7 UI-closeout hoisted; AC2+AC5 filter+empty-state fused; AC3+AC6 role+navigation fused |
| T-022 | 7 | 4 | AC7 UI-closeout hoisted; AC1+AC2 tabs+URL fused; AC3+AC4 accordion+modal fused |
| T-023 | 8 | 4 | AC8 UI-closeout hoisted; AC2+AC3 redirect+403 fused into AC1; AC5+AC6 steps+org_settings fused |
| T-024 | 9 | 4 | AC9 UI-closeout hoisted; AC2+AC3+AC8 checklist+guards fused; AC5+AC7 default+outbox fused into AC4 |
| T-025 | 9 | 4 | AC9 UI-closeout hoisted; AC1+AC2 prototype+ALL-badge fused; AC3+AC4 assign+primary fused; AC5+AC6 bulk fused; AC7+AC8 role+axe fused |
| T-026 | 8 | 4 | AC8 UI-closeout hoisted; AC1+AC2 modal+select fused; AC4+AC7 auth+context-mismatch fused |
| T-027 | 5 | 4 | AC4+AC5 concurrent-lock+performance fused |
| T-028 | 7 | 4 | AC7 UI-closeout hoisted; AC1+AC2 prototype+role-gated fused; AC3+AC4 SWR+alert-persist fused; AC5+AC6 map+super_admin fused |
| T-029 | 7 | 4 | AC7 UI-closeout hoisted; AC1+AC3 prototype+Freight fused; AC4+AC5 draft+super_admin fused |
| T-030 | 7 | 4 | AC1+AC2 idempotent+1M-backfill fused; AC4+AC7 concurrent+resume fused; AC5+AC6 progress+activated fused |
| T-031 | 4 | 4 | Already compliant — no changes |

## Hoist Summary

**Hoisted to `closeout_requires` → `screenshot_and_playwright_trace_evidence`:**
T-015, T-016, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026, T-028, T-029

**Hoisted to `test_strategy`:**
- T-001: source-grep raw GUC ban (original AC6)
- T-006: source-grep policy SQL no current_setting (original AC5)

## Coverage Guarantee

No assertion was dropped. Every original AC text is preserved either:
1. Verbatim in the fused AC (majority)
2. As a trailing `; AND <text>` clause within a composite AC
3. Hoisted to `test_strategy` (source-grep ACs) or `closeout_requires` (UI closeout ACs)

Provenance note `AC count consolidated from N→4 by Fixer F14a 2026-05-14 (no coverage lost)` added to `pipeline_inputs.details` and `prompt` `## Acceptance criteria` section for all 30 modified tasks.

## Files Modified

All 30 task files in `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/14-multi-site/tasks/` (T-001..T-030).
T-031 unchanged (already ≤4 ACs).

## Tasks F14a Could NOT Consolidate Without Coverage Loss

None — all 30 tasks successfully consolidated to exactly 4 ACs with full assertion preservation.
