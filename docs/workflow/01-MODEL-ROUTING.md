# Model Routing — who runs which job

The orchestrator routes each unit of work to the cheapest model that can do it
**correctly**, and pairs writer/reviewer across providers. This table replaces
the legacy `routing_hints` (`hermes_gpt55`, `spark_low_risk_else_opus`,
`opus_if_high_risk_or_ui_or_architecture`).

## Routing tokens (use these in `routing_hints` after Phase 1)

| Token | Resolves to | Used for |
|---|---|---|
| `research-fanout` | Claude **Sonnet** sub-agents (`Agent` tool, parallel) | broad codebase sweeps, reality audits, "find all X" |
| `research-synth` | Claude **Opus** | synthesizing fan-out results into a judgment |
| `mechanical` | Claude **Haiku** | renames, lint/codemod fixes, i18n key moves, string extraction, file moves |
| `impl-standard` | Claude **Sonnet** | T1-schema, T2-api, T5-seed — clear contracts, low ambiguity |
| `impl-logic` | **Codex** (`/codex:rescue`, `--model gpt-5.4`) | algorithm/logic-heavy code: MRP, allocation, FIFO/WAC, SSCC mod-10, DSL executors, scheduling/cycle detection |
| `impl-ui` | Claude **Opus** | T3-ui and UI-flow T4 — prototype-parity translation is architectural (per `MON-t3-ui`) |
| `test` | Claude **Sonnet** | T4-wiring-test, Playwright/Vitest authoring |
| `decompose` | Claude **Opus** | `prd-decompose-hybrid` (Opus-only — Haiku fails tech-stack accuracy) |
| `plan` / `orchestrate` | Claude **Opus** | wave planning, consolidation, audit synthesis, this orchestrator |

## Writer → reviewer pairing (cross-provider)

The model that wrote the code never signs off on it. Pairing depends on risk
tier (see `02-QUALITY-GATES.md`):

| Writer | High-risk reviewer | Low-risk reviewer |
|---|---|---|
| Claude (Sonnet/Opus) | **Codex** `/codex:review` (or `/codex:adversarial-review`) | Claude Sonnet self-check pass |
| Codex (`impl-logic`) | **Claude Opus** review | Claude Sonnet review |
| Haiku (`mechanical`) | n/a — diff is trivial | Sonnet spot-check |

## Default routing by `task_type`

| `task_type` | Writer | Reviewer (high-risk) | Notes |
|---|---|---|---|
| T1-schema | `impl-standard` | Codex + Opus (RLS/security always high-risk) | migrations, Drizzle, RLS, audit triggers |
| T2-api | `impl-standard`; `impl-logic` if algorithm-heavy | Codex | Server Actions, validation, outbox, rate-limit |
| T3-ui | `impl-ui` (Opus) | Codex review **+** screenshot/axe parity gate | parity is non-negotiable |
| T4-wiring-test | `test` | Codex | E2E + integration |
| T4-e2e | `test` | Codex | Playwright only |
| T5-seed | `impl-standard` / `mechanical` | Sonnet | inserts/fixtures |
| T0-root / docs | `plan` (Opus) | Opus self + Codex spot | policy/ADR/contract |

## Cost note (agentmaxxing economics)

Codex Cloud delegation does not consume local resources, so the orchestrator may
run several local Claude worktrees alongside several Codex Cloud tasks
concurrently. Give Codex **worker** tasks a cheaper profile and reserve
`gpt-5.4` for reviews (see `04-CODEX-INTEGRATION.md` → profiles). High-risk
implementation and all parity/architecture judgment stay on **Opus**.

## Escalation

- A `mechanical`/`impl-standard` task that turns out ambiguous or architectural → escalate to Opus, don't guess.
- Two cross-provider review rounds with unresolved disagreement → escalate to the human with both positions summarized (do not let the writer break the tie).
