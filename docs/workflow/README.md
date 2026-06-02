# MonoPilot Kira — Claude Code + Codex Orchestration Workflow

This directory replaces the external **ACP / `kira_dev`** orchestration with a
self-contained, **Claude Code-native** multi-agent workflow that hard-wires the
**OpenAI Codex plugin (`codex-plugin-cc`)** for cross-provider review and
delegation.

> **Why this exists.** The previous pipeline (external `agent-control-plane`)
> produced "done but full of holes" output because it had **no real test
> execution gate, no UI/prototype-parity gate, single-model routing with no
> cross-provider review, and no cross-module dependency blocking**. This
> workflow closes all four gaps explicitly (see `02-QUALITY-GATES.md`).

## The deliverable you paste locally

**`00-MASTER-ORCHESTRATION-PROMPT.md`** is the operator prompt. Paste it into a
fresh **local** Claude Code session (Opus, with `codex-plugin-cc` installed) to
kick off the full long-run. It drives five phases by calling the slash commands
in `.claude/commands/kira/`.

## The five phases

| Phase | Command | Model lead | Output (committed) |
|---|---|---|---|
| **0 — Ground-truth audit** | `/kira:audit` | Sonnet fan-out → Opus synth | `_meta/audits/reality/<module>-REALITY.md` + refreshed per-module `STATUS.md` |
| **1 — Task consolidation + dep repair** | `/kira:consolidate` | Opus | reconciled `manifest.json`, harvested carry-forwards, validated DAG, normalized `routing_hints` |
| **2 — Mega execution plan** | `/kira:plan` | Opus | `_meta/plans/EXECUTION-PLAN.md` + per-wave manifests |
| **3 — Skills overhaul** | `/kira:skills-overhaul` | Opus | updated/new/removed skills + `MON-INDEX.md` |
| **4a — Walking Skeleton (Wave 0)** | `/kira:skeleton` | Opus + routed | login (Supabase Auth) + app shell + nav + Supabase-backed pages, verified for Vercel |
| **4b — Execution, ONE MODULE AT A TIME** | `/kira:run-module <NN>` | routed per task | a whole module built to Claude+Codex consensus, `_meta/runs/<NN>-SIGNOFF.md`, then STOP for your review |

`/kira:run-module` drives a module's intra-module waves via `/kira:run-wave`
mechanics. Cross-cutting: **`/kira:review`** is the risk-based cross-provider
review dispatcher (Claude↔Codex).

**Execution model = module by module** (`07-MODULE-EXECUTION.md`): full autonomy
inside a module, then it STOPS at the **module sign-off** for your review. The
sign-off carries a **task→feature map** (so no work is missed) + known external
gaps; your review comments are triaged into "blocked by another module" vs
"missing task here → create + implement".

**Priority:** Phase 4 begins with `/kira:skeleton` — the human's Definition of
Done is *a clickable, menu-driven product showing real Supabase data on Vercel*.
Login and the app shell were never tasked; the skeleton makes them real first.

## Infra (already provisioned)

Deploy = **Vercel**; database + auth = **Supabase** (Postgres + Supabase Auth via
`@supabase/ssr`). The workflow integrates with these — it does not set them up.
"Real data" means querying Supabase, never mocks. Codex shares this context via
the root `AGENTS.md`.

## Reference docs

- `01-MODEL-ROUTING.md` — who runs which job: **Codex is the primary implementer** (standard + logic); Sonnet = trivial work + Phase-0 audit, Haiku = mechanics + fast lookups, Opus = UI/parity + plan/orchestrate + review of Codex's high-risk work. The Claude side is wired as named subagents in `.claude/agents/kira-*.md`.
- `02-QUALITY-GATES.md` — the four gates that fix the ACP holes (test, UI-parity, cross-module-dep, risk-based review).
- `03-WORKTREE-PROTOCOL.md` — hybrid `git worktree` parallelism (parallel within a module, serialized across dependency edges).
- `04-CODEX-INTEGRATION.md` — `codex-plugin-cc` wiring, profiles, and the `/codex:*` command map.
- `05-AUDIT-PLAYBOOK.md` — Phase 0 verdict vocabulary, per-`task_type` checklist, Walking Skeleton audit, REALITY.md template.
- `06-AUTONOMY-AND-REMOTE.md` — UNATTENDED autonomy profile, `bypassPermissions`, phone notifications, and steering from your phone (Claude **Remote Control** + Channels, tmux fallback).
- `07-MODULE-EXECUTION.md` — the module-by-module model: rollout order, in-module autonomy, Claude+Codex consensus, sign-off report, and gap triage.

Autonomy is wired in `.claude/settings.json` (bypass mode + a `Notification` hook
→ `.claude/hooks/notify.sh` for phone pushes via `KIRA_NOTIFY_URL`). Two-way phone
control uses Claude Code **Remote Control** (`/remote-control`) — your local Mac
session, driven from the phone app.

## Ground rules (non-negotiable, inherited from skills)

- **Wave0 lock:** `org_id` (NOT `tenant_id`); RLS via `app.current_org_id()` (NOT raw `current_setting`).
- **Prototype parity** is a hard gate for every UI task — literal `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>` anchor + evidence (see `MON-t3-ui` + `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`).
- **Tests must actually run** and their real output captured — never trust a self-declared GREEN.
- **No task starts** until its `dependencies` and `cross_module_dependencies` are `✅ DONE` in `STATUS.md`.
- Always read `MON-project-overview` first, then the task-type + domain skills (see `.claude/skills/MON-INDEX.md`).

## Status of this scaffolding

These files are **the workflow definition**, not its execution. Phases 0–4 are
run **locally** by you (the operator prompt + commands). Nothing here mutates
task JSONs, skills, or app code on its own.
