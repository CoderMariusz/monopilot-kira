# CONSENSUS ASSESSMENT — judge 01-npd (NPD) module sign-off readiness. Codex, READ-ONLY (do NOT modify any files).
Project root: /Users/mariuszkrawczyk/Projects/monopilot-kira (branch kira/long-run). You are the cross-provider (Codex) half of a Claude+Codex consensus gate.

## What to judge
Independently assess whether the 01-npd module is ready for human sign-off, against:
1. **Task completeness** — read _meta/atomic-tasks/01-npd/STATUS.md (139 tasks: 128 ✅ DONE, 11 🔒 GAP). Confirm the 11 gaps are legitimately deferrable (D365 builder x9 = user-decided deferral pending PRD field mappings; Sensory x2 = cross-module, owned by 03-technical) and that NO non-gap task is silently incomplete.
2. **Domain rules** — .claude/skills/MON-domain-npd/SKILL.md: stage-gate G0-G4 + e-sign at G3 (creates FG), FG canonical terminology (fa.* internal alias OK), allergen cascade engine+materialize, V01-V18 validators, costing 9-step waterfall NUMERIC-exact, formulation lifecycle draft→trial→locked.
3. **Wave0 lock** — spot-check migrations packages/db/migrations/075..146: org_id NOT tenant_id; RLS via app.current_org_id() with ENABLE+FORCE; no current_setting('app.tenant_id'). Sample 5-6 NPD migrations + the RLS policies.
4. **Canonical owners** — NPD must not own wo_outputs/schedule_outputs/oee_snapshots. Check migration 144 (npd_legacy_closeout) correctly treats public.work_order as a SOFT link (plain uuid, no hard FK) — 08-production owns work_order.
5. **Money** — costing/nutrition columns NUMERIC (never float). Spot-check.
6. **Real tests** — note: the per-task DB tests pass in ISOLATION (the full one-DB suite has known test-isolation pollution, recorded as infra gap). Migrations 001→146 apply clean from scratch. web tsc = 0.
7. **Prototype parity** — UI tasks anchored to prototypes/design/Monopilot Design System/npd/*.jsx with evidence.

## Method
Read STATUS.md + the skill + sample ~8-10 representative implementation files (server actions under apps/web/app/**/(npd)/**/_actions, a couple migrations, the costing/allergen/formulation cores, the FA-detail locale tree). Be adversarial but specific. You are NOT re-running the whole build — you are judging readiness + flagging anything that should block sign-off.

## Output (write your verdict as your final message)
- VERDICT: SIGN-OFF / SIGN-OFF-WITH-NITS / BLOCK
- Findings tagged P0 (blocks sign-off) / P1 (should fix soon) / P2 (nit), each with file:line + concrete reasoning.
- Explicit confirmation that the 11 gaps are acceptable (or not).
- Any canonical-owner / RLS / money / red-line violation = automatic P0.
