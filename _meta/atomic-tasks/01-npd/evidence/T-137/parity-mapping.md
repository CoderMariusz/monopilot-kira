# T-137 — FA right panel sidebar · prototype parity mapping

Prototype anchor (verified, `wc -l` = 975 lines):
`prototypes/design/Monopilot Design System/npd/fa-screens.jsx:404-452`
(the `FARightPanel` component spans 422-470; the canonical index range 404-452
covers the call site at 415 `<FARightPanel fa={fa} />` plus the Validation
status card; the Built-status card continues 454-467.)

Production component (STANDALONE, real-data):
`apps/web/app/[locale]/(app)/(npd)/fa/[productCode]/_components/fa-right-panel.tsx`

Prototype-index entry: `fa_right_panel`
(`_meta/prototype-labels/prototype-index-npd.json` lines 502-528)

## Structural parity

| Prototype region (JSX) | Production translation | shadcn primitive |
|---|---|---|
| `<div>` 280px column wrapping two `.card` blocks (caller grid `1fr 280px`, line 400) | `<aside>` `max-w-[280px]` `sticky top-4`, `role="complementary"` carrying `data-prototype-anchor` | layout |
| `.card` "Validation status" + `.card-title` (439-440) | Card 1 header `<h2>` Validation status + subtitle | `Card` + `CardHeader` |
| status of the FA (prototype derives V05 from `status_overall`) | `status_overall` rendered as a labelled status pill (`data-testid="fa-right-panel-status"`) — color + text (never color-only) | `Badge` (`tone` success/danger/warning/muted) |
| validation-rule table V01-V08 (441-450) | **Deviation** — replaced by the real-data **key facts** block (code / product / days_to_launch / launch_date / last updated). See deviation log. | `<dl>` key/value rows |
| `.card` "Built status" + `⚡ Built` / `Not built` badge + "Any edit resets the Built flag." (454-467) | Card 2: `Built status` header + Built/Not-built `Badge` + built note / last-build line | `Card` + `Badge` |
| `Download last build →` link (460, gated on `fa.built`) + action affordances | Card 3 action seams: Dept Close / D365 Build buttons, **disabled** (modal workflow deferred to T-123) | `Button` (disabled) |

## Visual parity

- 280px sticky right column, stacked white cards with light borders + subtle
  shadow — same density and component family as the prototype `.card` stack.
- Status conveyed by badge color **and** text + `aria-label` (color is never the
  sole signal — a11y baseline).
- `⚡ Built` retained verbatim from prototype line 458.

## Interaction parity

- The prototype `FARightPanel` is read-only (`interaction: "read-only"` in the
  index). Production matches: no client mutation. The Dept Close / D365 Build
  affordances are rendered as **deferred seams** (disabled, with a tooltip) —
  the modal workflow lands in T-123. No DB write, no Server Action call, no mock.

## Required UI states (all 5 exercised by RTL)

| State | Production surface | testid |
|---|---|---|
| loading | `<FaRightPanelSkeleton />` (Suspense fallback) | `fa-right-panel-skeleton` |
| empty | "No summary" card when the product row is absent | `fa-right-panel-empty` |
| error | "Unable to load the summary." when the org-scoped read throws | `fa-right-panel-error` |
| permission-denied | server-resolved `npd.fa.read` gate → "no permission" card | `fa-right-panel-forbidden` |
| ready / optimistic | read-only summary (no optimistic mutation — component is read-only; documented deviation) | `fa-right-panel-status` |

## Real-data wiring (NO mocks)

- The component is a self-contained async RSC. It reads the product summary via
  `withOrgContext` (single org-context transaction as `app_user`, RLS pinned to
  `app.current_org_id()`), `select … from public.product where product_code = $1`.
- Composite identity `(org_id, product_code)`: `org_id` is RLS-scoped (no explicit
  predicate needed), `product_code` is the PK.
- RBAC `npd.fa.read` resolved server-side; the client never re-queries and never
  trusts a client-side permission flag.
- This file REPLACES the earlier prop-driven mock stub — no hardcoded summary
  array remains.

## a11y

- `role="complementary"` landmark with `aria-label`.
- Status + Built badges carry `aria-label` and text (not color-only).
- Disabled action buttons carry an explanatory `title`.
- Skeleton sets `aria-busy="true"`.
- Axe: not run via Playwright (component is not yet route-wired — wiring is
  T-138). RTL DOM evidence + a11y attributes documented above; full axe scan is
  the T-138/T-139 closeout item once the panel is mounted in a route.

## Deviation log

1. **Validation-rule table (V01-V08) → real-data key facts.** The prototype
   hardcodes a V01-V08 checklist computed client-side from mock `fa` fields.
   Per the task mandate (real product summary: status_overall / built /
   days_to_launch) and the index translation note ("compute validation results
   server-side … pass as prop"), the standalone slice renders the **real**
   summary facts (status, days_to_launch, launch_date, last updated) instead of
   re-deriving the V01-V08 table client-side. The validator panel is a separate
   server-computed concern (`getValidationStatus`) deferred to its own slice;
   this slice does not invent client-side validation. Rationale: NO-mock gate +
   "compute server-side" index note.

2. **"Last updated" sourced from `created_at`.** `public.product` has no
   `updated_at` column (migration 075). The prototype's "Last build: 2026-04-15
   16:21" is a hardcoded literal; production renders `created_at` (date portion)
   as the available timestamp until an `updated_at`/`fa_build_artifacts` source
   exists. Date-only slice avoids SSR/CSR hydration drift.

3. **Dept Close / D365 Build are disabled seams.** The modal workflow
   (dept_close_modal / d365_build_modal) is T-123-deferred and out of scope for
   T-137. The affordances render (parity) but are inert (no mock handler).

4. **No optimistic-mutation state.** The panel is read-only (matches the
   prototype `interaction: "read-only"`); there is no client mutation to be
   optimistic about. The other 4 states are fully exercised.
