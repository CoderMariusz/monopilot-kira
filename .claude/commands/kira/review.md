---
description: "Risk-based cross-provider review dispatcher (Claude↔Codex). Classifies risk and routes to the right reviewer."
argument-hint: "<task-id | --base <branch>> [--adversarial]"
allowed-tools: Agent, Bash, Read, Grep, Glob
model: opus
---

# /kira:review — Risk-Based Cross-Provider Review

Target: `$ARGUMENTS` — a `task-id` (preferred; reads the task JSON for context)
or `--base <branch>` to review a raw diff. `--adversarial` forces the 4-phase debate.

Gate 4 of `docs/workflow/02-QUALITY-GATES.md`. The writer never reviews its own
output; the *other* provider does.

## Procedure

1. **Classify risk.** HIGH if the change touches any of: schema/RLS/migrations,
   auth/RBAC/e-sign/PIN, money/costing/NUMERIC precision, regulatory (D365 R15,
   BRCGS, CFR-21 Part 11, GS1 SSCC-18, GDPR), UI parity, or a canonical owner
   (`wo_outputs`, `oee_snapshots`, event/permission enums). Else LOW.
   (If a `risk_tier` hint exists on the task, trust it but upgrade on any trigger above.)

2. **Identify the writer** (from the task's `writer`/`routing_hints` or who just
   implemented it) to pick the opposite reviewer.

3. **Route:**
   - **Claude-written, HIGH** → `/codex:review --base <integration-branch> --background`,
     then `/codex:status` → `/codex:result`. If `--adversarial` or contentious →
     `/codex:adversarial-review --base <integration-branch> --model gpt-5.5`.
   - **Codex-written, HIGH** → launch an **Opus** `Agent` review against the
     task's acceptance_criteria + risk_red_lines + the applicable `MON-*` skills.
   - **LOW (either writer)** → single cheaper-model self-check (Sonnet `Agent`):
     verify tests are real + green, ACs met, no red-line violations.

4. **Adjudicate.** Collect findings as `{severity, file:line, claim, fix}`. Apply
   high+medium-confidence fixes (route the fix to the appropriate model), re-run
   the relevant gate, and re-review. After **2 rounds** without resolution,
   STOP and escalate to the human with both positions summarized — the writer
   does not break the tie.

5. **Verdict.** Emit `PASS` (gates green, no unresolved high/medium findings) or
   `FAIL` + the blocking findings. PASS is required before `/kira:run-wave` merges.

## Degradation

If `/codex:status` is unhealthy, fall back to an Opus `Agent` review and prepend
the verdict with `⚠️ CROSS-PROVIDER REVIEW SKIPPED (Codex unavailable)` so the
task can be re-reviewed once Codex returns. Never silently drop the gate.
