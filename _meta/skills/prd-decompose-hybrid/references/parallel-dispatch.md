# Parallel dispatch, enum locks, and Foundation/Admin split

When a plan admits parallel execution (multiple agents concurrently), the backlog must meet two preconditions. These ideas come from Phase E-0/E-1/E-2 practice — apply the pattern in any project that scales past a few parallel workers.

## 1. Lock architect-owned enum contracts FIRST

These files are shared contracts across many downstream tasks. If they drift after parallel work starts, every merge becomes painful and semantic bugs sneak in (typos in event names, drifted permission strings).

Typical lock files (rename per project):

- `permissions.enum.ts` — central RBAC definitions (e.g., `fa.create`, `fa.edit`, `org.admin`)
- `events.enum.ts` — central outbox event names (e.g., `fa.created`, `brief.converted`, `lp.received`)
- `ref-tables.enum.ts` — central reference table names
- `migrations/001-baseline.sql` — baseline schema the rest builds on

**Rule:** do NOT dispatch parallel atomic work until these files are merged and stable. Mark them as **hard blockers** in the dependency graph. In task metadata, downstream tasks list the enum-lock task ID in `Upstream` and cannot start before it is `done`.

If the PRD does not enumerate these contracts explicitly, raise a pre-implementation task to draft them. An architect/lead approves the diff once; then downstream splits to parallel tracks.

## 2. File-disjointness check

Two tasks are safe to run in parallel only if:

- They CREATE different files, OR
- They MODIFY different files (no overlap in the Files: Modify list)

If both modify the same file → sequentialize (merge conflict risk). The coverage audit should make overlaps visible by listing `Files: Modify` columns when borderline.

## Parallel tracks pattern

For Foundation/Settings/NPD-style phases, group atomic tasks into named tracks that share zero file overlap:

- **Track α** — data-layer (T1 schema, T5 seed)
- **Track β** — server-layer (T2 API, middleware, RLS wrappers)
- **Track γ** — client-layer (T3 UI)
- **Track δ** — integration/test (T4 wiring, E2E)

Record track membership in task metadata (`Track: α`) so dispatchers can select by track. Within a track, order by explicit dependencies.

## Foundation vs Admin UI split

Runtime primitives (Foundation) and admin UI (Settings, dashboards) have different owners, dependencies, and failure modes. Keep them in distinct phases or sub-modules so:

- Foundation can reach DoD without UI being ready (unit + integration tests on runtime primitives)
- First-usable flow (e.g., a "Settings-a carveout") isn't blocked by the full Settings build-out

**Heuristic:** if a task's only consumer is another developer's runtime code → Foundation. If its primary consumer is an end-user via a screen → Admin UI.

**Minimum carveout thinking:** before building the full admin UI, identify the minimum set of Settings screens required to enable the first real user flow (e.g., for an ERP: just the Orgs + Roles + Modules screens, not the full schema wizard). Ship the carveout as Phase E-1; defer the rest to Phase E-2 parallel with the first product feature.

## Hard vs soft blocker matrix

When planning, tag each blocker as:

- **Hard blocker** — downstream task CANNOT start until this is done (FK constraints, missing enum, missing migration)
- **Soft blocker** — downstream task CAN start with a mock/stub; real dep can slot in later (external integration stub, optional observability panel)

Hard blockers belong in the task store `dependencies[]`. Soft blockers belong in the task `Notes` field so they are visible but do not gate the graph. This prevents cascade-blocking the backlog on non-critical deps.

## Integration milestones ("Jane dogfood" style)

For a large phase, define a concrete integration target in user language rather than only architecture terms. E.g., "Jane can log into a fresh tenant, create one FA, see it in the list, edit it, soft-delete it, and the audit log shows 3 entries." Use this target to pick the minimum set of Foundation + Settings tasks that must be `done` for the milestone. Everything else can slip without blocking product validation.

## Dispatch checklist (before kicking off parallel work)

- [ ] Enum lock files merged and stable
- [ ] Baseline schema migration merged
- [ ] Each task has `Track`, `Upstream`, `Parallel` metadata set
- [ ] File-disjointness verified for tasks marked `Parallel`
- [ ] Hard blockers recorded in task store `dependencies[]`
- [ ] Integration milestone (dogfood target) written down so agents know what "usable" means
