# Audit Playbook — how Phase 0 establishes ground truth

Used by `/kira:audit`. The goal is an honest, evidence-backed state for every
task, plus a hard look at the **app skeleton** (auth + shell + navigation +
real data wiring) which the previous pipeline never tracked as tasks.

## Per-task verdicts (use exactly these)

| Verdict | Meaning | Evidence required |
|---|---|---|
| ✅ IMPLEMENTED | Code exists, matches the task contract, tests pass | file path(s) + a passing test run |
| 🟡 STUB | File exists but incomplete / mocked / TODO / no real wiring | file path + what's missing |
| ⛔ MISSING | No code for a declared task | absence note (where it should be) |
| 👻 PHANTOM | Referenced (carry-forward / cross-dep) but no task file | the reference location |
| 🔴 BROKEN | Exists but failing tests / type errors / runtime error | the failing output |
| 🧩 EXTRA | Code exists with no owning task (e.g. manually-added shell/login) | file path + guess at intended task |

## Inspection checklist by `task_type`

**T1-schema** → in `packages/db/`:
- migration file named in `scope_files` exists; applies cleanly + idempotent (`pnpm db:migrate`).
- Drizzle schema + types present; RLS policy uses `app.current_org_id()`; `org_id` (not `tenant_id`); audit trigger if required; NUMERIC precision where money/qty.
- RLS isolation test exists and asserts a real `42501` (not vacuous).

**T2-api** → in `apps/web/app/**/_actions/*.ts`:
- Server Action exists; wrapped in `withOrgContext`; zod-validated input; RBAC gate server-side; outbox emit (3-seg event) where stateful; rate-limit on public-facing; error mapping (no raw stack). Unit test runs.

**T3-ui** → in `apps/web/app/**/page.tsx` + `_components/*`:
- page/component exists; cites the prototype anchor and the range is valid (`wc -l "<jsx>"`); shadcn (no raw `<select>`, no `@radix-ui` outside `packages/ui`); all five UI states; i18n keys in all four locales; **parity evidence captured** (screenshots/trace/axe) — if absent, it's 🟡 STUB at best regardless of how it looks.
- **Does it render real DB data or mock/hardcoded data?** Flag mocks explicitly.

**T4-test** → specs exist AND actually pass; assertions are non-vacuous.

**T5-seed / docs / T0** → artifact exists and is current.

## Special audit: the Walking Skeleton (do this first, per module-independent)

The human discovered that **login and the whole app shell (sidebar, topbar,
menu) were never tasks** — they were hand-added later, completeness unknown.
Audit these explicitly and report as their own section:

1. **Auth / login** — is there a real login page + session? Files under
   `apps/web/app/(auth)/**`, middleware, Supabase Auth wiring (foundation T-011),
   SAML/SCIM (T-012/T-013) if relevant. Does login actually authenticate against
   the DB and establish `org_id` context? Verdict + gaps.
2. **App shell** — layout with sidebar + topbar + main grid. Compare against the
   prototype `prototypes/design/Monopilot Design System/settings/shell.jsx` and
   `_meta/prototype-labels/prototype-index-foundation-shell.json` (entries:
   `foundation_app_shell_layout`, `foundation_app_sidebar`, `foundation_app_topbar`,
   `foundation_navigation_manifest`). What exists, how close to parity, what's missing?
3. **Navigation** — can you actually click between modules? Is there a nav manifest
   driving the sidebar, or hardcoded links? Are routes that the menu points to real
   pages or 404s?
4. **Data wiring** — do the reachable pages show **real data from Supabase**
   (Drizzle / Server Actions) or mocks/hardcoded fixtures? Sample 3–5 key pages
   and state which. (Production data plane is **Supabase**; the local docker
   Postgres from `pnpm db:up` is for tests only.)
5. **Deploy reality** — infra already exists: deploy on **Vercel**, DB + auth on
   **Supabase** (`@supabase/ssr`, env in `.env.example`, `.vercelignore` present).
   Does `pnpm build` succeed? Are the Supabase env vars wired for the deployed app?
   Note anything that would break the live app. You may use the Supabase MCP
   (`list_tables`, `get_advisors`, `get_logs`) to confirm the deployed schema/RLS
   actually matches what the tasks claim — read-only, don't mutate prod.

Output for the skeleton: a short readiness verdict — **can a user log in and
navigate a clickable product backed by the DB today, yes/no, and the precise gap
list to get there.** This feeds `/kira:skeleton` (Wave 0).

## REALITY.md template (one per module)

```markdown
# <NN-module> — Reality Audit (<date>)

## Counts
- task files: N | manifest task_count: M | STATUS rows: K  → reconciliation: <note>

## Task reality
| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | ... | T2-api | 🟡 STUB | apps/web/.../_actions/x.ts | no outbox emit; no test |

## Phantom / carry-forward backlog
- T-0NN — <referenced where> — <what it represents>

## Extra (code without a task)
- <path> — likely belongs to <task/area>

## Top integration risks
- ...

## Skeleton contribution (if any)
- auth / shell / nav / data findings relevant to the Walking Skeleton
```

## STATUS.md refresh rule

Reuse the foundation legend (✅/🔄/⏸/⬜). Correct false ✅s to the real verdict.
**Preserve existing rich notes** (they encode real history) — append, don't erase.
Map audit verdicts: IMPLEMENTED→✅, STUB/BROKEN→⏸ (with reason), MISSING→⬜,
PHANTOM→add a ⬜ row once Phase 1 creates the task.
