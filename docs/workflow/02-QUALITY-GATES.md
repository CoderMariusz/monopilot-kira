# Quality Gates — the four holes the old pipeline left open

Each gate maps directly to a documented failure mode of the retired ACP. A task
is **not** mergeable until all gates that apply to it are green.

## Gate 1 — Real test execution (fixes: "GREEN was self-declared, never run")

The old pipeline stored test *command strings* but never enforced their
execution. Here, the orchestrator (or the closing agent) **runs** the commands
and captures real stdout/exit codes into the closeout. No captured run = FAIL.

Canonical commands (from root `package.json`):

```bash
# DB / schema (T1, T5):  needs a local Postgres — `pnpm db:up` first
pnpm db:test            # or db:test:local with the inline DATABASE_URL
pnpm db:migrate         # migrations apply cleanly + idempotent

# Web unit / RTL (T2, T3, T4):
pnpm --filter web vitest run <path>

# E2E (T3, T4):
pnpm --filter web exec playwright test <spec> --trace on

# Repo-wide guards (every task before merge):
pnpm lint               # includes scripts/lint-no-hardcoded-strings.mjs + -r lint
pnpm typecheck
pnpm test:smoke
```

Closeout must include, verbatim: changed files, the exact commands run, their
real output (pass/fail counts), and `git status`.

## Gate 2 — UI / prototype parity (fixes: "UI shipped without matching the design")

Applies to every `T3-ui` and UI-flow `T4`. Enforce `MON-t3-ui` +
`_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`:

1. The task cites a **literal** anchor `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>` and the range is verified with `wc -l "<path>"` (note the spaces in the path — always quote).
2. The matching entry exists in `_meta/prototype-labels/prototype-index-<module>.json` (and `master-index.json`).
3. All **five UI states** present: loading, empty, error, permission-denied, optimistic.
4. **Evidence captured at closeout:** per-state screenshots, Playwright trace, axe report (0 violations or justified), parity diff vs the anchor, deviation log.
5. Red-lines: no verbatim JSX paste, no raw `<select>`, no `@radix-ui/*` outside `packages/ui`, no client-trusted RBAC.

A UI task with no parity evidence does not merge — this is the single biggest
cause of the "podziurawiony" design and is now a hard stop.

## Gate 3 — Cross-module dependency block (fixes: "tasks ran before upstream was ready")

Before a task starts, the orchestrator verifies that **every** entry in
`pipeline_inputs.dependencies` and `pipeline_inputs.cross_module_dependencies`
is `✅ DONE` in the owning module's `STATUS.md`.

- `task_id: "CONTRACT"` → the named module's contract artifact must exist and be approved (e.g. `_foundation/contracts/*.md`).
- `task_id: "T-NNN"` → that specific task is ✅ DONE.
- Unsatisfied dep → the task stays ⬜ PENDING and is **not** dispatched; the orchestrator schedules the blocker first. This is enforced by wave construction in `/kira:plan`.

## Gate 4 — Risk-based cross-provider review (fixes: "model graded its own homework")

Classify each task's risk; route review accordingly (see `/kira:review`).

**High-risk** (always cross-provider, often adversarial):
- Schema / RLS / migrations / security (auth, RBAC, e-sign, PINs)
- Money (finance, costing, variance) and NUMERIC precision
- Regulatory: D365 export (R15), BRCGS retention, CFR-21 Part 11, GS1 SSCC-18, GDPR
- All UI parity tasks
- Anything that changes a canonical owner (`wo_outputs`, `oee_snapshots`, event enums, permission enums)

**Low-risk** (single cheaper-model self-check):
- Isolated seeds/fixtures, docs, mechanical refactors with green tests, additive non-security helpers.

**Review loop (high-risk):**
1. Writer produces code + passing real tests (Gate 1).
2. The *other* provider reviews: Claude-written → `/codex:review --base <integration> --background`; Codex-written → Opus review.
3. If material findings → writer addresses → reviewer re-checks. For the highest-risk/contentious tasks use `/codex:adversarial-review` (independent → cross → meta → synthesis).
4. Disagreement after 2 rounds → escalate to human with both positions. The writer never breaks the tie.

Only after the applicable gates are green does the worktree merge into the
integration branch and `STATUS.md` flip to ✅.
