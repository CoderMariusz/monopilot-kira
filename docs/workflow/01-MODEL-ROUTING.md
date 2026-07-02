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

## Composer 2.5 (Cursor CLI) — engine addendum (2026-07-02)

A second external implementer is now wired next to Codex: **Composer 2.5** via the Cursor Agent
CLI (`bash ~/.claude/scripts/cursor-exec.sh composer-2.5 <workspace> <prompt-file> <out-file>`,
blocking, full file+shell access; details in skill `MON-engine-routing` + global `engine-delegation`).

Why: ~60x cheaper per task than gpt-5.5 ($0.07 vs $4.82, Artificial Analysis CAI), >200 tok/s,
SWE-Bench Multilingual 79.8% (>= GPT-5.5), billed from Cursor Pro's separate pool (does not burn
Codex tokens or the $20 API pool). Weak spot: terminal/shell/infra (Terminal-Bench ~66-69% vs
Codex 82.7%) — keep those on Codex.

Token deltas (everything else in this file unchanged):
- `impl-easy`  → Sonnet **or composer-2.5** (prefer Composer for multi-file mechanical impl).
- `impl-standard` → **composer-2.5 by default**; stays Codex when the task is terminal/infra/CI-heavy,
  needs live psql/cli debugging, or after 2 failed Composer attempts (escalate with same prompt).
- Review pairing: writer != reviewer, cross-provider — Composer's code is reviewed by Codex
  (MON-codex-review-checklist), Codex's code by Claude (or Composer in `--mode plan`).
- Composer NEVER solo on auth/RLS/money/regulatory/canonical-owner tiers; its output always passes
  Gate-5 + cross-review (documented RL reward-hacking tendencies).

## Fleet orchestration (Agent-A) — addendum 2026-07-02
> **OWNER 2026-07-02 (post-F1): this layout — "Układ A" (Composer writes → Codex reviews →
> Claude in reserve) — is the STANDARD operating model.** Proven in wave F1 (0 escaped defects,
> beats Codex-alone and Codex+Opus on quality-per-cost; full evidence:
> `_meta/reports/2026-07-02-f1-fleet-report.html`). The orchestrator's deterministic gate
> (tsc + build + live-migrate + tree-verification) is a LOAD-BEARING component of the layout.
>
> **Longitudinal eval protocol (owner):** for the NEXT TWO waves (F2, F3), repeat the full
> end-of-wave evaluation — Fable grades every lane (correctness/idiom/tests/scope) AND
> additionally grades **Composer-written code against the pre-F1 historical baseline**
> (comparable modules previously written by Codex/Opus) — to confirm F1 wasn't luck.
> Each wave ships the same HTML comparison report.
>
> **Wave protocol hard rules (F1 top-5, binding from F2):**
> 1. Worktree bootstrap symlinks the node_modules PAIR (root + apps/web) —
>    `~/.claude/scripts/worktree-bootstrap.sh <wt>`.
> 2. Every Composer lane runs scoped `tsc --noEmit` on its package before reporting.
> 3. Fabrication check is mechanical: every engine report must embed `git diff --stat`
>    + raw test stdout; reports referencing absent files auto-fail.
> 4. Reviews of DML touching CHECK/unique-constrained columns validate against the LIVE
>    schema (R-E4 live-Postgres pattern), not just unit tests.
> 5. Shared files get ONE owner per wave (declare in the fan-out brief); i18n keys are
>    partitioned per lane before dispatch; shared-type modules named explicitly.
>
> **Wave-F2 results + hard rules (F2 top-5, binding from F3):** evidence in
> `_meta/reports/2026-07-02-f2-fleet-report.html` + `_meta/runs/2026-07-02-f2-fable-eval.md`
> (wave GPA ~4.1; Composer graded BETTER than the pre-F1 Codex/Opus baseline; ONE escape —
> Codex E7 pg bind-typing 22P02 — caught by the last gate, live-E3, hotfixed <1 h;
> longitudinal verdict at 2-of-3 waves: "leaning repeatable").
> 6. Every codex BRIDGE prompt (write AND review) carries the imperative: *"run codex DIRECTLY
>    and BLOCKING in the foreground; NEVER use a background job wrapper; never report 'running
>    in background'"*. In F2, 3 of 4 write bridges without it died by backgrounding (~640 s,
>    1 tool use) while their codex jobs kept running; all 4 review bridges WITH it survived.
> 7. Reviews of lanes that add or reshape SQL statements run
>    `python3 scripts/scan-dual-cast-params.py <changed .ts files>` — one `$n` bound with two
>    different casts, or a non-text cast plus a bare use, fails pg BIND typing (pg types a
>    parameter from its FIRST cast; a CASE never gets to evaluate — the F2 escape class) —
>    and, where feasible, PREPARE the changed statements against the live/test DB.
> 8. MONEY and REGULATORY lanes ship a real-DB test leg: their pg-integration tests run with a
>    DATABASE_URL (local `pnpm db:up` or the test DB). `describe.skip`'d suites do NOT count
>    as coverage — the F2 escape lived in exactly such a skipped suite.
> 9. "Unify X across modules" lanes get the EXACT file list enumerated at planning time; any
>    file already owned by another lane either moves to that owner or the unification is
>    re-applied post-merge by Agent-A (the F2 E3↔E5/E6 collision class).
> 10. Mechanical/sweep lanes are complete when a TREE GREP proves the count (0 remaining /
>    N converted) — never on the agent's report (kira-mechanical over-claimed in F1 AND F2).

Owner mandate: the orchestrator session (**Agent-A**) runs on **Fable 5** and never implements —
its whole job is plan → split → fan-out → review arbitration → build-gate → migrations → push →
report. Implementation always goes to the engines/lanes below.

Scale target per wave (owner expansion 2026-07-02, from F3): **8–9 external engine lanes +
3 Claude lanes** (kira-ui, kira-easy, kira-mechanical), every code lane in git worktree isolation.
When the owner commissions an app-wide review, add up to **4 read-only Opus lanes** outside the
code path (domain claim-vs-reality audits on the main checkout + a live-browser CRUD walk) —
they never edit the tree, so they need no worktree and can run concurrently with writer lanes.

Communication model (how agents talk): hub-and-spoke through Agent-A ONLY — no lane ever talks
to another lane. Each lane receives a self-contained brief file (`/tmp/<wave>/prompts/<lane>.md`
+ SHARED-RULES.md), works in its isolated worktree, and returns (a) its working tree — the only
artifact that counts — and (b) a report with `git diff --stat` + raw test stdout. Agent-A extracts
per-lane patches, resolves collisions, and consolidates; reviewers get the patch + tree, never the
writer's chat. Agent-B (separate Claude session) coordinates exclusively through
`~/Projects/_agent_handoff/STATUS.md`. New-i18n-key needs are returned as lane-local key files
(never direct edits to `en.json`/`pl.json`) and merged by Agent-A at consolidation:

- **Engine lanes.** Composer 2.5 = default writer (`impl-easy`/`impl-standard`, multi-file bulk).
  Codex takes terminal/infra/CI work, SQL-heavy tasks needing live psql, and it is the WRITER on
  auth/RLS/money/regulatory/canonical-owner tiers (Composer never solo there). Escalation: 2 failed
  Composer attempts → same prompt to Codex.
- **Claude lanes.** `kira-ui` (prototype-parity UI + `impl-hard` per this doc) and **Agent-B** — a
  separate Claude session; coordination EXCLUSIVELY through `~/Projects/_agent_handoff/STATUS.md`
  (A writes "TODO for Agent-B", reads "DONE (B)"; the sessions never see each other's context).
- **Review capacity is the real throttle:** every Composer diff → Codex review; every Codex diff →
  Claude review; Agent-A arbitrates findings (writer never breaks the tie), owns the assembled-tree
  build gate, explicit staging (never `git add -A`), migrations, push, Vercel READY + live-browser
  E3 verification. No lane self-merges.
- **Lane hygiene:** no two lanes co-edit `apps/web/i18n/en.json` (partition keys or serialize);
  collision-check file scopes before launch; Codex briefs must not run `pnpm build` (build gate is
  Agent-A's); verify engine work by the TREE, not the summary.
