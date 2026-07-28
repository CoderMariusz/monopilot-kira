# Post-fix production browser-audit contract

You are one auditor in a sequence of 20 independent production browser walks. Execute only the run named in your dispatch. The owner states that the prior 120 canonical defects and the 19 follow-up findings were fixed; this campaign hunts for new regressions, adjacent invariants, incorrect domain logic, arithmetic errors, missing CRUD/correctability, stale data, and broken cross-module flows.

## Environment

- Repository: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`, SHA `2eb57cf7b90c23d4c55afeb01116eaabc3250385`, READY.
- Authorized test account: `admin@monopilot.test`; credential supplied ephemerally by the orchestrator and never persisted in audit artifacts.
- Organization: Apex 22.
- Marker for owned records: `NIGHT-RXX-<UTC timestamp>`.
- All shell commands start with `rtk`.

## Mandatory reading

Read completely before browser action: `AGENTS.md`, `.agents/skills/MON-project-overview/SKILL.md`, `.agents/skills/MON-verify-and-review/SKILL.md`, each domain skill named by the run, and `/Users/mariuszkrawczyk/.codex/plugins/cache/openai-bundled/browser/26.707.41301/skills/control-in-app-browser/SKILL.md`.

Use `_meta/plans/2026-07-14-sol-deep-browser-audit/FULL-REPORT.md` and `_meta/plans/2026-07-16-sol-fix-campaign/` only as a denylist/context. Do not copy a finding. A regression is reportable only after current-production reproduction. Prefer new data shapes, boundaries, state transitions, and cross-module invariants.

## Real browser only

Use the Browser skill exactly and interact through the visible UI. If the selected in-app Browser backend genuinely fails after the skill-prescribed troubleshooting, use the installed Codex Playwright MCP fallback. Never use Cursor, a standalone browser process, direct Server Actions, REST calls, SQL writes, or DB manipulation to bypass the UI. Source/log/DB inspection is read-only and only after a browser observation, to support a root-cause hypothesis.

Use one isolated browser tab, one active agent, and close/finalize it at the end. Capture screenshots or DOM evidence under `run-NN/evidence/`; evidence filenames must map to scenario IDs. Never include credentials, tokens, cookies, PINs, or unrelated personal data.

## Test discipline

- Create/mutate/delete only records bearing your exact marker. Seeded or foreign records are read-only.
- Cover happy path, invalid/zero/negative/high-precision boundary, persistence after refresh and revisit, edit/correction, delete/deactivate/cancel where safe, site scope, and idempotent repeat action.
- Exercise server gates through the UI; a disabled button alone does not prove a gate.
- For arithmetic, write the manual equation, input lineage, expected exact result, displayed result, rounding unit, and delta.
- For cross-module flows, record the identifier at every handoff and reconcile quantity, UoM, status, dates, cost, and site.
- Distinguish actual app defect from browser-tool issue, missing prerequisites, intentional rule, and test-data blocker.
- A finding requires: stable ID `PF-RXX-NN`, severity P0–P3, URL, exact repro, expected/actual, business impact, evidence path, persistence check, and likely current-source `file:line` when safely verified.
- After one safe retry and a fresh snapshot, stop a blocked interaction after 3 minutes and continue elsewhere.
- No product source edits, commits, migrations, deployments, permission changes, or direct cleanup.

## Cleanup and autorun terminal condition

Continue autonomously; never wait for an orchestrator checkpoint. Hard timebox 40 minutes: roughly 0–27 browser scenarios, 27–31 last checks, 31–35 cleanup, 35–40 evidence/report/source trace. At minute 31 start no new scenario. Mark unfinished work `NOT RUN` or `BLOCKED` honestly.

Cleanup owned artifacts through UI whenever safe. If deletion is impossible or would destroy audit/genealogy, leave the record in a safe final state and list exact identifier/status/reason. Close/finalize the tab.

Write `_meta/plans/2026-07-16-postfix-deep-browser-audit/run-NN/REPORT.md`, verify it is nonempty and evidence paths exist, then immediately return FINAL. Never remain running after the report exists.

## Required report structure

1. Deployment/verdict and exact run marker.
2. Scenario table with PASS / FAIL / BLOCKED / NOT RUN and evidence.
3. Findings P0→P3 with full repro/expected/actual/impact/persistence/root cause.
4. Manual calculations and cross-module lineage.
5. Prior fixes opportunistically confirmed (or regressed), clearly separated.
6. Cleanup/remaining artifacts and explicit limitations.
7. Counts: scenarios attempted, PASS, FAIL, BLOCKED, NOT RUN, findings by severity.
