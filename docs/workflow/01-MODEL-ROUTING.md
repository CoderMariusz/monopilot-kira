# Model Routing — who runs which job

The orchestrator routes each unit of work to the cheapest model that can do it
**correctly**, and pairs writer/reviewer across providers. This table replaces
the legacy `routing_hints` (`hermes_gpt55`, `spark_low_risk_else_opus`,
`opus_if_high_risk_or_ui_or_architecture`).

# Model Routing — who runs which job

The orchestrator routes each unit of work to the model that does it **correctly
at the lowest cost**, and pairs writer/reviewer across providers. **Codex is the
primary implementer** — both standard and logic-heavy code go to it. Claude is
the orchestrator, the UI/parity author, and the reviewer of Codex's work. This
replaces the legacy `routing_hints` (`hermes_gpt55`, `spark_low_risk_else_opus`,
`opus_if_high_risk_or_ui_or_architecture`).

The Claude side is wired as **named subagents** in `.claude/agents/kira-*.md`
(the orchestrator calls them by name); Codex is invoked via `/codex:*` (it is a
separate provider, not a Claude subagent).

## Routing tokens (use these in `routing_hints` after Phase 1)

| Token | Resolves to | Used for |
|---|---|---|
| `research-quick` | Claude **Haiku** (`kira-mechanical`) | fast lookups: grep/find, "where is X", "does Y exist" |
| `research-audit` | Claude **Sonnet** (`kira-research`, parallel) | Phase-0 reality classification + module research reads (needs judgment) |
| `research-synth` | Claude **Opus** | synthesizing fan-out results into a judgment |
| `mechanical` | Claude **Haiku** (`kira-mechanical`) | renames, lint/codemod fixes, i18n key moves, string extraction, file moves |
| `impl-easy` | Claude **Sonnet** (`kira-easy`) | ONLY trivial work: a single CRUD action, a simple seed/fixture, a simple test |
| `impl-standard` | **Codex** (`/codex:rescue`, `--model gpt-5.4`) | the bulk of implementation: T1-schema, T2-api, T5-seed |
| `impl-logic` | **Codex** (`/codex:rescue`, `--model gpt-5.4`) | algorithm/logic-heavy code: MRP, allocation, FIFO/WAC, SSCC mod-10, DSL executors, scheduling/cycle detection |
| `impl-ui` | Claude **Opus** (`kira-ui`) | T3-ui and UI-flow T4 — prototype-parity translation is architectural (per `MON-t3-ui`) |
| `test` | Claude **Sonnet** (`kira-easy`); **Codex** if complex | T4-wiring-test, Playwright/Vitest authoring |
| `review-codex-work` | Claude **Opus** (`kira-codex-review`, high-risk) / **Sonnet** (low) | Claude reviewing Codex-written code |
| `decompose` | Claude **Opus** | `prd-decompose-hybrid` (Opus-only — Haiku fails tech-stack accuracy) |
| `plan` / `orchestrate` | Claude **Opus** | wave planning, consolidation, audit synthesis, this orchestrator |

> **Why Sonnet still does the Phase-0 audit (`research-audit`), not Haiku:**
> classifying "implemented vs stub vs broken" with file evidence is judgment, not
> a quick lookup. Haiku is reserved for genuinely mechanical work + fast lookups.
> If you'd rather push the audit to Haiku to save cost, change `kira-research`'s
> model to `haiku` — but expect more misclassifications to fix in Phase 1.

## Writer → reviewer pairing (cross-provider)

The model that wrote the code never signs off on it. Since **Codex writes most
code**, Claude does most reviewing; the one inverted lane is UI (Opus writes,
Codex reviews). Pairing depends on risk tier (see `02-QUALITY-GATES.md`):

| Writer | High-risk reviewer | Low-risk reviewer |
|---|---|---|
| **Codex** (`impl-standard`, `impl-logic`) | **Claude Opus** (`kira-codex-review`) | Claude Sonnet (`kira-easy`) |
| Claude **Opus** (`impl-ui`) | **Codex** `/codex:review` (or `/codex:adversarial-review`) | Codex `/codex:review` |
| Claude **Sonnet** (`impl-easy`, `test`) | **Codex** `/codex:review` | Codex `/codex:review` |
| Claude **Haiku** (`mechanical`) | n/a — diff is trivial | Sonnet spot-check |

## Default routing by `task_type`

| `task_type` | Writer | Reviewer (high-risk) | Notes |
|---|---|---|---|
| T1-schema | **Codex** (`impl-standard`) | Claude Opus (RLS/security always high-risk) | migrations, Drizzle, RLS, audit triggers |
| T2-api | **Codex** (`impl-standard`/`impl-logic`) | Claude Opus (high) / Sonnet (low) | Server Actions, validation, outbox, rate-limit |
| T3-ui | `impl-ui` (Opus) | Codex review **+** screenshot/axe parity gate | parity is non-negotiable; the inverted lane |
| T4-wiring-test | `test` (Sonnet; Codex if complex) | Codex | E2E + integration |
| T4-e2e | `test` | Codex | Playwright only |
| T5-seed | **Codex** (`impl-standard`); `impl-easy` if trivial | Sonnet | inserts/fixtures |
| T0-root / docs | `plan` (Opus) | Opus self + Codex spot | policy/ADR/contract |

## `impl-logic` task families per module → route to Codex

Both `impl-standard` and `impl-logic` go to Codex now; this list flags the
**algorithmic cores** that additionally deserve a careful **Opus** review (money,
ordering/graph constraints, regulatory math). When in doubt, anything with
non-trivial edge cases → Codex writes, Opus reviews.


| Module | `impl-logic` families (Codex implements) |
|---|---|
| 00-foundation | workflow-as-data / rule-DSL executor, rule cascade, idempotency canonical-stringify, GS1 mod-10 + check-digit parsers, RBAC HMAC + SoD, e-sign crypto (T-124), sync-queue backoff/dedup, schema-drift diff |
| 01-npd | BOM explosion + versioning, recipe/spec computation, cost roll-up inputs |
| 02-settings | rule-registry DSL evaluation, schema-driven column draft/publish logic, feature-flag evaluation |
| 03-technical | D365 anti-corruption mapping (export-only), cost-per-kg calc (dual ownership), BOM SSOT resolution |
| 04 + 07 planning | MRP netting, WO scheduling, capacity, `wo_dependencies` **cycle detection (V-PLAN-WO-CYCLE)**, `schedule_outputs` derivation |
| 05-warehouse | FEFO selection, LP-transition DSL, reservation/allocation math |
| 06-scanner-p1 | offline sync conflict resolution, queue flush ordering/idempotency |
| 08-production | WO lifecycle state machine, yield/waste calc, **`oee_snapshots` producer math (D-OEE-1)**, consume-gate enforcement |
| 09-quality | HACCP/CCP deviation logic, allergen gate, hold + **T-064 consume gate**, spec evaluation |
| 10-finance | **FIFO/WAC valuation, variance, actual costing roll-up, cost-per-kg** (NUMERIC-exact) |
| 11-shipping | allocation, pick/wave sequencing, **SSCC-18 mod-10**, BOL/POD SHA-256 hashing, carrier rate logic |
| 12-reporting | aggregation + KPI computation (push heavy aggregation into SQL/MVs) |
| 13-maintenance | PM schedule generation, MTBF/MTTR calc, calibration interval logic |
| 14-multi-site | site-scope propagation (`app.current_site_id()`), cross-site allocation |
| 15-oee | **OEE = Availability × Performance × Quality**, MV refresh logic, DSL rule definitions, drilldown aggregation |

UI for these modules still goes to `impl-ui` (Opus) — Codex writes the engine,
Opus writes the screen that drives it, each reviewed by the other.

## Cost note (agentmaxxing economics)

Codex is now the implementation workhorse, so most volume lands there. Codex
Cloud delegation does not consume local resources, so the orchestrator may run a
few local Claude worktrees (Opus UI, Sonnet easy/review, Haiku mechanical)
alongside many Codex Cloud implementation tasks concurrently. Give Codex
**worker/implementation** tasks a cheaper profile and reserve `gpt-5.4` for
high-risk implementation + reviews (see `04-CODEX-INTEGRATION.md` → profiles).
All parity/architecture judgment and review of Codex's high-risk work stay on
**Opus**; Sonnet is for trivial work + low-risk review; Haiku for mechanics + fast
lookups only.

## Escalation

- A Codex `impl-standard` task that turns out architectural/ambiguous → escalate to **Opus** (orchestrator decides), don't let Codex guess.
- An `impl-easy`/`mechanical` task that turns out non-trivial → bump to Codex (`impl-standard`) or Opus, don't force it.
- Two cross-provider review rounds with unresolved disagreement → escalate to the human with both positions summarized (the writer never breaks the tie).
