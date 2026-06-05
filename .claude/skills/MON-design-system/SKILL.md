---
name: MON-design-system
description: THE locked MonoPilot visual system — tokens, chrome, density, the 18-point page-conformance checklist, and the drift catalogue. Use for ANY visual-polish / UI-conformance work: making a built screen match the prototype (fonts, colors, spacing, chrome, KPI tiles, tables, badges, modals, empty states), killing drift, or authoring a new screen's presentation layer. Pairs with MON-t3-ui (route/state/i18n rules) — this skill owns LOOK, MON-t3-ui owns STRUCTURE/DATA. Read FIRST on every polish task.
---

# MON-design-system — locked visual system + conformance gate

The product has a **locked design system**. Many built pages **drifted** from it
(heavy cards, wrong fonts, gradient backgrounds, missing chrome). This skill makes
every screen look like the prototype. It is **polish + conformance, not redesign**.

> **Hard scope law (never violate):** change only the **presentation layer**. Do NOT
> change data flow, API shape, routes, URL structure, sidebar/sub-nav structure, business
> logic, or copy *meaning*. Wave0 / real-Supabase / RLS / prototype-parity rules from
> `MON-multi-tenant-site`, `MON-t2-api`, `MON-t3-ui` stay fully intact. You are restyling,
> not rewriting.

## Source of truth (read in this order)

The full handoff pack lives **in the repo** at `design/monopilot/handoff/`:

| File | When |
|---|---|
| `00-START-HERE.md` | mission + the 10 golden rules + per-page workflow — read first |
| `01-DESIGN-SPEC.md` | canonical tokens, type scale, layout recipe, exact component specs + DO/DON'T |
| `02-DRIFT-AUDIT.md` | every observed drift with symptom → cause → **exact fix** — scan before fixing a page |
| `03-COMPONENTS.md` | paste-ready markup for chrome + every component (HTML + React/shadcn map) |
| `04-PAGE-CHECKLIST.md` | the **18-point acceptance gate** — run on every page before "done" |
| `monopilot-tokens.css` / `monopilot-components.css` | the real token + component CSS (the canonical values) |
| `index.html` | live preview of the correct render |
| `../../../prototypes/design/Monopilot Design System/<module>/*.jsx` | the per-screen prototype (1:1 target) |
| sitemap (uploaded) → `_meta/audits/parity/*` | which screens/modals each module should have |

`design/monopilot/handoff/reference/` (4 UX md files) is **optional** — plug in only when
**building a missing screen**, not for polishing an existing one.

## The 10 golden rules (memorize)

1. **No hardcoded color** — every color is a token (`--blue`, `--muted`, `--green-050`…). A hex literal that isn't in `monopilot-tokens.css` = drift.
2. **Two fonts only** — `Inter` for everything; `JetBrains Mono` **only** for codes/IDs/timestamps/quantities-as-data (`WO-0143`, `LP-00234`, `2026-06-05`). KPI values, headings, body = **Inter, never mono**.
3. **Primary action is always `--blue` #1976D2** — never black/navy/custom hue. The only black surface is the sidebar.
4. **KPI tile** = 1px border + 6px radius + **3px coloured bottom accent** + value Inter **26/700**. No shadow, no gradient, no mono, no heavy rounding.
5. **Desktop is dense** — card padding 16px, table rows 7px, radius 6px. No marketing whitespace, no hero sections, no icon-headline-paragraph cards.
6. **Every desktop screen has the chrome** — fixed dark sidebar + fixed white topbar + `#main` offset by both. A centered, max-width, no-sidebar page is broken.
7. **Lead with the code, in mono** — rows/cards/detail headers start with the domain code (`WO-0143`), name second.
8. **Status = the 5 semantic tones**, never per-page colors: `draft/pending`→neutral · `active/running/in_progress`→info(blue) · `done/completed/passed`→ok(green) · `partial/warning/overdue-risk`→warn(amber) · `failed/overdue/held/blocked`→bad(red).
9. **Every list that can be empty renders an `EmptyState`** (icon + title + body + CTA) — never a blank `<tbody>`.
10. **Keep emoji module icons + operational copy.** Desktop copy = short operational English; scanner copy = Polish. Don't marketing-ify. Scanner stays intentionally dark.

## Our stack reality + the drift root cause

Stack: **Next.js 16 App Router + Tailwind v4 (`@theme` in `apps/web/app/globals.css`, no `tailwind.config`) + shadcn/ui + `@monopilot/ui` primitives**. The design pack is CSS-class oriented but ships a shadcn/Tailwind map (`01-DESIGN-SPEC §9`, `03-COMPONENTS §11`) — **the token VALUES are non-negotiable; only the delivery mechanism changes.**

**Root cause of the visual drift:** `apps/web/app/globals.css` was a thin, partially-drifted
subset of the system — wrong chrome widths, a **banned gradient body background**, fonts not
actually loaded, and only `.btn`/`.table` of the component library present. Pages then
reinvented styling in raw Tailwind → heavy cards, raw `<select>`, missing KPI accents. **Fixing
`globals.css` to faithfully port `monopilot-tokens.css` + `monopilot-components.css` corrects
most drift globally** and turns per-page polish into "use the right class".

### The token contract (Tailwind v4)
`globals.css` must expose the full token set from `monopilot-tokens.css` (colors incl. the
`-050/-700` badge pairs, `--gray-*`, `--blue-900` sidebar-active, `--font-sans`+`--font-mono`,
`--radius*`, `--fs-*` incl. `--fs-kpi-value:26px`, surface + semantic + spark tokens), load
**Inter + JetBrains Mono**, and use a **flat `--bg:#f8fafc` body (NO gradient)**. Mirror the
colour tokens into `@theme` (`--color-*`) so Tailwind utilities resolve to them. The full
component library (`kpi`, `badge-*`, `alert-*`, `card`, `card-head`, `pills/pill`, `tabs`,
`tabs-counted*`, `empty-state*`, `modal-*`, `ff*`, `wiz-*`, `run-strip*`, `bar-*`,
`sidebar-*`, `topbar`, `kpi-row`) lives in `globals.css`, ported verbatim from
`monopilot-components.css`.

### Chrome dimensions — ⚠ ratified override
Design system: **sidebar 220px, topbar 48px**. Our shell has a **tested contract at
`--shell-sidebar-w:280px` / `--shell-topbar-h:56px`** (`apps/web/components/shell`,
`shell-tokens.test.tsx`, `shell-contract.test.tsx`) — a deliberate superset (17 modules +
longer labels). **Do NOT silently change it.** Treat 280/56 as the ratified app value; only
change it with explicit human sign-off + updated tests + a no-overflow visual check. Everything
else (active-item tone = dark `--blue-900`, group labels, font, density) follows the design
system.

## Authoring components — class map

| Need | Use |
|---|---|
| primary/secondary/ghost/danger/success button | `@monopilot/ui` `<Button>` (emits `.btn`) + `.btn-primary` etc. — already wired |
| KPI tile | `.kpi`(+`.green/.amber/.red`) → `.kpi-label` / `.kpi-value`(Inter 26/700) / `.kpi-change`. Never wrap value in mono. |
| status badge | `.badge .badge-{green/amber/red/blue/gray}` + glyph (`●○◉✓⚠`) — map to the 5 tones |
| table | dense `table`/`th`/`td`; lead cell `td.mono`; OR `@monopilot/ui` `<Table>` (BEM `.table__*`, padded in globals) |
| list filter tabs | `.tabs-counted` with count pill (`tone-ok/warn/bad/info/neutral`) — preferred over plain `.tabs` |
| empty list | `.empty-state` (icon + title + body + CTA) |
| alert | `.alert .alert-{red/amber/blue/green}` + `.alert-title` |
| filter pills | `.pill` / `.pill.on` |
| dialog | shadcn `<Dialog>` styled to `.modal-*` (overlay `rgba(15,23,42,.45)`, box 560/`.wide`760, head/body/foot) |
| form field | `.form-*` (page) or `.ff*` (modal/detail, uppercase label) — **never raw `<select>`; use a client `<SelectField>`/shadcn `<Select>` styled to `.form-input`** |
| trend/run history | `.run-strip` (8-cell sparkline) |
| select in an RSC | extract a thin `'use client'` `<SelectField>` wrapper — the raw-`<select>` cluster came from avoiding client islands; the wrapper is the canonical fix |

Keep shadcn/`@monopilot/ui` **prop shapes identical** to the prototype primitive so the port
stays find-and-replace, not a rewrite.

## Polish workflow (per page)

1. **OPEN** the built page next to its prototype JSX (`prototypes/design/Monopilot Design System/<module>/<file>.jsx`) + its `_meta/prototype-labels/prototype-index-<module>.json` anchor.
2. **AUDIT** against `04-PAGE-CHECKLIST.md` (18 points) — note every failing item.
3. **CROSS-REF** `02-DRIFT-AUDIT.md` — most drifts are catalogued with the exact token/class fix (A1 KPI-mono, A2 KPI-accent, A3 black-button, A4 no-sidebar, A5 marketing-whitespace, B color, C type, D chrome, E component).
4. **FIX presentation only.** Pull markup from `03-COMPONENTS.md`; don't author new visual patterns. Swap heavy Tailwind cards → `.card`; raw `<select>` → `<SelectField>`; add KPI accents; add `EmptyState`; restore breadcrumb + `.page-title` + one-line muted description.
5. **BUILD missing in-system elements** (empty states, KPI accents, status pills, breadcrumb) — never invent.
6. **RE-RUN the 18-point checklist.** All must pass (or `N/A` + one-line reason).
7. **EVIDENCE** (see below). Move to next page.

## Routing (per the run model)

Visual polish / prototype-conformance is the **Opus (Claude) lane** — it's structural-visual
judgment. Codex **reviews** Claude-written UI (writer never reviews own). Trivial mechanical
class swaps / token renames → Sonnet. Backend/data findings surfaced during polish are
**out of scope** for the polish change (log them; they go to the data phase later).

## Verification / evidence (tests run for real)

- `pnpm --filter web typecheck` + targeted `vitest` (`.tsx` RTL needs `--config vitest.ui.config.ts`).
- **Live screenshot side-by-side with the prototype** is the real parity gate (static green ≠ looks right). Use the Playwright MCP against the running app / preview; capture before→after.
- Self-test (`02-DRIFT-AUDIT §F`): any "yes" = still drifted — hex-not-token? KPI in mono? non-blue primary? card shadow/gradient? missing sidebar/topbar? KPI missing 3px underline? empty list not `EmptyState`? per-page status colors?
- The final box of `04-PAGE-CHECKLIST`: *a teammate can't tell which is the prototype and which is the build.* If it fails, re-walk items 1–18.
