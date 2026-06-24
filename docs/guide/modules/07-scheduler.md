# Scheduler — changeover-aware production sequencing (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module is the
> **extended-planning** slice (`07-planning-ext` in the glossary; permission
> family `scheduler.*.*`) and lives in **one route group** under
> `/scheduler` — the **sequencing board** (`/scheduler`) plus the
> **changeover-matrix editor** (`/scheduler/changeover-matrix`). All write logic
> is one Server-Action file (`scheduler/_actions/scheduler-actions.ts`) calling a
> pure greedy solver (`sequence-solver.ts`); the pages are thin RSC shells.
>
> The scheduler **proposes**, the operator **applies**. A run never touches a
> work order on its own — it persists a draft `scheduler_runs` + N
> `scheduler_assignments` rows; only an explicit **Apply** writes the proposed
> sequence / line / planned-start back onto the open WOs. The WO execution
> lifecycle itself belongs to **08-production** — this module only schedules
> `DRAFT`/`RELEASED` WOs, never running ones.
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree after the 2026-06-24 browser audit fixes (mig 324
> perm seed + the `MATRIX_SELECT_CM` 42702 fix).

---

## a. Overview

The Scheduler turns the open work-order backlog into a **changeover-minimising
sequence**. A planner picks a **planning horizon** (1–30 days, default 7) and an
optional **line filter**, then **Runs** the scheduler. The backend loads every
open WO (`status in DRAFT/RELEASED`) whose planned/created start falls inside the
horizon, loads the **active changeover-matrix version**, and feeds both to a
**greedy nearest-neighbour solver** (`sequence-solver.ts`, optimizer
`e8-greedy-v1`). The solver seeds the sequence with the earliest-due WO, then
repeatedly appends the candidate with the **lowest changeover cost** from the
current tail (ties broken by due-date then id), time-phases each WO per line
(`planned_start = max(now, previous end on that line)`), and accumulates a
running changeover cost.

The result is persisted as a **completed `scheduler_runs` row** + one **`draft`
`scheduler_assignments` row per WO**, and an `outbox_events`
`scheduler.run.completed` is emitted. Nothing on the WO has changed yet — the
board renders the proposal grouped into per-line lanes with the total changeover
cost.

**Apply** (`applySchedule`) is the commit: for each assignment it CAS-writes
`scheduled_start_time` / `scheduled_end_time` / `production_line_id` +
`ext_jsonb.scheduler_run_id` onto the WO **only while it is still `DRAFT`/
`RELEASED`** (a WO that has since started is left untouched → reported as
**stale**), stamps the assignment `approved`, stamps the run
`output_summary.applied_at`/`applied_by`, and emits
`planning.schedule.published`. Apply is **idempotent** — a second apply on an
already-applied run is a no-op (`applied:false`).

The **changeover matrix** is the cost model the solver reads: one row per
`(allergen_from, allergen_to[, line])` carrying `changeover_minutes`,
`requires_cleaning` (wash), `requires_atp`, and a `risk_level`. Matrix rows hang
off a **versioned** parent (`changeover_matrix_versions`); the solver and the
upsert path both resolve the **single active version per org**
(`is_active = true`, the latest `version_number`).

The write/read actions all live in
`scheduler/_actions/scheduler-actions.ts`; the solver is the pure
`scheduler/_actions/sequence-solver.ts`; the read gate + display-label loader is
`scheduler/_lib/scheduler-labels.ts` (`loadSchedulerAccess`); the flatten-to-
lanes view-model is `scheduler/_components/scheduler-view-model.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission
> checked server-side **inside** the action via `hasPermission(ctx, …)` (a
> missing permission returns `{ ok:false, error:'forbidden' }`, never a 500).
> All actions run inside `withOrgContext` (RLS via `app.current_org_id()`).

### Run / propose / apply — `scheduler/_actions/scheduler-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `runScheduler({lineId?,horizonDays?})` | **Propose.** Validates input (`horizonDays` 1–30, `lineId` a UUID or null → else `invalid_input`). Loads open WOs in the horizon (`loadOpenWorkOrders`) + the **active**-version changeover matrix (`loadChangeoverMatrixForRun`), runs `sequenceWorkOrders`, then **persists a `completed` `scheduler_runs` row** (`run_type='schedule'`, `optimizer_version='e8-greedy-v1'`, `input_snapshot`/`output_summary` JSON, `solve_duration_ms`) + one **`draft` `scheduler_assignments`** per WO (`jsonb_to_recordset` bulk insert). Emits `scheduler.run.completed`. **Does NOT touch the WOs.** | reads `work_orders`, `items`, `item_allergen_profiles`, `changeover_matrix`, `changeover_matrix_versions`; writes `scheduler_runs`, `scheduler_assignments`, `outbox_events` | `scheduler.run.dispatch` | Re-run (each run is a fresh row); `applySchedule` to commit |
| `applySchedule(runId)` | **Apply / publish.** Validates `runId` is a UUID. Loads the run + its non-rejected/cancelled assignments. If already applied (`output_summary.applied_at` set) → idempotent no-op (`applied:false`). Else, per assignment: CAS-write `scheduled_start_time`/`_end_time`/`production_line_id`/`ext_jsonb` onto the WO **only if it is still `DRAFT`/`RELEASED`** (else → **stale**), then stamp the assignment `status='approved'` + `approved_by`/`approved_at`. Stamps the run `output_summary.applied_at`/`applied_by`/`applied_assignment_count`. Emits `planning.schedule.published` (`{applied, stale}`). | reads `scheduler_runs`, `scheduler_assignments`; writes `work_orders` (`scheduled_*`, `production_line_id`, `ext_jsonb`), `scheduler_assignments` (approve stamp), `scheduler_runs` (applied stamp), `outbox_events` | `scheduler.run.dispatch` (**no separate approver SoD — see gaps; `TODO` at `scheduler-actions.ts:609`**) | One-way (no "un-apply"); stale WOs are silently skipped, never overwritten |

### Changeover matrix — `scheduler/_actions/scheduler-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listChangeoverMatrix()` | List **all** matrix rows for the org (every version, ordered `line_id nulls first, allergen_from, allergen_to`) for the editor grid. | reads `changeover_matrix` | `scheduler.matrix.read` | — (read) |
| `upsertChangeoverMatrixEntry(entry)` | **Edit a cell.** If `entry.id` present → `updateMatrixById` (patch one row by id; `coalesce`/`case` so unset fields are preserved). Else → `upsertMatrixByPair`: resolve the **active version** (`loadActiveVersionId`) unless `version_id` supplied, validate `allergen_from`/`allergen_to`/`changeover_minutes≥0` (→ `invalid_input`), then **update-or-insert** by the natural key `(version_id, line_id, allergen_from, allergen_to)`. | reads `changeover_matrix_versions` (active version); writes `changeover_matrix` | `scheduler.matrix.edit` | Edit the same cell again (each upsert is in-place; no audit row) |

### Read / access — `scheduler/_lib/scheduler-labels.ts`

| Action | What it does | Reads | Gate |
|---|---|---|---|
| `loadSchedulerAccess()` | The board **read gate** + display-label maps: active production-line code/name by id, open-WO number by id (≤500). Failure renders the board's denied/error panel, never a 500. | `production_lines`, `work_orders` | `scheduler.run.read` |

### Pure solver — `scheduler/_actions/sequence-solver.ts` (no DB, no gate)

| Function | What it does | Reads / writes |
|---|---|---|
| `sequenceWorkOrders(wos, matrix)` | **The greedy sequencer.** Builds an allergen-**profile key** per WO (sorted, `\|`-joined `allergen_ids`), a `(from→to) → minutes` cost lookup from the matrix, seeds with the earliest-due WO, then nearest-neighbour appends the **min-changeover** candidate (tie → due-date then id). Then time-phases per line (`planned_start = max(now, prev end on that line)`, `planned_end = start + duration` from scheduled/planned dates) and accumulates `cumulative_changeover_cost`. Returns `SequencedAssignment[]`. Pure + deterministic — imported by `runScheduler` and unit-tested directly. | none (in-memory) |

**Action count inventoried: 6** — 2 run/apply (`runScheduler`, `applySchedule`),
2 matrix (`listChangeoverMatrix`, `upsertChangeoverMatrixEntry`), 1 read-gate
(`loadSchedulerAccess`), 1 pure solver (`sequenceWorkOrders`). The core is
`runScheduler` (propose) + `applySchedule` (commit) + the solver.

---

## c. State machine

### Scheduler run lifecycle (propose → apply)

```
              runScheduler (scheduler.run.dispatch)
                       │
   open WOs ───────────┼──────────► scheduler_runs  (status='completed')
   active matrix       │            scheduler_assignments × N (status='draft')
                       │            outbox: scheduler.run.completed
                       ▼
                  PROPOSAL on the board (nothing on the WO yet)
                       │
                applySchedule (scheduler.run.dispatch)
                       │
        per assignment, WO still DRAFT/RELEASED?
            ├─ yes ─► WO.scheduled_start/end + line written
            │         assignment → status='approved' (+approved_by/at)
            │         → APPLIED
            └─ no  ─► WO left untouched → STALE (assignment stays 'draft')
                       │
                       ▼
       run.output_summary.applied_at stamped (idempotent thereafter)
       outbox: planning.schedule.published {applied, stale}
```

| State | Where | Legal next | Who writes it | Notes |
|---|---|---|---|---|
| `scheduler_runs.status = 'completed'` | run row | applied (stamp) | `runScheduler` inserts it already `completed` (synchronous solve; the `queued`/`running`/`failed`/`cancelled` enum states exist in the schema but no async worker drives them — see gaps) | `output_summary` carries `assignment_count` + `total_changeover_cost`; an applied run additionally carries `applied_at`/`applied_by`/`applied_assignment_count`. |
| assignment `draft` | `scheduler_assignments.status` | `approved` (on apply) | `runScheduler` (bulk insert) | All assignments are born `draft`. |
| assignment `approved` | same | — | `applySchedule` (per WO that applied) | Stamped only after the WO write succeeds. |
| assignment **stale** (stays `draft`) | same | re-run | — | Not a DB status — a runtime bucket for WOs that left `DRAFT`/`RELEASED` between propose and apply; the WO is never overwritten. |
| "applied" run | `output_summary.applied_at` is set | — (terminal) | `applySchedule` (`markRunApplied`) | A second apply is an idempotent no-op. The run `status` stays `'completed'` — **applied-ness is the `applied_at` stamp, not the status** (`scheduler-view-model.ts:80-94`). |

DB also allows assignment statuses `'rejected'` / `'overridden'`
(`scheduler_assignments_status_check`, mig 204:138-140); `loadAssignments`
filters out `rejected`/`cancelled`, but no action currently sets them (override /
reject are enum-only — see gaps).

### Changeover-matrix versioning

```
changeover_matrix_versions
   version_number 1,2,3…  (UNIQUE per org)
   status: draft → pending_review → active → archived
   is_active boolean  ── partial UNIQUE: ONE is_active=true row per org
                          (idx_changeover_active_per_org, mig 204:204-205)
        │
        └──< changeover_matrix rows  (FK version_id)
             one per (version_id, line_id, allergen_from, allergen_to)  [UNIQUE]
             line_id NULL = org-wide default; non-null = per-line override
```

| Concept | Where | Notes |
|---|---|---|
| **Active version** | `changeover_matrix_versions.is_active = true` | The solver (`loadChangeoverMatrixForRun`) and `upsertMatrixByPair` (`loadActiveVersionId`) both bind to the **latest active version** (`order by version_number desc limit 1`). A DB partial-unique index enforces **at most one active version per org**. |
| **Version status** | `status in (draft, pending_review, active, archived)` | Declared + checked in the schema, but **no action transitions it** — there is no create-version / publish-version / archive-version Server Action in this module (see gaps). The matrix UI edits cells of whatever is active. |
| **Per-line override** | `changeover_matrix.line_id` | `NULL` = org default; a non-null `line_id` overrides for that line. The solver's run query takes `line_id IS NULL OR line_id = $lineId`; the **cost lookup is keyed only on `(from,to)`**, so a per-line override row can clobber the org default for that key (last-write-wins in the `Map`) — documented limitation. |

The state machine is enforced **server-side**: `runScheduler`/`applySchedule`/
the matrix upsert each re-check their permission and re-validate input; the page
read gate (`loadSchedulerAccess` → `scheduler.run.read`) decides whether the
board renders at all.

<!-- screenshot: scheduler board (run control + proposed per-line sequence + total changeover cost) -->
<!-- screenshot: scheduler/changeover-matrix grid (N×N FROM\TO heatmap + cell editor modal) -->

---

## d. User how-tos

> Button labels below are the literal English copy from the `Scheduler.*` i18n
> bundle (`apps/web/i18n/en.json`); the `data-testid`s in parentheses are the
> stable anchors in the component code (`scheduler-board-view.tsx` /
> `changeover-matrix-editor.tsx`).

### (i) Run / propose a schedule

1. Go to **Scheduler** (`/scheduler`). The page (`scheduler-page`) loads behind
   the read gate `scheduler.run.read` — without it you see **"You do not have
   permission to view the scheduler."** (`scheduler-denied`).
2. In the **Run scheduler** control (`scheduler-run-control`) set the **Planning
   horizon** (`scheduler-horizon`, 1–30 days, default 7).
3. Click **"Run scheduler"** (`scheduler-run-button`). On submit → `runScheduler`
   loads the open WOs in the horizon + the active changeover matrix, solves the
   sequence, and persists a `completed` run + `draft` assignments.
4. The **Proposed sequence** (`scheduler-proposal`) renders one lane per
   production line (`scheduler-lane-<code>`), each WO ordered with its planned
   start, allergen **Profile**, and a **Changeover** badge
   (`scheduler-changeover-badge`) where a wash/clean-down cost applies. The
   header shows **"Total changeover cost: …"** (`scheduler-total-cost`).
5. If the run produced no assignments (no open WOs in the horizon) you see
   **"The run produced no assignments…"** (`scheduler-no-assignments`); before
   the first run the board shows the idle empty state (`scheduler-empty`).

### (ii) Review + apply a schedule

1. On a fresh proposal, click **"Apply schedule"** (`scheduler-apply-button`).
2. A confirm dialog appears — **"Apply this schedule?"** with the body *"This
   writes the proposed sequence, line and planned start onto the work orders. It
   changes production planning and cannot be undone automatically."* Click
   **"Apply schedule"** (`scheduler-apply-confirm`) to commit, or **Cancel**.
3. On submit → `applySchedule`: each WO that is **still `DRAFT`/`RELEASED`** gets
   its scheduled start/end + line written; a WO that has since started is
   **skipped (stale)** and never overwritten. The run is stamped applied and an
   **"Applied"** badge (`scheduler-applied-badge`) appears.
4. Apply is **idempotent** — clicking it again on an already-applied run is a
   no-op. There is no "un-apply": to re-plan, **Run** again to generate a new
   proposal.

### (iii) Edit the changeover matrix

1. From the scheduler board click **"Changeover matrix"**
   (`scheduler-matrix-link`) → `/scheduler/changeover-matrix`
   (`changeover-matrix-page`). The page loads behind `scheduler.matrix.read`
   (denied → **"You do not have permission to view the changeover matrix."**).
2. The editor renders an **N×N FROM\TO grid** (`changeover-matrix`) of allergen
   profiles, heat-coloured by cost (0 = none / 1–15 low / 16–45 medium / >45
   high) with a **wash** legend. The diagonal (same profile → no changeover) is a
   greyed **"—"** no-op cell.
3. Click any off-diagonal cell (`matrix-cell-<from>-<to>`) to open the **{from} →
   {to}** editor modal. Set **"Changeover cost (minutes)"** (`matrix-cost-input`,
   ≥0) and toggle **"Wash required"** (`matrix-wash-toggle`).
4. Click **"Save"** (`matrix-cell-save`) → `upsertChangeoverMatrixEntry`. With no
   `id` this **upserts by `(active version, line, from, to)`**: it updates the
   existing row or inserts a new one against the **active matrix version**. The
   grid refreshes.
5. If no allergen profiles exist yet, the grid shows **"No changeover profiles
   yet"** (`matrix-empty`) — *"Changeover profiles appear here once allergen
   profiles are defined for your items."* (the axes derive from item allergen
   profiles, so define those first in Technical).

### (iv) Version the changeover matrix

There is **no in-app version create / publish / archive control in this module**
(see *Known gaps*). The data model is fully versioned —
`changeover_matrix_versions` (status `draft → pending_review → active →
archived`, one `is_active=true` per org) parents the `changeover_matrix` rows —
and `scheduler.matrix.publish` exists in the RBAC enum, but no Server Action
transitions a version. In practice today:

- Edits land on the **currently active version** (resolved by
  `loadActiveVersionId`); the editor never asks which version.
- Creating a new version, marking it active, or archiving the old one is a
  **direct-DB / migration / future-action operation**, not a UI flow yet. When
  that action is added it must check `scheduler.matrix.publish` and flip
  `is_active` (the partial-unique index guarantees only one active version at a
  time).

---

## e. Data sources (Supabase tables)

Scheduler run / proposal (read/write — `07-planning-ext` owned):

- `scheduler_runs` — one row per run (`status`, `horizon_days`, `line_ids`,
  `optimizer_version`, `run_type`, `input_snapshot`/`output_summary` JSON,
  `solve_duration_ms`, `applied_at` lives inside `output_summary`). mig 204.
- `scheduler_assignments` — one row per WO per run (`sequence_index`,
  `planned_start_at`/`_end_at`, `changeover_minutes`, `optimizer_score`,
  `status` draft→approved, `approved_by`/`approved_at`, `override_*`, `ext`).
  Status check allows `draft/approved/rejected/overridden`; time-order check
  `planned_start_at ≤ planned_end_at`. mig 204.
- `scheduler_config` — per-org/line solver config (horizon, strategy,
  changeover/duedate/utilization weights, capacity h/day). mig 204. **Defined but
  not yet read by `runScheduler`** (see gaps).

Changeover matrix (read/write):

- `changeover_matrix_versions` — versioned parent (`version_number` UNIQUE per
  org, `status`, `is_active` with a partial-unique "one active per org" index,
  `published_by`/`published_at`). mig 204.
- `changeover_matrix` — `(version_id, line_id, allergen_from, allergen_to)`
  rows: `changeover_minutes`, `requires_cleaning`, `requires_atp`, `risk_level`,
  `notes`. UNIQUE on that natural key. mig 204.

Inputs the solver/board read (owned elsewhere):

- `work_orders` — open WOs (`DRAFT`/`RELEASED`) in the horizon; apply writes back
  `scheduled_start_time`/`scheduled_end_time`/`production_line_id`/`ext_jsonb`
  (08-production / 04-planning-basic owned).
- `item_allergen_profiles` — per-item allergen codes → the WO's allergen profile
  key the solver sequences on (03-technical owned).
- `items` — item code/name resolution (read).
- `production_lines` — line code/name maps + line-filter resolution (read).

Governance:

- `outbox_events` — `scheduler.run.completed` (on propose),
  `planning.schedule.published` (on apply). No live dispatcher consumes them yet
  (see gaps).
- `role_permissions` / `roles` — the `scheduler.*` grants seeded by migs 260 +
  324 (see gaps).

---

## f. Known gaps / TODO

Grounded in the code that was read — these feed the fix backlog:

1. **(FIXED, was a render-then-403) Three enforced perms were seed-only.** The
   2026-06-24 browser audit found `runScheduler`/`applySchedule` enforce
   **`scheduler.run.dispatch`** and the matrix actions enforce
   **`scheduler.matrix.read`/`.edit`**, but mig **260** only ever seeded
   **`scheduler.run.read`** — so the **Run** button and the **changeover matrix**
   were permanently dead for every role incl. org admin, while the button still
   **rendered enabled and then 403'd** (the "shown but 403" anti-pattern; audit
   `2026-06-24-per-page-logic-audit.md` / `…-browser-audit-findings.md`). Fixed by
   **mig 324** (`324-scheduler-dispatch-matrix-perms-seed.sql`) which seeds the
   three strings to the admin role family. **Residual L2:** the page still renders
   the Run button / matrix link **without** pre-checking `scheduler.run.dispatch`
   / `scheduler.matrix.read` — it relies on the server reject, so a user lacking
   those (any non-admin role today) still sees an enabled control that fails. The
   read gate is `scheduler.run.read`, which is **not** the perm the run enforces,
   so a user can see the board but not run it.

2. **No SoD between propose and apply.** `applySchedule` gates on the **same**
   `scheduler.run.dispatch` as `runScheduler`, with an explicit
   `// TODO: enforce separate approver-role SoD once scheduler roles are split.`
   (`scheduler-actions.ts:609`). The dedicated `scheduler.assignment.approve` /
   `scheduler.assignment.bulk_approve` / `scheduler.assignment.reject` /
   `scheduler.assignment.override` permissions **exist in the enum but no action
   reads them** — there is no per-assignment approve/reject/override flow; apply
   is all-or-nothing under one permission.

3. **Changeover-matrix versioning is data-model-only.** The schema is fully
   versioned (`changeover_matrix_versions` with `draft/pending_review/active/
   archived` + one-active-per-org), and **`scheduler.matrix.publish`** is in the
   enum, but **no Server Action creates, publishes, or archives a version** —
   edits always land on the active version (`loadActiveVersionId`). The matrix
   editor component header itself documents the deviation: *no per-line override
   tab / version history / review queue* (`changeover-matrix-editor.tsx:6-13`).
   Versioning is a migration/direct-DB operation until a publish action is wired.

4. **`scheduler_config` is written by no action and read by no action.** The
   per-line solver config (horizon default, `sequencing_strategy`,
   `changeover_weight`/`duedate_weight`/`utilization_weight`, capacity h/day,
   `respect_pm_windows`, `allow_alternate_routings`) exists as a table + a typed
   `SchedulerConfigRow`, but `runScheduler` hard-codes a 7-day default, the
   `e8-greedy-v1` strategy, and ignores every weight. The solver is a **pure
   greedy nearest-neighbour on changeover minutes only** — no capacity, no
   due-date weighting beyond tie-break, no PM windows, no alternate routings.

5. **Per-line changeover overrides collapse in the org-wide run.** The solver's
   cost lookup is keyed only on `(allergen_from → allergen_to)`
   (`sequence-solver.ts:28-34`), so when the run query returns both the org
   default (`line_id NULL`) and a per-line override row for the same allergen
   pair, the **last one wins in the `Map`** — the per-line override can clobber
   the default (or vice-versa) regardless of which line a WO is on. Documented in
   the per-page audit ("org-wide run collapses per-line changeover overrides").

6. **Assignment-status enum drift.** `SchedulerAssignmentStatus`
   (`scheduler-types.ts:6`) and the `loadAssignments`/`approveSchedulerAssignment`
   queries reference **`'cancelled'`**, but the DB `scheduler_assignments_status_check`
   (mig 204:138-140) allows only `draft/approved/rejected/overridden` — writing
   `'cancelled'` would violate the check. It is only ever **read-filtered** today
   (never written), so it's latent, but the type and DB disagree.

7. **`runScheduler` inserts the run already `completed`; the async run states are
   unused.** `scheduler_runs.status` supports `queued/running/completed/failed/
   cancelled` and there's a `requested_by`/`queued_at`/`started_at` shape for a
   queue, but the solve is **synchronous inside the Server Action** — the run is
   inserted with `status='completed'`, `started_at`/`completed_at = now()`. There
   is no worker, no `dry_run`/`what_if` run-type path (both enum values are
   unused), and `include_forecast` / the `scheduler.forecast.*` perms are
   inert. A failed solve returns `persistence_failed` rather than writing a
   `failed` run row.

8. **`site_id` is NULL on scheduler outputs.** Runs and assignments carry a
   nullable `site_id` and the inserts don't populate it from a site context (mig
   204 notes per-site scoping "lands later"); 14-multi-site attribution is not
   wired here.

9. **Outbox events are emitted but not consumed.** `scheduler.run.completed` and
   `planning.schedule.published` land in `outbox_events`, but per
   `MON-project-overview` there is no live `apps/worker` dispatcher — downstream
   (planning publish / reporting) is a seam, not yet delivered.

10. **The matrix upsert writes no audit row.** `upsertChangeoverMatrixEntry`
    mutates `changeover_matrix` in place with no `audit_events` entry (unlike the
    08-production changeover/correction paths) — a changeover-cost change to a
    food-safety-relevant matrix is untracked. Consider an audit write.

No raw `// TODO` markers were found in the scheduler code beyond the SoD one at
`scheduler-actions.ts:609`; the gaps list is otherwise derived from
enum-vs-migration / type-vs-DB drift and capability limits observed in the code,
cross-checked against the 2026-06-24 browser audit.
