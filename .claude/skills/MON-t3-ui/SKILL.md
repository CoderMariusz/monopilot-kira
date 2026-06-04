---
name: MON-t3-ui
description: Use when implementing T3-ui tasks (Next.js App Router pages + shadcn/ui + prototype parity). Covers literal prototype anchor format, ui_evidence_policy, i18n (next-intl), required ui states, a11y. Mandatory before touching apps/web/app/.../page.tsx.
version: 1.0.0
model: opus
canonical_spec: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md
---

# MON T3-UI Implementation Skill (Opus)

**Purpose:** playbook for translating a Monopilot Design System JSX prototype into a production Next.js App Router page (RSC + Client islands), composed of shadcn/ui primitives, internationalized via next-intl, with mandatory UI-state coverage and Playwright + axe evidence at closeout. **Mandatory reading before touching any `apps/web/app/.../page.tsx`** under a T3-ui task.

**Why Opus only:** literal-anchor parity translation is architectural — every JSX region must map to a shadcn composition with RBAC gates, Server Action callers, i18n keys, and 4 UI states wired in one pass. Haiku/Sonnet drop states or invent components.

## When to use

- Task `task_type` is `T3-ui` (or any UI-flow `T4-wiring-test` that renders a screen)
- Task has `prototype_match: true` AND `prototype_index_entry: "<label>"` AND `ui_evidence_policy` set
- Goal is producing a route under `apps/web/app/**/page.tsx` (or `_components/*.tsx`)
- A literal JSX anchor exists at `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>`

## Do NOT use when

- Backend / Server Action implementation — that is **T2-api** → use [[MON-t2-api]]
- Schema / migration changes — that is **T1-schema** → use [[prd-decompose-hybrid]] T1 template, do not modify `packages/db/` from a T3 task
- Labeling/indexing prototypes — that is the sister Haiku skill [[prototype-labeling]] (read-only on prototypes)
- New PRD section decomposition into tasks — use [[prd-decompose-hybrid]]

## Required reading (load in this order)

1. `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` — the parity contract (structural/visual/interaction + screenshots + Playwright + axe + deviation log)
2. The task JSON (`_meta/atomic-tasks/<NN-module>/tasks/T-NNN.json`) — read in full; cite `pipeline_inputs.prototype_index_entry`
3. `_meta/prototype-labels/prototype-index-<module>.json` — find the labelled entry; this gives you the JSX line range + translation_notes + shadcn_equivalent + known_bugs
4. `_meta/prototype-labels/translation-notes-<module>.md` — read the matching component subsection for the concrete prototype→production checklist
5. The JSX file itself (`prototypes/design/Monopilot Design System/<module>/<file>.jsx`) — read **only** the cited line range; verify the range exists with `wc -l` first
6. `apps/web/i18n/{en,pl,ro,uk}.json` — confirm namespace exists (or be ready to add one); reuse keys before inventing new ones

## Canonical file locations

| Artefact | Path |
|---|---|
| Server Component page | `apps/web/app/<module-route>/<feature>/page.tsx` or `apps/web/app/[locale]/<module-route>/<feature>/page.tsx` |
| Route group (auth / settings / admin shells) | `apps/web/app/(<group>)/<feature>/page.tsx` |
| Local-only Client island | `apps/web/app/<module-route>/_components/<Name>.tsx` |
| Reusable cross-module Client component | `packages/ui/src/<Name>.tsx` (only if reused by ≥2 modules) |
| Server Action caller | imported from `apps/web/app/<module-route>/_actions/*.ts` (owned by T2-api task — do not author here) |
| RTL test | colocated `apps/web/app/<module-route>/_components/__tests__/<Name>.test.tsx` |
| Playwright spec | `apps/web/e2e/<module>-<feature>.spec.ts` |
| i18n keys | `apps/web/i18n/<locale>.json` (en, pl, ro, uk — all four must contain every new key) |
| Prototype source | `prototypes/design/Monopilot Design System/<module>/<file>.jsx` (read-only; never edited from a T3 task) |

Module-route mapping: module folder names under `_meta/atomic-tasks/<NN-module>/` map directly to route segments (`maintenance/`, `reporting/`, `quality/`, etc.). Foundation primitives go to `packages/ui/`, not into a module route.

## Prototype parity (HARD RULE)

Every T3-ui task **must**:

1. Set in `pipeline_inputs`: `"prototype_match": true`, `"prototype_index_entry": "<label-from-prototype-index>"`, and `"ui_evidence_policy": "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` (or the canonical relative path).
2. Include **at least one acceptance criterion that cites a literal anchor** in this exact format:

   ```
   prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>
   ```

   The line range MUST exist — verify with `wc -l "<path>"` before emitting/closing the task. F3 and F19 audits caught range overruns (e.g. T-022 maintenance `261-584` vs file length 564) and required a fixer pass; do not repeat.

3. If the task scope spans **multiple prototype regions**, consolidate all anchors into **one** parity AC (F18 pattern: T-017 with 2 anchors, T-020 with 3, T-024 with 5 — all in a single parity AC). Do not split parity across multiple ACs (eats the 4-AC budget).

4. Include a `## Prototype parity` section in the prompt body that:
   - Lists every anchor (`<file>.jsx:<lines>`) with a one-line description of what it covers (table, modal, sparkline, etc.)
   - Names the production component(s) implementing each anchor
   - Points to `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`

5. If **no JSX exists** for the scope (rare — primitive bundles, schema-driven wizards), set `"prototype_match": false` explicitly and cite the spec-driven source (`docs/prd/<NN>-<MODULE>-PRD.md §X.Y`) plus the **nearest reusable prototype pattern** label per parity-policy §1.2 (F3 Issue B/T-037 pattern).

### Parity evidence at closeout

Per `UI-PROTOTYPE-PARITY-POLICY.md`:

- **Structural parity** — same major regions/forms/modals/tables/action groups
- **Visual parity** — same density/spacing/component family/semantic states
- **Interaction parity** — same validation, disabled/loading/empty/error/permission behaviour
- **Screenshots** of every required state
- **Playwright trace/video/artifacts** for interactive elements (closeout fails without these for any UI-visible task)
- **axe-clean run** OR a documented a11y blocker with ticket reference
- **Deviation log** — any intentional difference from prototype/UX with reason

## shadcn translation table

Pattern reference; extend per the `_meta/prototype-labels/translation-notes-<module>.md` for the specific module.

| Prototype JSX | shadcn equivalent |
|---|---|
| `window.Modal` / `<div class="modal">` | `<Dialog>` + `<DialogContent>` + `<DialogHeader>` + `<DialogTitle>` + `<DialogFooter>` |
| `_shared/Field` | `<FormField>` + `<FormLabel>` + `<FormControl>` + `<FormMessage>` (RHF + Zod) |
| bare `<input>` | `<Input>` wrapped in `<FormField>` |
| bare `<select>` | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` (**raw `<select>` is a red-line**) |
| `<table>` with sorting | `<Table>` + `<TableHeader>` + `<TableBody>` + `<TableRow>` + `<TableCell>` + sort hooks |
| inline validation `<div class="error">` | `<FormMessage>` (auto-bound to RHF errors) |
| `alert()` / `confirm()` | `<Dialog>` (confirm) + Sonner toast (info/success/error) |
| tab nav `<div class="tabs">` | `<Tabs>` + `<TabsList>` + `<TabsTrigger>` + `<TabsContent>` |
| stepper / wizard | custom composition of `<Tabs>` + nav `<Button>` (no shadcn primitive — follow `_shared/Stepper` translation note) |
| toast / snackbar | Sonner (shadcn toast v2) |
| dashboard card | `<Card>` + `<CardHeader>` + `<CardContent>` + `<Badge>` for KPI deltas |
| sparkline / chart | Recharts (already in `apps/web` deps); render inside a Client Component |

**Hard red-lines** (carry-forward from existing T3 risk_red_lines):

- Do **not** paste prototype JSX verbatim — translate
- Do **not** import `@radix-ui/*` outside `packages/ui` (Foundation ESLint rule)
- Do **not** use raw HTML `<select>` — shadcn `<Select>` only
- Do **not** bypass RBAC server-side — never trust client session for permission gates
- Do **not** create two `page.tsx` that resolve to the same URL — **route groups `(group)` add NO path segment**, so `(admin)/settings/page.tsx` and `[locale]/(app)/(admin)/settings/page.tsx` collide and fail `next build` (green vitest, red Vercel). Consolidate onto one tree (settings uses the localized `[locale]/(app)/(admin)/settings` tree). Run `pnpm --filter web exec next build` locally before deploy.

## Required UI states (every screen)

Per `UI-PROTOTYPE-PARITY-POLICY.md` — closeout fails if any of these is missing:

| State | Implementation hint |
|---|---|
| **Loading** | `<Skeleton>` while SWR/RSC fetch resolves; Suspense boundaries on RSC pages |
| **Empty** | Cite the empty-state copy from prototype if present; else use module convention ("No <entity> yet — …") |
| **Error** | RSC error boundary (`error.tsx`) + Client-side `<Alert variant="destructive">` for mutation failures; surface Server Action error code as i18n key, never the raw stack |
| **Permission denied** | RBAC gate on Server Component renders alternative UI / hides the action; never render-then-disable (info leak) |
| **Optimistic mutation** | `useOptimistic` for Client-side mutations where prototype shows immediate feedback; reconcile on Server Action result |

All 5 states **must** be exercised by either RTL or Playwright tests. Skeleton placement should match the eventual layout (no CLS).

## i18n (next-intl)

- Locale files: `apps/web/i18n/en.json`, `pl.json`, `ro.json`, `uk.json`. **All four** must contain every new key (CI fails on missing-key drift).
- **i18n completeness is a live-bug class:** every `t('key')` you reference MUST have a value in ALL FOUR files. A missing key does not throw — next-intl renders the **raw key string** ("settings.users.invite") in the UI, so buttons show garbage labels and the screen looks broken live while vitest/tsc stay green. Never ship a `t('...')` call without adding its value to en/pl/ro/uk. After authoring, grep your new `t('` calls and confirm each resolves in all four locale files.
- Key format: `<module>.<feature>.<element>`, e.g. `maintenance.dashboard.kpi.mwo_open.title`.

## Heavy-UI recurring live-bugs (green local, broken live — verify on the live screen)

These shipped GREEN locally while the deployed screen was broken. Full list: `docs/workflow/02-QUALITY-GATES.md` §Recurring live-bug checklist (classes 9-12).

- **Empty schema-driven dropdown = TWO gaps, check BOTH.** A reference-fed `<Select>` that renders empty is almost never one bug: (a) the page actually queries `Reference.<source>` and passes the result (NOT `dropdowns={{}}`) — canonical loader is `readDropdowns(ctx, columns)` in `apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/page.tsx:243`; AND (b) the lookup table is **seeded for the org** (org-insert trigger + backfill, e.g. `packages/db/migrations/156-reference-lookups-seed.sql`). A page can wire the loader perfectly and still show an empty list because the org has zero rows. DoD for any `dropdown_source`-fed Select = both wiring AND seed confirmed on the live screen.
- **Systemic shared-component bug = fix the primitive, not each page.** When a defect appears in "every X" (e.g. `packages/ui/src/Select.tsx` rendering its options regardless of open state), fix the shared primitive + add a primitive-level RTL test in `packages/ui`. A per-page workaround leaves the next page broken and still passes review.
- **Free-text where a real FK/picker is required.** A field that references a master record (component/ingredient/material → `items`) must be an **item picker bound to an FK**, never a free-text code. Pattern fix: `packages/db/migrations/157-prod-detail-item-fk.sql` adds `item_id → public.items(id)` on `prod_detail`/`formulation_ingredients`. Require the picker + FK in the AC for any code/component/ingredient input.
- Server Components: `import { getTranslations } from 'next-intl/server'`; pass strings down as props, do **not** call `useTranslations` in RSC.
- Client Components: `useTranslations('<module>.<feature>')`.
- **Never inline strings in JSX** — every visible string goes through next-intl, including button labels, empty-state copy, and error messages.
- Pluralization: use ICU `{count, plural, ...}` syntax (next-intl supports natively).
- RTL: not required for v1 (no RTL locale yet).

## a11y baseline

- Every form `<Input>` has an explicit `<Label htmlFor>` (shadcn `<FormLabel>` does this when used inside `<FormField>`)
- Modals trap focus (Radix `<Dialog>` does this by default — do not override)
- Escape + click-outside both close modals/popovers (Radix default — do not disable)
- Toasts (Sonner) emit `aria-live="polite"`; errors emit `aria-live="assertive"`
- Tables: `<th scope>` on header cells; row-level keyboard navigation if rows are interactive
- Interactive icons-only buttons have `aria-label` or `<TooltipContent>` + `<VisuallyHidden>` label
- Color is never the sole signal (badges + icons + text for status)
- Axe scan in Playwright spec must be clean OR a documented blocker is recorded in the closeout

## ui_evidence_policy (closeout artifacts)

Set `pipeline_inputs.ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` and ensure `checkpoint_policy.closeout_requires` contains `playwright_artifacts`. The closeout must attach:

1. **Screenshot per required state** — loading, empty, error, permission-denied, optimistic-mutation (PNG, named `<task-id>-<state>.png`)
2. **Playwright trace** (`trace.zip` from `npx playwright test --trace on`) covering the happy path + at least one error path
3. **Parity diff** — DOM snapshot diff vs the prototype anchor, OR side-by-side screenshot annotated with structural correspondences (acceptable when DOM-level diff is infeasible due to shadcn semantic shifts)
4. **axe report** (`axe-results.json` from `@axe-core/playwright`) showing 0 violations or each violation justified
5. **Deviation log** in the closeout markdown — any intentional difference from the prototype with rationale

## Acceptance criteria template (4 ACs, fixed shape)

Per validator constraint (exactly 4 ACs). Use this skeleton for every T3-ui task — F17/F18/F19 fusion patterns are baked in:

1. **Parity AC** (literal anchor — non-negotiable):
   > Given the production page renders, when compared to `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>` [and any additional anchors], then it has the same [list major regions: KPI grid + table + modal + ...] in the same layout — verified by RTL snapshot + structural parity checklist (structural + visual + interaction).

2. **Functional AC** (the core behaviour — Server Action call, data refresh, computation, etc.):
   > Given [precondition], when [user action / mount / interval elapsed], then [observable outcome at DOM / network / DB level].

3. **State + RBAC AC** (fuse the required states + permission gate — F18 pattern):
   > Given caller has [permission gate] and [data state — empty/error/etc.], when the page renders, then [permitted UI shown / hidden] and [empty/error/loading skeleton] is displayed per UI-PROTOTYPE-PARITY-POLICY; i18n keys resolve in all 4 locales.

4. **Closeout evidence AC** (UI-evidence policy):
   > Given the task is closed out, when reviewers inspect evidence, then Playwright trace + per-state screenshots + axe-clean report + parity diff are attached per `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.

If the task touches PII reads/exports, append the no-raw-PII red-line per F18 Cat 3 (use the canonical wording referencing Foundation T-117 pino redact allowlist).

## Workflow (RED → impl → close)

1. **RED**: write RTL test asserting parity checklist + at least one state + i18n key presence + RBAC gate. Add Playwright spec stub asserting page mounts + happy-path click-through.
2. **Verify line range exists**: `wc -l "<jsx-path>"` — if the cited range overflows the file, halt and fix the task JSON before implementing.
3. **Translate** per `translation-notes-<module>.md` checklist: prototype primitive → shadcn, mock data → Server Component Drizzle/Server Action call (owned by T2 task — import only), inline strings → next-intl keys, missing states → add the 5 mandatory ones.
4. **Run** `pnpm --filter @monopilot/web vitest run <path>` (RTL) and `pnpm --filter @monopilot/web exec playwright test <spec> --trace on`.
5. **Closeout**: attach all artifacts listed under `ui_evidence_policy`; fill the deviation log even if empty ("No deviations.").

## Cross-links

- [[MON-project-overview]] — repo map, tech-stack invariants, module glossary (read first if onboarding)
- [[MON-t2-api]] — Server Action / API task counterpart; T3 only consumes, never authors actions
- [[MON-multi-tenant-site]] — per-org / per-site permission gates and tenant scoping that wrap every page (when present)
- [[prototype-labeling]] — sister Haiku skill that produces `_meta/prototype-labels/prototype-index-<module>.json` consumed here
- [[prd-decompose-hybrid]] — canonical task-JSON template + T1/T2/T3/T4/T5 atomicity gates

## Version history

- v1.0.0 (2026-05-14) — initial. Encodes F3 parity-linkage rules, F17 BRCGS + 4-AC fusion patterns, F18 reporting parity + no-raw-PII red-line, F19 maintenance e-sign + outbox cross-deps. Authoritative for every T3-ui task in `_meta/atomic-tasks/**`.
