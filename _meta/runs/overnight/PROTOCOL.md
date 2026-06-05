# Overnight prototype-parity sweep — agent PROTOCOL (read fully before editing)

Mission: make EVERY page + EVERY modal in **technical → npd → settings** look and behave
**exactly like its prototype** (maximalist fidelity, NOT minimalism). The locked design system
(`design/monopilot/handoff/` + `MON-design-system` skill) is the SSOT for the LOOK; the per-module
prototype JSX is the SSOT for STRUCTURE + the modal/wizard layouts.

## The look problems you are fixing (root causes already diagnosed)
- `globals.css` IS correct and loaded: `.btn`/`.btn-primary`(=`--blue #1976D2`)/`.btn-secondary`/
  `.form-input`/`.ff`/`.modal-overlay`/`.modal-box`/`.modal-head/body/foot`/`.kpi`/`.badge-*`/
  `.tabs-counted`/`.empty-state`/`.alert-*`/`.pill`/`.table` all exist. USE THEM.
- Drift cause: components were built with **raw Tailwind utilities** (e.g. `rounded-xl bg-white
  shadow-lg`, `text-slate-700`, `bg-black/40`, generic shadcn) instead of the design-system classes.
  → Black/!blue buttons = a `<button>`/`<Button>` missing `.btn-primary`. Plain white inputs =
  raw `<input>` (or `@monopilot/ui` `Input`, which is UNSTYLED) instead of `.form-input`. Generic
  modal = raw Tailwind box instead of `.modal-overlay`+`.modal-box`+`.modal-head/.modal-body/.modal-foot`.
  Modal form fields = use `.ff` (uppercase label) + `.form-input` (never raw `<select>`; use the
  styled `@monopilot/ui` `Select`/`SelectTrigger/Content/Item/Value` which already carries `.select__*`).
- Fix presentation to match the prototype. Buttons: primary CTA = `.btn .btn-primary` (blue),
  secondary = `.btn .btn-secondary`, danger = `.btn-danger`. Inputs = `.form-input`. Modal fields =
  `.ff` wrapper. Keep the 5 semantic badge tones, KPI 3px accent, dense tables, mono codes, EmptyState.

## Prototype anchors
- Per-module prototype dir: `prototypes/design/Monopilot Design System/<module>/`.
  technical: `other-screens.jsx`, `bom-list.jsx`, `bom-detail.jsx`, `spec-driven-screens.jsx`,
  **`modals.jsx`** (ALL technical modals), `data.jsx`, `shell.jsx`.
  npd: `prototypes/design/Monopilot Design System/npd/*.jsx` (+ `npd.html`). Cite the exact file+line range.
  settings: `prototypes/design/Monopilot Design System/settings/*.jsx`.
- A modal MUST match its prototype modal (in `modals.jsx`) 1:1 — title, steps/wizard, field set,
  field types, the foot buttons + their tones, the chrome. If a modal has NO prototype, follow
  `MON-design-system` conventions (`.modal-*` + `.ff` + `.form-input` + `.btn-primary`).

## Functionality (the user explicitly flagged dead buttons)
- Every button/CTA must WORK: "New item", "New BOM", "Generate BOM", "Add component", wizard
  Next/Back/Create, "Edit cost", etc. Trace each onClick → server action. If the handler is wired
  and the server action exists, verify it runs. If the backend/server-action is MISSING or broken,
  DO NOT fake it — report it clearly in your return (the orchestrator routes backend gaps to Codex).
- i18n: every `t('key')` you add must resolve. Do NOT show raw keys live.

## COLLISION RULES (last run, parallel lanes corrupted shared files — obey these)
1. **NEVER run `git checkout`, `git reset`, `git stash`, `git restore`, or `git clean`.** Ever.
   If you think you need to revert, STOP and report instead.
2. **Do NOT edit the shared locale files** `apps/web/i18n/{en,pl,ro,uk}.json` directly.
   Instead, write every NEW i18n key your screens reference into a per-lane FRAGMENT file:
   `_meta/runs/overnight/i18n/<LANE_ID>.json` = a FLAT JSON map of full-dotted-key → English string,
   e.g. `{ "technical.items.list.title": "Items", "technical.bom.modal.title": "New BOM version" }`.
   The orchestrator merges all fragments into en + mirrors pl/ro/uk. (Reference existing keys freely;
   only NEW keys go in your fragment.) If a key already exists in en.json, you don't need to re-add it.
3. **Stay inside your assigned file scope** (your page dir + its `_components`/`_actions` + co-located
   tests). Do NOT touch another lane's dir, nav manifests, `app/globals.css`, layouts, `packages/ui/*`
   (shared primitives — orchestrator owns those), or any `_meta/atomic-tasks/*.json`.
4. **No push, no commit.** The orchestrator collects, typechecks, pushes, and live-verifies on the
   Vercel preview.
5. Do NOT run repo-wide `tsc` (siblings edit concurrently). Run ONLY your targeted vitest:
   `cd apps/web && pnpm exec vitest run --config vitest.ui.config.ts <your test paths>` and capture
   real output.

## Hard product rules (unchanged)
org_id NOT tenant_id; RLS `app.current_org_id()`; reads/writes via `withOrgContext`; **real Supabase
data, no mocks/hardcode**; FG canonical (FA→FG); NUMERIC-exact cost (string, no float); released
BOM/spec edits clone-on-write a new version.

## Required reading per lane
`MON-design-system` (LOOK SSOT + 18-pt checklist), the module's `MON-domain-*` skill, `MON-t3-ui`.
Then your prototype anchor (cite file:line). Translate, never paste JSX.

## Return format
Per screen/modal: prototype anchor used; what you changed to reach parity (buttons→.btn-primary,
inputs→.form-input, modal→.modal-*, etc.); which buttons you verified WORK (handler→action) and any
that are dead/backend-missing (for Codex); the i18n keys you added (also written to your fragment
file); files changed (full paths); targeted vitest result; blockers.
