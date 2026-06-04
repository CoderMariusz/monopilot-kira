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

## Gate 5 — Live-deploy verification before sign-off (fixes: "green locally, broken on Vercel+Supabase")

**MANDATORY before presenting ANY module for human sign-off.** Local unit/RTL/DB-against-local-Postgres green is NOT acceptance — local ≠ live. (On 02-settings, every local test passed while the live preview was broken: migrations 051-070 never reached Supabase because a duplicate migration prefix broke the runner and `apps/web/vercel.json` swallowed the failure with `|| echo`.)

Run, in order:
1. **Build is real:** push the branch; confirm the Vercel build is `READY` and the migrate step is **fail-loud** (`apps/web/vercel.json` runs `pnpm --filter @monopilot/db migrate` WITHOUT `|| echo` swallowing). A red build = stop.
2. **DB parity:** Supabase `select max(filename) from public.schema_migrations where filename is not null` (MCP, project `khjvkhzwfzuwzrusgobp`) MUST equal the highest migration in `packages/db/migrations`; confirm each new table via `to_regclass`. Any drift = the deploy is running on a stale schema.
3. **Authenticated browser click-through (Playwright):** log in to the deployed PREVIEW (`/en/login`, test user `admin@monopilot.test`) and visit EVERY route of the module. Classify each OK / EMPTY / ERROR. For every ERROR capture the exact server error from Vercel `get_runtime_logs` (+ Supabase `get_logs`) — never hand-wave a failure.
4. **Real data on the live screen:** each screen shows the same real Supabase data the loaders read locally (not error/empty/placeholder).

Only when the live click-through is clean (or each remaining failure is a recorded external gap) write `_meta/runs/<module>-SIGNOFF.md` and STOP for human review. Note: Vercel **production = `main`**; module work deploys as a PREVIEW (branch alias) — verify on the preview, merge to main only after human acceptance.

## Recurring live-bug checklist (classes that pass vitest+tsc but break live — only Gate-5 finds them)

Every one of these shipped a GREEN local run while the deployed preview was broken. Treat this as a pre-deploy checklist for **every module** — verify each before claiming a module ready. (Sources: 01-npd run, 02-settings re-open, cross-module audit.)

1. **RBAC unseeded / mis-targeted — the #1 recurring live bug.** Adding a permission ENUM string ≠ granting it to anyone, so the live app returns **403 everywhere**. Every module MUST ship a wave-1 P0 seed task `NNN-<module>-permission-seed.sql` (mirror migrations `116`/`146`/`148`/`150`) that GRANTs its perms to the **org-admin role family** AND operator roles, in BOTH `role_permissions` AND the legacy `roles.permissions` jsonb, with an **org-insert trigger + a backfill** for existing orgs. Two traps: (a) the deployed admin is on role **`org.access.admin`**, NOT `admin` — grant to the whole family `org.access.admin` / `org.platform.admin` / `owner` / `admin` / `org_admin`; (b) **vocabulary divergence** — the permission strings the pages CHECK must be byte-for-byte the strings the seed GRANTs (string mismatch = silent 403, caused 403-everywhere in both npd and settings). See `MON-multi-tenant-site` §"Granting permissions (the seed half)".
2. **`'use server'` files may only export async functions.** Exporting an error CLASS, type-only-erased const, or plain object from a `'use server'` module breaks `next build` (tsc/vitest do NOT catch it). Put shared error classes/consts in a non-`'use server'` sibling module and import them. See `MON-t2-api` §"'use server' export rule".
3. **Route collisions break `next build`.** Two `page.tsx` resolving to the same URL path fail the build — and **route groups `(group)` do NOT add a path segment**, so `(admin)/settings/page.tsx` and `[locale]/(app)/(admin)/settings/page.tsx` collide. Always run `pnpm --filter web exec next build` locally before deploy; vitest never exercises the route tree.
4. **Migration numbering / never-edit-applied.** A task hardcoding `0NN_` or a 4-digit name sorts wrong and **silently never runs** (runner regex is `^(\d{3})-[a-z0-9-]+\.sql$`). Renumber every new migration to ≥ current HEAD (`git ls-files packages/db/migrations | sort | tail`). **Never EDIT an already-applied migration** — it is checksum-tracked; add a new forward migration instead. (This + a fail-silent build is exactly how 02-settings shipped a stale schema to live.)
5. **Outbox event vocabulary is ENUM-AUTHORITATIVE.** `packages/outbox/src/events.enum.ts` is the SoT; the DB CHECK is generated from it and `check-drift.test.ts` is the gate. Any emitted `event_type` MUST be in the enum + CHECK or the worker poison-pills / the action's outbox INSERT fails the CHECK and the whole action `persistence_failed`s. The cron/worker must process per-row with try/catch + dead-letter so one bad row can't stall the queue. See `MON-foundation-primitives` §outbox.
6. **i18n completeness — 4-locale key parity.** Every `t('key')` referenced MUST exist in ALL FOUR `apps/web/i18n/{en,pl,ro,uk}.json` or the raw key string renders and buttons/labels break live. Never ship a key without a value in all four files. See `MON-t3-ui` §i18n.
7. **PWA / serwist + Turbopack.** If the service worker isn't emitted, `/sw.js` returns 404 `text/html` and SW registration throws `SecurityError` on **every** page load. Guard the SW registration (feature-detect + only register when `/sw.js` is a real script) and confirm `sw.js` is emitted by the build.
8. **Canonical-owner delegation.** A consumer module must never write/ALTER a producer's table (`wo_outputs`→08, `oee_snapshots`→08, `schedule_outputs`→planning). Delegate via the producer's Server Action or read-only query — cross-owner writes pass local tests but corrupt ownership invariants live.
9. **Schema-driven dropdown = TWO gaps, check BOTH (heavy-UI).** A reference-fed `<Select>` rendering empty is almost never one bug — verify both halves: **(a) loader wiring** — the page actually queries `Reference.<source>` and passes the result (not `dropdowns={{}}`); canonical loader is `readDropdowns(ctx, columns)` in `apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx:243` (collects each `dropdownSource` → `select <col> from "Reference"."<table>" where org_id = app.current_org_id()`). **(b) the lookup table is seeded for the org** — the org-insert seed trigger (mig 032 only copies Departments + ManufacturingOperations) must also seed the new source, AND a backfill must seed existing orgs. Pattern fix landed as `packages/db/migrations/156-reference-lookups-seed.sql` (SECURITY DEFINER seed fn + AFTER-INSERT org trigger + backfill for PackSizes/Templates/Lines/Equipment/CloseConfirm). ANY `dropdown_source`/reference-fed Select task's DoD = "both wiring AND seed verified, dropdown shows real options on the live screen."
10. **Orphaned schema with no CRUD = invisible feature.** A migration can land a table (e.g. `items`, `packages/db/migrations/153-items-master.sql`) with NO Server Action and NO UI, so the feature is unreachable live yet every test is green. **Definition-of-done for any T1-schema task MUST name its consuming CRUD/UI task** (the T2/T3 that makes the table reachable); a schema task is not "done" for the user until that consumer ships.
11. **Systemic shared-component bug — fix the primitive, not each page.** When a UI defect shows up in "every X" (e.g. `packages/ui/src/Select.tsx` renders `SelectContent` / `role="option"` rows regardless of open state), the fix belongs in the shared primitive + a primitive-level RTL test in `packages/ui` (assert closed-state hides the options), NOT a per-page patch. Per-page workarounds leave the next page broken and still pass review.
12. **Free-text where a real FK/picker is required (heavy-UI).** A field that must reference a master record (components/ingredients → `items`) must be an **item picker bound to an FK**, never free text. Free-text codes pass local tests but break traceability/joins live. Pattern fix: `packages/db/migrations/157-prod-detail-item-fk.sql` adds `item_id uuid → public.items(id)` on `prod_detail` + `formulation_ingredients`. Any "code/component/ingredient/material" input on a heavy-UI screen = require the picker + FK in the task AC.

Note on outbox vocabulary for the next modules (extends class 5): the SoT enum `packages/outbox/src/events.enum.ts` currently has **no `item.*` events** (only `bom.*`, `fg.bom.released`, `technical.factory_spec.approved`). Any new `item.created`/`item.updated`/etc. emitter MUST extend the enum + regenerate the DB CHECK and pass `check-drift.test.ts` first. Likewise after every migration, regenerate `packages/db/__expected__/schema.sql` (correctly regenerated @167 on the 03-technical Wave-A merge — keep that discipline).

Gate-5 (live click-through as the org-admin test user) is the only gate that reliably catches classes 1, 3, 7, 9, 11, 12 and the stale-schema half of 4. Do not substitute a local green for it.
