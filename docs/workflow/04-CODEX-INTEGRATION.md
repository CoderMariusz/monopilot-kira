# Codex Integration — `codex-plugin-cc` wiring

This workflow **hard-wires** the OpenAI Codex plugin for Claude Code. Codex is
the cross-provider reviewer for Claude-written code and the implementer for
logic-heavy tasks (`impl-logic`). The bridge breaks the "model grades its own
homework" bias documented in `02-QUALITY-GATES.md` (Gate 4).

## Prerequisites (local machine)

1. `codex-plugin-cc` installed in Claude Code and authenticated to an OpenAI
   account with Codex/GPT-5.x access.
2. `/codex:status` returns healthy before any long-run starts. The master prompt
   checks this first.
3. (Optional but recommended) Codex Cloud enabled for off-machine parallelism.

## Command map (what the orchestrator calls)

| Purpose | Command | When |
|---|---|---|
| Background review of a diff | `/codex:review --base <integration-branch> --background` | Gate 4 review of Claude-written high-risk tasks |
| Poll a backgrounded job | `/codex:status` | after delegating |
| Fetch a finished review/result | `/codex:result` | after status shows done |
| Full adversarial debate | `/codex:adversarial-review --base <integration> --model gpt-5.5` | highest-risk / contentious tasks (4-phase: independent → cross → meta → synthesis) |
| Delegate implementation to Codex | `/codex:rescue` | `impl-logic` tasks (MRP, allocation, FIFO/WAC, SSCC mod-10, DSL/scheduling, cycle detection) |

`--background` is mandatory for multi-file reviews so the Claude session isn't
blocked while Codex works — delegate, continue, poll, collect.

## Profiles (cost control)

Reserve the strong model for review/adversarial; give worker/implementation a
cheaper profile. Configure in your Codex config (`~/.codex/config.toml` or the
plugin's profile settings):

```toml
# reviewer — quality matters most
[profiles.review]
model = "gpt-5.5"

# worker — cheaper, for bulk impl-logic delegation / Codex Cloud fan-out
[profiles.worker]
model = "gpt-5.3-codex-spark"   # use the cheapest model that passes the gate
```

Adjust model names to whatever your account exposes — on this ChatGPT-plan
account that is `gpt-5.5` (strong) and `gpt-5.3-codex-spark` (cheap, the `spark`
alias); `gpt-5.4*` and the app-server default `gpt-5.3-codex` are **not**
available and return HTTP 400. The principle is **strong model for judgment,
cheap model for volume**.

## Pairing rules (from `01-MODEL-ROUTING.md`)

- **Claude writes → Codex reviews.** High-risk: `/codex:review` (or
  `/codex:adversarial-review`). The writer (Claude) never signs off its own work.
- **Codex writes → Claude reviews.** `impl-logic` output is reviewed by **Opus**
  (high-risk) or Sonnet (low-risk).
- After 2 rounds without resolution → escalate to the human with both positions;
  do not let either writer break the tie.

## AGENTS.md (Codex context)

Codex reads `AGENTS.md` files for repo context, the way Claude reads skills /
`CLAUDE.md`. If `impl-logic` Codex output keeps missing project invariants
(org_id, RLS, canonical owners, NUMERIC precision, prototype parity), add a root
`AGENTS.md` mirroring the hard rules from `MON-project-overview` so Codex shares
the same ground truth. (Not created by this scaffolding — add it in Phase 3 if
the review loop shows Codex needs it.)

## Degradation

You chose hard-wired Codex, so keep it healthy. If `/codex:status` is down
mid-run, `/kira:review` falls back to a second Claude provider-internal pass and
**explicitly flags** that cross-provider review was skipped for the affected
tasks, so they can be re-reviewed once Codex is back. Never silently drop the
cross-provider gate on a high-risk task.
