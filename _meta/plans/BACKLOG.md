# MonoPilot Kira — BACKLOG INDEX

The single entry point for "what's left to build". Start here.

## ⭐ The ~100-task gaps backlog (2026-06-25, 20-agent ultracode analysis)

Two evidence-grounded reports (every item cites real file/route/migration evidence):

1. **[Shippable options & reports](./2026-06-25-shippable-options-and-reports.md)** — 50 options/reports that could ship (quick wins → high-value), grouped by domain + per-role value. Quick-win sweep (CSV exports, KPI tiles, RAG badges) + finance/cost reports + scanner quick wins + NPD analytics.

2. **[Detailed gaps report](./2026-06-25-detailed-gaps-report.md)** — THE gaps map. Sections:
   - §2 gaps by module/domain (with severity + evidence)
   - §3 **PER-ROLE missing functionality** (admin / npd_manager / core_user / dept_manager / dept_user / viewer — what each role still can't do)
   - §4 **BUILDABLE-NOW** — 50 small/medium items, no owner decision, ready to dispatch (table with module + effort + scope + evidence)
   - §5 **Owner-decision-needed** — items requiring a product call before building (CoA/BOL/label PDF engine, per-customer pricing, 3-way match, EMP, EUR/GBP reconciliation, per-role WRITE matrix, etc.)

Together ≈ 100 concrete tasks. D365 and fa→FG are EXCLUDED by owner standing instruction.

## Status of the role-enablement (mig 341, LIVE 2026-06-25)
- READ access + NPD domain granted to all 5 non-admin canonical roles (viewer/dept_manager/dept_user/core_user/npd_manager). Both perm stores synced.
- **OPEN owner decision:** the operational WRITE/APPROVAL matrix per role (SoD-sensitive) — reads applied, writes deferred. See gaps §5 "canonical-role permission matrix".

## Open task tracker (engineering tasks)
- `_meta/plans/2026-06-24-autonomous-progress.md` — running ship log (what was built each session).
- `_meta/plans/2026-06-23-remaining-backlog-master-plan.md` — earlier wave plan (P/SQ/SW/SCN/FG/E-series).
- TaskList (#26 stock-adjust, #36 npd test, #62 IDLE-2, #76/#77 location polish, #53/#57/#60/#75 in-progress rebuilds).

## How we work (orchestration) — see `.claude/skills/kira-orchestrator/`
Codex = backend wiring / grunt work, small tasks of any difficulty → cross-reviewed by an Opus sub-agent. UI → Opus (kira-ui) → cross-reviewed by Codex/Opus. Claude (Opus) orchestrates: decisions, task distribution, verification (PREPARE-test SQL on live, never trust self-declared green), build-gate, push.
