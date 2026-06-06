# Settings — Design Parity & Build-out (Tor A + Tor B)

**Date:** 2026-06-06
**Branch:** kira/long-run
**Status:** DESIGN / SPEC — awaiting user review before writing implementation plan
**Owner module:** 02-settings
**Canonical design source:** `prototypes/design/Monopilot Design System/settings/` (parity is a gate — see `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`)

---

## 1. Problem

The deployed Settings area (e.g. `/en/settings/company` on Vercel) diverges heavily from the
canonical prototype. A full audit of all ~30 Settings screens (6 parallel passes, 2026-06-06)
found the divergence is **systemic, not per-screen**, with four distinct root causes.

### Root cause #1 — the prototype's settings design-system CSS was never ported
The prototype renders every settings form through CSS classes that **do not exist anywhere in the
app** (0 matches in `apps/web/app/globals.css` and `packages/ui`):

`.sg-section / .sg-section-head / .sg-section-title / .sg-section-sub / .sg-section-body /
.sg-section-foot / .sg-row / .sg-label / .sg-hint / .sg-field`

plus other prototype-specific families also undefined:
`.perm-cell / .perm-table` (Users permission matrix), `.user-av / .user-card`,
`.int-row / .int-name / .int-desc / .int-logo` (Integrations), `.sg-radio-card`,
`.sg-card-grid / .sg-card / .sg-card-title / .sg-card-desc`, `.smq-* / .sql-token--*`
(migrations queue), `.settings-schema-diff__*`, `.impex-*` (import/export).

Tokens and generic primitives **are** ported and work: `--font-sans`, color tokens, `.btn-*`,
`.card / .card-head / .card-title`, `table` (`th`/`td`), `.badge-* / .badge--*`, `.pill`,
`.tabs`, `.alert-*`, `.modal-*`, `.form-input`, `.kpi*`, `.wiz-stepper / .wiz-step-num /
.wiz-step-line`, `.empty-state`, `.page-title`.

This produces **two different symptoms**:
- **Dead no-op aliases** — a screen carries `sg-*` in `className` but also co-applies Tailwind
  or a defined class, so it renders OK but inconsistently (integrations, d365, reference, email).
- **Genuine unstyled gaps** — an undefined class with no fallback renders bare:
  - Users permission matrix `.perm-cell/.perm-table` → glyphs render as plain text
  - Column wizard step-3 type cards `.sg-radio-card` → bare text, not selectable cards
  - Migrations queue filter pills `.smq-pill` → default buttons; SQL `.sql-token--*` → monochrome
  - Schema diff `.settings-schema-diff__*` → JSON rows lose the gutter/grid
  - Import/Export `.impex-*` → entire visual language absent

### Root cause #2 — several screens hand-rolled in Tailwind with a different layout philosophy
**Company, My profile, My notifications, Security, Units, Warehouses** were written from scratch
in Tailwind and diverge from the design:
- vertical stacking (label **above** input) instead of the two-column `.sg-row` (`200px 1fr`,
  label+hint LEFT / field RIGHT)
- no separator lines between rows (or `divide-slate-100`, lighter than `var(--border)`)
- no grey section footer (`.sg-section-foot` `background: var(--gray-050)` + top border) — uses a
  thin `border-t` or a single page-level Save button
- **section titles 18px (`text-lg`) vs canonical 14px/600; labels 14px vs 13px** → the "different
  font" the user sees is mostly size/weight drift
- inputs not capped at `max-width: 420px`
- shadcn `Switch`/`Select` instead of the `.sg-toggle` slider / native `<select>`

### Root cause #3 — fonts and dropdowns
- **Font:** `globals.css:4` loads Inter via Google-Fonts `@import` (CDN) and sets
  `--font-sans: "Inter"`. The *family* is correct; the mismatch is the size/weight drift in #2
  plus FOUT risk from CDN `@import`. There is **no `next/font`** wiring.
- **Dropdowns:** `@monopilot/ui/Select` has its own `packages/ui/src/Select.module.css`
  (white bg `var(--mp-surface,#fff)`, `z-index:50`, color fallbacks). In dev it renders fine, yet
  the user reports it **unreadable on the Vercel deploy**. This points at a production-build issue
  (CSS-module class emission / variable resolution / z-index under a stacking context), **not** a
  dev-visible bug. **Must be diagnosed on the live deploy** — code inspection alone is insufficient.

### Root cause #4 — ~10 screens are stubs or the wrong screen (NOT a styling problem)
These are functional gaps, a separate and larger effort:
- **Stubs** (`SettingsRouteStub` "coming soon"): Shifts & calendar, Products & SKUs, BOMs & recipes,
  Scanner devices, Shipping override reasons, Modal gallery, **Label templates** (incl. the entire
  `LabelEditor` hero flow).
- **Wrong / structurally different screen:** Sites (a flat lines table instead of the prototype's
  site-map + per-site settings rows), Import/Export (implements a *different* prototype than the
  assigned master-data CSV hub with drawer wizard), Onboarding (split into a non-prototype KPI
  launcher + a wizard that only implements step 1 inline; step count shows 5 vs prototype 6).

---

## 2. Goals / Non-goals

**Goals**
- Settings screens visually match the prototype: layout, separator lines, grey section footers,
  field hints, typography scale, toggles, dropdowns.
- The systemic CSS gap is closed once, centrally, so it cannot silently regress.
- Missing/wrong screens (#4) are built to prototype parity **with real Supabase data** (per
  CLAUDE.md Definition of Done — no mocks).
- Every screen carries a literal prototype-parity anchor + evidence (parity gate).

**Non-goals**
- No redesign of the prototype itself — the prototype is the source of truth.
- No new product features beyond what the prototype defines (existing supersets that already ship,
  e.g. Security IP-allowlist, are kept but not expanded).
- Not changing data models/RLS except where a screen needs a producer/consumer to show real data
  (Wave0 lock stays: `org_id`, `app.current_org_id()`).

---

## 3. Approach (chosen with user, 2026-06-06)

**Scope:** Tor A (visual parity) **and** Tor B (build the ~10 missing/wrong screens) in **one plan**.
**Tor A sequencing:** start with the **global `sg-*` CSS port** (cheapest, highest-leverage win —
dozens of "dead alias" screens become correct instantly), then primitives, then migrate hand-rolled
screens, with **Company as the migration template**.
**Dropdowns:** **fix the shadcn `@monopilot/ui/Select`** (keep the component; fix readability on the
production build) — not a revert to native `<select>`.

### Tor A — Visual parity

**A1. Port the settings design-system CSS (FIRST).**
Create `apps/web/app/settings-design-system.css` (imported from `globals.css`) and port, **verbatim
with token mapping**, from the prototype:
- `settings.css` / `settings-v4.css`: `.sg-section*`, `.sg-row`, `.sg-label`, `.sg-hint`,
  `.sg-field`, `.sg-toggle`, nested-section rules.
- Per-screen inline/class families that screens already reference: `.perm-cell/.perm-table`,
  `.user-av/.user-card`, `.int-row/.int-name/.int-desc/.int-logo`, `.sg-radio-card`,
  `.sg-card-grid/.sg-card*`, `.smq-*`, `.sql-token--*`, `.settings-schema-diff__*`, `.impex-*`.
- Map prototype CSS vars to the app's existing tokens (`--border`, `--gray-050`, `--surface-1/2`,
  `--muted`, `--radius`); do not introduce new colors.
- Acceptance: integrations, d365, reference, email, users matrix, wizard cards, migrations pills,
  SQL highlighting, schema-diff panels visibly correct **without touching their TSX**.
- Anchors: `settings.css:22-126`, `settings-v4.css:32-67`, `shell.jsx:61-105`.

**A2. Shared React primitives.**
Add `Section`, `SRow`, `PageHead`, `Toggle`, `SettingField` (label+hint+field row), and a
`SelectField` wrapper, mirroring `shell.jsx:61-105`. Location: `apps/web/.../settings/_components/`
(shared within the settings tree) or `packages/ui` if reused outside settings. These render the
`.sg-*` classes from A1 so new/migrated screens are correct by construction.

**A3. Typography normalization + reliable font loading.**
- Pin the type scale to the design: section title 14px/600, label 13px/500, hint 12px muted,
  page title per `.sg-title`. Replace ad-hoc `text-lg`/`text-base` on settings sections.
- Load Inter via `next/font` (self-hosted, no FOUT) and drop the CDN `@import`, or keep `@import`
  as fallback. Verify `--font-sans` resolves to the loaded face.

**A4. Fix the dropdown (`@monopilot/ui/Select`) — diagnose on live first.**
- Reproduce on the Vercel deploy (auth-gated): confirm whether `Select.module.css` is bundled in
  production, whether `select__content` classes match, and whether `z-index:50` loses to a parent
  stacking context. Capture a screenshot as evidence.
- Fix the actual cause (likely: ensure module CSS ships in prod / raise stacking / portal the
  listbox / define `--mp-*` vars). Keep the component API stable.
- Acceptance: dropdown options render on a solid surface, above siblings, readable, on prod.

**A5. Migrate hand-rolled screens onto the primitives (Company = template).**
Order: **Company** (pilot, get user sign-off on the template) → Security → My profile →
My notifications → Units → Warehouses. Each: replace stacked layout with `SRow`, restore hints,
add grey `.sg-section-foot`, cap inputs at 420px, swap `Switch`→`.sg-toggle`, normalize fonts.
Anchors: Company `org-screens.jsx:3-100`; Security `access-screens.jsx:160-245`;
My profile/notifications `account-screens.jsx:3-124`; Units `data-screens.jsx:151-187`;
Warehouses `org-screens.jsx:191-252`.

**A6. Badge / toggle consistency sweep.**
Fix inverted/remapped badge color maps to the prototype maps (schema-browser tier badges, audit
action badges, users role/status badges, tenant/flags status glyph badges).

### Tor B — Build missing / wrong screens (to prototype parity, real data)

Each screen: build to its prototype anchor, wire **real Supabase data** (producer + consumer),
and add a **wiring-contract test** + a parity-evidence E2E (pattern already in repo:
`apps/web/e2e/settings-*-parity-evidence.spec.ts`). Per `acp_wiring_contract_pattern`: every
field/column/event must have producer + consumer + E2E.

| Screen | Prototype anchor | Current state | Build |
|---|---|---|---|
| Shifts & calendar | `org-screens.jsx:255-306` | stub | shift-patterns table + monthly calendar + legend + "+ New shift" |
| Products & SKUs | `data-screens.jsx:4-52` | stub | toolbar + category pills + SKU table + status badges |
| BOMs & recipes | `data-screens.jsx:55-103` | stub | KPI cards + BOMs table + BOM-settings section |
| Scanner devices | `ops-screens.jsx:4-95` | stub | KPI grid + paired-devices table + defaults section + pair-QR modal |
| Shipping override reasons | `admin-screens.jsx:720-799` | stub | override-type card grid + reason-code table + RMA reason-codes |
| Modal gallery | `modals.jsx` (623 lines) | stub | modal catalogue (dev/reference surface) |
| Label templates + editor | `editor-tweaks.jsx:3-257` | stub | template list + **LabelEditor** (palette / mm canvas / inspector) |
| Sites & lines | `org-screens.jsx:103-189` | wrong screen | 280px/1fr split: site-map + site list + per-site settings rows (HACCP, hours) |
| Import / Export | `import-export.jsx:60-144` | wrong prototype | master-data hub: filter chips + impex table + slide-in drawer wizard + recent jobs |
| Onboarding | `onboarding-screens.jsx:88-236` | partial | reconcile launcher vs inline wizard; complete steps 2-6; 6-step count; `.wiz-*` stepper |

LabelEditor and the Sites two-pane + Import/Export drawer wizard are the largest sub-builds.

---

## 4. Sequencing & dependencies

1. **A1 (global CSS port)** — unblocks the most screens; no TSX changes. Ship + visual-diff first.
2. **A2 (primitives)** + **A3 (typography/font)** — foundation for migration & new screens.
3. **A4 (dropdown)** — independent; can run in parallel after live diagnosis.
4. **A5 Company pilot** → user sign-off on the template → remaining A5 migrations → **A6 sweep**.
5. **Tor B** per-screen, each gated by parity evidence + wiring-contract test. Order by leverage:
   data screens (Products, BOMs) and Sites first (most-used), then Devices/Shifts, then Labels
   editor (largest), Import/Export, Modal gallery, Onboarding reconcile.

Each UI task must run real tests and capture output (`pnpm --filter web vitest run <path>`,
`pnpm --filter web exec playwright test <spec>`); a self-declared GREEN with no run is a FAIL.

## 5. Testing strategy
- Unit/RTL per migrated/new screen (`vitest`).
- Parity-evidence E2E per screen (extend existing `settings-*-parity-evidence.spec.ts`).
- Wiring-contract test for every new data binding (`tests/test_wiring_contract.py` equivalent for
  the web surface / the repo's wiring linter).
- A1 acceptance: visual regression / screenshot diff of the dead-alias screens before/after.

## 6. Risks
- **R1 — CSS port collisions:** ported `.sg-*` could clash with Tailwind v4 layer ordering. Mitigate
  by scoping to a settings root class or an `@layer`, and visual-diffing the dead-alias screens.
- **R2 — Dropdown not reproducible locally:** the prod-only symptom may need a prod build
  (`pnpm --filter web build && start`) or live Vercel session to reproduce. Budget for live debug.
- **R3 — Tor B data wiring:** new screens need real Supabase producers; respect Wave0 lock and
  canonical table owners. Some data (shifts, devices) may need new tables/migrations — flag per
  screen before building.
- **R4 — Scope size:** Tor B is ~10 screens incl. two large editors. Treat each as its own
  parity-gated task; do not batch-merge.

## 7. Decisions captured
- 2026-06-06: Scope = **Tor A + Tor B in one plan**.
- 2026-06-06: Tor A starts with the **global `sg-*` CSS port**, Company as migration template.
- 2026-06-06: Dropdowns = **fix shadcn `Select`**, not revert to native.

## 8. Open items (resolve during implementation, not blocking spec)
- A4: exact dropdown root cause — pending live-deploy reproduction.
- R3: which Tor B screens require new migrations vs existing tables — confirm per screen at build.
