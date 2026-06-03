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
| `impl-easy` | Claude **Sonnet** (`kira-easy`) | **EASY tier (~35% of the former Codex load — moved to Sonnet to cut Codex token burn).** Low-risk, low-ambiguity impl: simple seeds/fixtures (T5), single-statement migrations (one CHECK / GRANT / index / column-add / VALIDATE CONSTRAINT — no multi-table or complex-RLS logic), test authoring (T4), docs, trivial **additive** helpers + config (no auth/RLS/money/regulatory/canonical-owner). |
| `impl-standard` | **Codex** (`codex exec --model gpt-5.5`) | **MEDIUM tier — the MAIN FLOW (stays Codex).** The bulk of real implementation: T1-schema with RLS policies / audit triggers / multi-table migrations, T2-api Server Actions (zod validation, outbox dispatch, rate-limit, RLS-scoped), org-scoped CRUD with real invariants, moderate logic. When in doubt between easy and hard, it's medium → Codex. |
| `impl-hard` | Claude **Opus 4.8** (`kira-ui` profile or direct) | **HARD tier (now implemented by Opus, not just reviewed).** Algorithmic cores (MRP netting, FIFO/WAC + variance, SSCC-18 mod-10, WO scheduling + cycle detection, FEFO/LP-transition, DSL/rule executors), regulatory crypto (e-sign CFR-21, RBAC HMAC + SoD), cross-org / canonical-owner / security-critical RLS changes, architecture / cross-cutting refactors. (Former `impl-logic` folds here **when genuinely hard**; medium logic stays `impl-standard`/Codex.) |
| `impl-ui` | Claude **Opus** (`kira-ui`) | T3-ui and UI-flow T4 — prototype-parity translation is architectural (per `MON-t3-ui`) |
| `test` | Claude **Sonnet** (`kira-easy`); **Codex** if complex | T4-wiring-test, Playwright/Vitest authoring |

> **Cost-tiering rule (2026-06-03, user directive):** Codex (gpt-5.5) burns tokens fast, so route by
> difficulty into THREE impl tiers — **Sonnet = easy (~35% of what Codex used to do)**, **Codex =
> medium and the main flow**, **Opus 4.8 = hard**. Classify by `risk_tier` + complexity signals: a task is
> EASY only if it is **low-risk AND low-ambiguity AND additive** (single-statement migration, simple
> seed/test/doc, trivial helper). It is HARD if it has an **algorithmic core, regulatory/crypto math,
> cross-org/canonical-owner/security-critical surface, or architectural ambiguity**. Everything else is
> MEDIUM → Codex. Cross-provider review still holds (writer never reviews own work): Sonnet→Codex review,
> Codex→Opus(high)/Sonnet(low), Opus→Codex review. If an easy task turns out non-trivial mid-flight, bump
> it to Codex; if a medium Codex task turns out architectural, bump to Opus — don't let the cheaper tier guess.
| `review-codex-work` | Claude **Opus** (`kira-codex-review`, high-risk) / **Sonnet** (low) | Claude reviewing Codex-written code |
| `decompose` | Claude **Opus** | `prd-decompose-hybrid` (Opus-only — Haiku fails tech-stack accuracy) |
| `plan` / `orchestrate` | Claude **Opus** | wave planning, consolidation, audit synthesis, this orchestrator |

> **Why Sonnet still does the Phase-0 audit (`research-audit`), not Haiku:**
> classifying "implemented vs stub vs broken" with file evidence is judgment, not
> a quick lookup. Haiku is reserved for genuinely mechanical work + fast lookups.
> If you'd rather push the audit to Haiku to save cost, change `kira-research`'s
> model to `haiku` — but expect more misclassifications to fix in Phase 1.

## Writer → reviewer pairing (cross-provider)

The model that wrote the code never signs off on it. With the 3-tier split, work
is distributed across Sonnet (easy) / Codex (medium) / Opus (hard + UI); each is
reviewed by a *different* provider. Pairing depends on risk tier (see `02-QUALITY-GATES.md`):

| Writer | High-risk reviewer | Low-risk reviewer |
|---|---|---|
| **Codex** (`impl-standard`, medium) | **Claude Opus** (`kira-codex-review`) | Claude Sonnet (`kira-easy`) |
| Claude **Opus** (`impl-hard`, `impl-ui`) | **Codex** `codex exec review` (or `adversarial-review`) | Codex `codex exec review` |
| Claude **Sonnet** (`impl-easy`, `test`) | **Codex** `codex exec review` | Codex `codex exec review` |
| Claude **Haiku** (`mechanical`) | n/a — diff is trivial | Sonnet spot-check |

> The inverted lane (Claude writes → Codex reviews) now covers BOTH Opus UI and
> Opus hard-impl. Keep `codex exec review` for those so the cross-provider gate is
> never skipped just because Claude wrote the hard code.

## Default routing by `task_type`

| `task_type` | Writer | Reviewer (high-risk) | Notes |
|---|---|---|---|
| T1-schema | **Sonnet** (`impl-easy`) if single-statement (CHECK/GRANT/index/column/VALIDATE); **Codex** (`impl-standard`) for RLS policies / audit triggers / multi-table; **Opus** (`impl-hard`) if security-critical or cross-org | Claude Opus (RLS/security always high-risk) | route migrations by complexity, not blanket-Codex |
| T2-api | **Codex** (`impl-standard`) default; **Sonnet** for trivial additive helpers; **Opus** (`impl-hard`) for algorithmic / regulatory / cross-org / canonical-owner | Claude Opus (high) / Sonnet (low) | Server Actions, validation, outbox, rate-limit |
| T3-ui | `impl-ui` (Opus) | Codex review **+** screenshot/axe parity gate | parity is non-negotiable; the inverted lane |
| T4-wiring-test | `test` (**Sonnet**; Codex if complex) | Codex | E2E + integration — mostly Sonnet now |
| T4-e2e | `test` (**Sonnet**) | Codex | Playwright only |
| T5-seed | **Sonnet** (`impl-easy`) default; Codex only if logic-heavy | Sonnet / Codex | inserts/fixtures are mostly the EASY tier |
| impl-logic families | **Opus** (`impl-hard`) when hard / **Codex** when medium | cross-provider (the other one) | MRP, FIFO/WAC, SSCC-18, DSL/scheduling, cycle-detection, e-sign/RBAC crypto (see §"impl-logic families per module") |
| T0-root / docs | **Sonnet** (`impl-easy`) for plain docs/runbooks; **Opus** (`plan`) for policy/ADR/contract | Opus self + Codex spot | route docs by stakes |

## `impl-logic` task families per module → HARD tier = Opus 4.8

These are the **algorithmic / regulatory cores** (money, ordering/graph constraints,
regulatory math, crypto). Under the 3-tier split these are the HARD tier → **Opus 4.8
implements** them (`impl-hard`), and **Codex reviews** (the inverted lane). Codex still
writes the surrounding MEDIUM work (the migrations, plumbing, CRUD, plain Server Actions)
around these cores. Rule of thumb: the *engine* (the list below) → Opus; the *wiring* → Codex.
A genuinely simple item that happens to live in a "logic" module still drops to Sonnet if it's
single-statement/additive.

| Module | hard `impl-logic` families (**Opus** implements, Codex reviews) |
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

UI for these modules goes to `impl-ui` (Opus). So Opus now owns the screen AND the
hard engine; Codex owns the medium wiring between them; Sonnet owns the easy edges
(seeds, single-statement migrations, tests, docs) — each reviewed by a different provider.

## Cost note (agentmaxxing economics)

Codex (gpt-5.5) is the most expensive token sink, so the 3-tier split deliberately
**caps Codex at the MEDIUM band**: the easy ~35% drops to **Sonnet** and the hard
cores rise to **Opus 4.8**, leaving Codex the medium main-flow. Net effect: fewer
Codex tokens without losing the cross-provider gate. Target mix per wave (rough):
**~35% Sonnet (easy) · ~45% Codex (medium) · ~20% Opus (hard + UI)** — tune to the
actual `risk_tier`/complexity distribution of the wave. Sonnet (Claude subagent) and
Opus run as local worktrees; Codex runs via `codex exec`. Reviews: Codex reviews
Opus's hard+UI work and Sonnet's easy work; Opus reviews Codex's high-risk medium
work; Sonnet does low-risk review of Codex. Haiku stays mechanics + fast lookups only.
If Codex token burn is still high, shift the easy/medium boundary further toward Sonnet
before touching the medium→Opus boundary (keep the medium main-flow on Codex per the directive).

## Escalation

- A Codex `impl-standard` task that turns out architectural/ambiguous → escalate to **Opus** (orchestrator decides), don't let Codex guess.
- An `impl-easy`/`mechanical` task that turns out non-trivial → bump to Codex (`impl-standard`) or Opus, don't force it.
- Two cross-provider review rounds with unresolved disagreement → escalate to the human with both positions summarized (the writer never breaks the tie).
