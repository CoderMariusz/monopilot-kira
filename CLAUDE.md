# CLAUDE.md — MonoPilot Kira

Orientation pointer for Claude Code sessions. Authoritative detail lives in the
project **skills** (`.claude/skills/`) and the **workflow** docs
(`docs/workflow/`) — this file just routes you there.

## Read order

1. `.claude/skills/MON-project-overview/SKILL.md` — repo map, tech stack, module glossary.
2. `.claude/skills/MON-INDEX.md` — pick the task-type + domain skills for what you're touching.
3. `docs/workflow/README.md` — the Claude Code + Codex orchestration workflow (replaces the retired external ACP).

## Hard rules (never violate)

- **Wave0 lock:** `org_id` NOT `tenant_id`; RLS via `app.current_org_id()` NOT raw `current_setting`.
- **Prototype parity** is a gate for every UI task — literal `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>` anchor + evidence (`_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`).
- **Tests run for real**; capture actual output. A self-declared GREEN with no run is a FAIL.
- **No task starts** until its `dependencies` + `cross_module_dependencies` are ✅ DONE in the owning module's `STATUS.md`.
- **Canonical owners:** `wo_outputs` → 08-production; `schedule_outputs` → planning; `oee_snapshots` written only by 08-production (15-oee is read-only). Don't cross these.

## Running the build

The multi-agent long-run is driven by `docs/workflow/00-MASTER-ORCHESTRATION-PROMPT.md`
and the `/kira:*` commands in `.claude/commands/kira/` (audit → consolidate →
plan → skills-overhaul → run-wave), with `codex-plugin-cc` for cross-provider
review (`/kira:review`).

## Common commands

```bash
pnpm --filter web vitest run <path>                       # web unit / RTL
pnpm --filter web exec playwright test <spec> --trace on  # E2E
pnpm db:up && pnpm db:test                                # schema/RLS tests (needs local Postgres)
pnpm lint && pnpm typecheck && pnpm test:smoke            # repo guards
```
