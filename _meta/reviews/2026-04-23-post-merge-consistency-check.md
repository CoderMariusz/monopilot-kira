---
title: Post-merge consistency check — phase-e0-merged-backlog → main
version: 1.0
date: 2026-04-23
reviewer: Claude (Opus 4.7, 1M ctx) cross-agent
scope: verify 95-task merged Foundation backlog vs ADR-032, Phase E kickoff plan, Helper B §12
commit: 72fe553 (main, fast-forwarded)
verdict: MINOR DRIFT (2 low-severity items, no blocking conflicts)
---

# Post-merge Consistency Check

## Summary

**MINOR DRIFT.** The 95-task merged backlog is materially consistent with ADR-032 (Settings carveout), kickoff plan §3.2 (build order), and Helper B §11.2 math / §12 labeling pattern. Two drifts found are documentary/cosmetic, not scope/contract violations. The backlog is **merge-ready**; no rework needed before dispatch.

---

## §1 — Task ID space alignment

Merged backlog uses **sub-module-prefixed IDs** with 4 distinct namespaces:

- `T-00{a..i}-{NNN}` (atomic code tasks, e.g. `T-00b-001`, `T-00i-011`)
- `T-00b-E0{1,2,3}` (architect enum locks)
- `T-00b-{M01|A01}` + `T-00a-006b`, `T-00a-008/009` (gap-fill tasks)
- `T-GOV-{001..012}` (governance/docs)
- `T-ADR-R{01..15}` (R1–R15 ADR stubs)
- `T-OOS-001` (single out-of-scope pointer)

No flat `T1..T95` scheme. **No collision with ACP T101..T160** namespace — fully disjoint (`T-` prefix + sub-module segment vs. bare `T{num}`). The comparison doc's legacy `T-1..T-47` mapping survives only in the coverage audit column, not as live IDs.

**Status:** CLEAN.

---

## §2 — Scope overlap with Phase E kickoff plan §3.2

Kickoff plan §3.2 row 1 defines Phase E-0 = `00-FOUNDATION-impl-a..i`. Helper B §11.2 predicts **45–135 atomic per phase E-0** (9 sub-modules × 5–15). The 95-task backlog **falls inside predicted range** (mid-upper band). Breakdown:

| Segment | Count | Notes |
|---|---|---|
| Architect locks (§0) | 4 | Counted against Helper B §11.2 |
| 00-a..00-i atomic | 57 | 7+6+6+5+5+6+7+5+10 |
| Gap-fills (§12) | 6 | Theming/PWA/token-cap/Main-Table/app-role/DoD |
| Governance (§10) | 12 | Per A.1 of comparison |
| ADR splits (§11) | 15 | T-43 decomposition |
| OOS pointer (§13) | 1 | Consolidated defer |
| **Total** | **95** | — |

Pure atomic code scope = 4+57+6 = 67, which sits precisely in the §11.2 "realistic middle 60–80" band. Governance + ADR-stubs (27) are docs-exempt per Helper B §11.3 check #1. 95 total does **not balloon past math** — it matches comparison doc's projected 90–140.

**Status:** CLEAN.

---

## §3 — Settings-a carveout respected (ADR-032)

ADR-032 §"Phase E-1" lists Settings-a scope as: Orgs + Users CRUD, 10 Roles matrix UI, Reference CRUD for 7 ref tables, Module toggles, i18n scaffolding, Org security baseline — ~7–9 sesji.

Grep over merged plan for Settings-a signatures (`Orgs CRUD`, `Users CRUD`, `role.*assign`, `admin.*wizard`, `carveout`) returns **zero leakage**:
- `role.assigned` appears only as an outbox event-string in `T-00b-E02` (correct — enum lock for downstream consumers, not a UI)
- "admin UI deferred to E-2" explicit disclaimers at §7 (rules) line 1560 and §8 (schema-driven) line 1831
- §14 parallel-dispatch checklist line 3328 confirms: "no admin UI in this backlog (lives in E-1/E-2)"

Business-table CRUD for Orgs/Users/Roles **is present** at the schema layer (baseline migration `T-00b-000` creates tables), but no Server Actions / forms / pages on top. This matches ADR-032: "Foundation = runtime primitives, Settings = admin UI on top" (kickoff plan §2 rule of thumb).

**Status:** CLEAN — carveout respected.

---

## §4 — Labeling pattern unchanged (Helper B §12)

Helper B §12.1–§12.3 specifies labeling as a **one-time Haiku pre-pass** (Phase 0, ~4–8h wall-clock, 15 parallel Haiku agents) producing `_meta/prototype-labels/master-index.json`, consumed downstream by T3 UI tasks via pre-hook.

Grep over merged plan for `labeling|Haiku|prototype` returns **zero matches**. Foundation E-0 correctly omits labeling — it belongs to the infra layer used later for T3 UI tasks (which don't exist in E-0 except `T-00c-004` Login page, the only UI, and that doesn't need prototype labeling since it's a trivial shadcn form).

**Status:** CLEAN — labeling stays outside Foundation scope as intended.

---

## §5 — Seams status

The request mentions "kickoff plan §15.2 specified 7 seams." The committed kickoff plan (`2026-04-22-phase-e-kickoff-plan.md`) **ends at §11**; there is no §15 section present in the repo file (confirmed via `^## §` grep — final header is "§11 Minimal viable 'first test Jane sees'").

**Drift D1 (documentation):** Either (a) the §15.2 seams doc exists in a local uncommitted draft on the reviewer's working tree, (b) it lives in a different file/branch not merged to main, or (c) it was dropped during the 47→95 consolidation. The merged backlog shows no explicit "seam task" markers and no "column reservation for future" hybrid tasks.

**Impact:** LOW. Seams are forward-compatibility hooks; their absence does not break E-0 DoD. If the seams doc is authoritative, recommend porting it to repo and adding seam notes as inline annotations on the affected atomic tasks (likely T-00b-000 baseline + T-00h-001 DeptColumns), or filing as a follow-up review item. **Uncertainty flagged.**

**Status:** MINOR DRIFT — cannot verify without seams doc; not blocking.

---

## §6 — Gap-fill decisions alignment

Frontmatter of merged plan (lines 12–18) lists 6 applied decisions; all 6 map cleanly to kickoff plan assumptions:

| Decision | Merged plan task | Kickoff plan alignment |
|---|---|---|
| Main Table 69 cols KEEP E-0 | `T-00b-M01` (§12) | Kickoff §6.1 table expects 69-col migration as Foundation deliverable ✅ |
| D365/Peppol/GS1 DEFER | `T-OOS-001` (§13) | Kickoff §1.2 lists S3 (D365 constants) as soft blocker → stub in 01-NPD-d, not E-0 ✅ |
| PWA + IndexedDB KEEP | `T-00a-008` + `T-00a-009` | Kickoff plan does not explicitly mention PWA in §3.2 but §6.1 test plan is silent — no conflict ✅ |
| Per-tenant theming DEFER E-1 | `T-OOS-001` pointer | Kickoff §5.2 Track S-α is silent on theming; ADR-032 Settings-a scope lists "org security baseline" not theming ✅ |
| Pre-commit token-cap 40000 | `T-00a-006b` | Kickoff §7 risk row "RBAC permission names drift" mitigation mentions enum locks but not token cap; no conflict ✅ |
| T-43 ADR stubs SPLIT | 15 tasks `T-ADR-R01..R15` | Kickoff §8.3 backlog math assumes atomic split ✅ |

**Drift D2 (minor scope call):** PWA decision #3 (KEEP in E-0) was in the comparison doc §F.3 as a user-decision-needed item. ADR-032 doesn't mention PWA explicitly. The decision was user-authoritative; no contradiction, but note that ADR-032 may need a one-line addendum acknowledging PWA lives in 00-a for future readers.

**Status:** MINOR DRIFT — ADR-032 could use a 2-line update reflecting Decision #3 (PWA in E-0); non-blocking.

---

## §7 — Integration milestone alignment

Merged plan preamble (line 26) defines the integration milestone verbatim:

> "A developer can `pnpm dev` a fresh checkout; CI is green on a trivial PR; a Playwright test shows that a logged-in user in Org-A cannot read Org-B data (RLS enforces); inserting a row in any business table produces one `audit_log` entry and one `outbox_events` row which the pg-boss worker processes and marks consumed; the rule engine returns a deterministic output for a canned `dry-run` input; a Zod schema generated from `Reference.DeptColumns` metadata validates a sample payload; the 69-col Main Table migration applied cleanly; PWA registers a service worker and IndexedDB sync queue accepts offline writes."

`T-00i-011` (§12, dogfood acceptance) binds these 9 bullets as CI release gate.

Kickoff plan §6.3 defines per-sesja test milestones row-by-row (00-a→02-SET-a→01-NPD-a) and §11 "Jane dogfood" milestone for **Phase E-2** (not E-0). The E-2 milestone is NPD-first-click; **E-0 DoD in kickoff plan is implicit** (table rows "00-i sesja 10: CI green").

**Alignment:** the merged plan's E-0 milestone is **stricter** than kickoff plan's implicit DoD — it adds RLS cross-tenant test, audit→outbox round-trip, rule dry-run determinism, Zod-from-metadata, 69-col migration presence, PWA/IndexedDB smoke. All 9 bullets match or exceed Foundation scope. No conflict.

**Status:** CLEAN — merged plan gives kickoff plan a concrete, testable E-0 DoD.

---

## §8 — Recommendations

**Drift items, in priority order:**

1. **[D1] Kickoff plan §15.2 seams — missing in repo.** Either (a) commit the §15.2 seams doc if it exists in a draft, or (b) file a follow-up to author it post-dispatch, or (c) confirm seams were intentionally dropped. Recommend: confirm with user before first E-0 atomic task lands, in case any of the 95 tasks should carry seam annotations (most likely `T-00b-000` baseline migration).
2. **[D2] ADR-032 PWA addendum.** Add a 2-line note to ADR-032 Consequences → Positive: "PWA + IndexedDB promoted to E-0 per Decision #3 of 2026-04-22-foundation-backlog-comparison.md; landed as T-00a-008/009." Prevents future readers from assuming PWA is E-1.

**No conflicts requiring adjustment before merge.** Backlog is **dispatch-ready.**

**Not required now, but suggest for E-0 kickoff session:**
- Sanity-check that `T-00b-E02` events enum list (§0 line 132) matches downstream consumers in `T-00e-003`, `T-00f-003` before parallel dispatch — drift between enum lock content and consumer usage is the #1 risk flagged in kickoff plan §7.
- `T-00i-011` DoD's upstream list is 12 tasks; verify with first-pass dry-run that all are correctly wired before release-gate enforcement.

---

*Reviewed against: merged plan lines 1–3356, comparison doc full, coverage doc full, kickoff plan full (501 lines), ADR-032 full, Helper B §11–§12. No out-of-branch files consulted.*
