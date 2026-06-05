# 01 · DESIGN SPEC — MonoPilot (condensed, canonical)

Single source of truth for visuals. Every value here lives as a token in
`monopilot-tokens.css`. If you need a value that isn't here, you are drifting — stop.

---

## §1 What MonoPilot is (so your choices fit)

Browser-based MES for food factories. Two surfaces sharing one palette:

| | **Desktop (light, ~90% of screens)** | **Scanner (dark, shop-floor mobile)** |
|---|---|---|
| Page bg | `#f8fafc` (`--bg`) | `#0f172a` |
| Card bg | `#ffffff` (`--card`) | `#1e293b` |
| Sidebar/chrome | `#1e293b` (`--sidebar`) | `#1e293b` |
| Primary text | `#1e293b` (`--text`) | `#f1f5f9` |
| Muted text | `#64748b` (`--muted`) | `#64748b` |
| Border | `#e2e8f0` (`--border`) | `#334155` |
| Frame | sidebar + topbar + tables | 390px device, 56px topbar, big tap targets |
| Copy | short operational **English** | imperative **Polish** |

Voice everywhere: operational, never marketing. Domain terms (LP, WO, PO, TO, GRN, BOM,
Batch, Yield, OEE, HACCP, CCP, NCR, SSCC) used **without explanation**. No "please".

---

## §2 Color — semantic mapping

```
blue    primary action, selected nav, KPI default, info, links
green   success, active, on-time, pass, completed
amber   warning, partial, draft, pending, overdue-risk
red     error, critical, overdue, hold, blocked, destructive
gray    neutral, inactive, archived
```

Core hexes (use the **token**, never the hex literal):

| Token | Hex | Use |
|---|---|---|
| `--blue` | `#1976D2` | primary buttons, active nav, focus, default KPI accent |
| `--blue-600` | `#1565C0` | primary hover |
| `--green` | `#22c55e` | success / active |
| `--amber` | `#f59e0b` | warning / partial |
| `--red` | `#ef4444` | error / overdue |
| `--info` | `#3b82f6` | info alerts |
| `--bg` | `#f8fafc` | page bg |
| `--card` | `#ffffff` | card surface |
| `--sidebar` `--text` | `#1e293b` | chrome + primary text |
| `--muted` | `#64748b` | secondary text, table headers |
| `--border` | `#e2e8f0` | card/table borders |

Badge bg/text pairs: `--{color}-050` background + `--{color}-700` text.

**Surface layering** (prefer surface contrast over a second border): `--surface-1` (#fff
cards) → `--surface-2` (#f1f5f9 nested rows / inner wells) → `--surface-3` (#e2e8f0,
sparkline track). A nested panel inside a card gets `background: var(--surface-2); border: 0`
— not a second 1px border.

**MES cell-state colors** (keep, MES-specific): `--cell-locked #D0D0D0`,
`--cell-auto-derived #E0FFE0`, `--cell-d365-found #C0FFC0`, `--cell-d365-nocost #C0FFFF`,
`--cell-d365-missing #C0C0FF`, `--cell-row-alert #C0C0FF`.

---

## §3 Typography

- **Inter** 400/500/600/700 — everything.
- **JetBrains Mono** 400/500 — **only** codes/IDs/timestamps/quantities-as-data.

| Role | Size / weight | Token |
|---|---|---|
| Page title (H1) | 20 / 700 | `--fs-page-title` |
| Settings dashboard H1 | 24 / 700 | `--fs-page-title-lg` |
| Card title | 14 / 600 | `--fs-card-title` |
| Section header (UPPERCASE, 0.08em) | 12 / 700 | `--fs-section` |
| Body | 14 / 400 | `--fs-body` |
| Table header | 12 / 600 muted | `--fs-table-head` |
| Table cell | 13 / 400 | `--fs-table-cell` |
| Label | 12 / 500 | `--fs-label` |
| Helper | 12 / 400 muted | `--fs-helper` |
| Badge | 11 / 500 | `--fs-badge` |
| **KPI value** | **26 / 700 — Inter, NEVER mono** | `--fs-kpi-value` |
| KPI label | 11 / 500 muted | `--fs-kpi-label` |
| Breadcrumb | 12 / muted, links blue | `--fs-breadcrumb` |

`font-variant-numeric: tabular-nums` is global (set on `html, body`). Any element that
overrides `font-family` to mono **must re-declare** `tabular-nums`.

---

## §4 Spacing & shape

- **Radius:** `6px` cards/badges (`--radius`), `4px` inputs/buttons (`--radius-sm`),
  `8px` modals (`--radius-lg`), `10px` pill badges (`--radius-pill`).
- **Sidebar** 220px (`--sidebar-w`). **Settings sub-nav** 256px. **Topbar** 48px (`--topbar-h`).
- **Card** padding 16px. **Table** th 8/10, td 7/10. 8px soft grid.
- **Shadows:** only `--shadow-modal` (modals) and `--shadow-focus` (input focus). **No card
  shadows.** Cards are defined by their 1px border, not elevation.

---

## §5 Page layout recipe (desktop)

```
┌─ #sidebar (fixed, 220px, #1e293b) ─┬─ .topbar (fixed, white, 48px) ────────────┐
│  .sidebar-logo  "MonoPilot MES"    │  search ······· spacer ···· alerts  avatar │
│  .sidebar-group  Core              ├────────────────────────────────────────────┤
│  .sidebar-item   Dashboard         │  #main  (margin-left:220px; padding:72px 24px 40px)
│  .sidebar-item.active Planning     │    .breadcrumb     Planning / Work Orders
│  .sidebar-group  Operations        │    .page-title     Work Orders            (20/700)
│  …                                 │    .muted sub      one-line description    (12)
│  .sidebar-group  Premium           │    .kpi-row        grid, 5 tiles
│  .sidebar-item   NPD  [badge]      │    .alert*         optional inline alerts
│                                    │    .card  → .card-head (title + actions) + table/form
└────────────────────────────────────┴────────────────────────────────────────────┘
```

- Primary action sits **top-right of the card header**, secondary actions before it.
- Tables are full-bleed inside cards (`.card` with `padding:0` when it wraps only a table).
- Some modules add a **horizontal sub-nav** (tabs under the topbar) or a **left sub-nav rail**
  (e.g. Technical: Overview / Products / BOMs…). Keep whichever the module already uses; do
  not remove the main 220px sidebar to make room for it.

---

## §6 Components — exact specs

**KPI tile** — `border:1px solid --border; radius:6px; padding:12px 14px;
border-bottom:3px solid <semantic>`. Label 11/500 muted → value 26/700 Inter → change 11px
(colored). Variants `.kpi.green/.amber/.red`. **No shadow. No mono. No gradient.**

**Button** — `padding:6px 14px; radius:4px; 12/500`. `.btn-primary` = blue/white,
`.btn-secondary` = white/border, `.btn-success` green, `.btn-danger` red, `.btn-ghost`
transparent. `.btn-lg` = 9/18 13px for detail-page primary actions.

**Badge** — `padding:2px 8px; radius:10px; 11/500`. Dot/glyph prefix convention:
`●` active/confirmed · `○` pending/draft/archived · `◉` in-progress · `✓` done · `⚠` warning/overdue.

**Table** — `font-size:13`; th `8/10` gray-100 bg, 12/600 muted, 2px bottom border;
td `7/10`, 1px bottom border; `tr:hover td` → gray-100. Codes in `td.mono` (12px).

**Alert** — `padding:10/14; radius:6; 12px; border-left:4px solid <semantic>` + tinted bg
(`--{color}-050a`). `.alert-title` 600.

**Tabs** — plain `.tabs/.tab` (underline active in blue) OR **TabsCounted** with a count
pill (preferred for list screens: `All / <priority> / <closed>`).

**Filter pills** — `.pill` gray, `.pill.on` blue-050. Collapse >3 filters under "More filters ▾".

**Form** — label 12/500 (or `.ff` uppercase 11/600 muted in modals) → input
`7/10, 1px border, radius 4, 13px`; focus = blue border + `--shadow-focus`. Required `*` in red.
Pack fields with `grid-template-columns: 1fr 1fr`.

**EmptyState** — icon(emoji 40px, .28 opacity) + title 14/600 + body 12 muted + optional
primary CTA. Renders inside the card where rows would be.

**RunStrip** — inline 8-cell sparkline, 3px×12px cells, colored per outcome (ok/warn/bad).
For trend/run-history/per-period footers.

**Modal** — overlay `rgba(15,23,42,.45)`; box 560px (or `.wide` 760), radius 8,
`--shadow-modal`; head 14/18 with 15/600 title + × close; body 16/18 scroll; foot gray-050,
right-aligned buttons.

---

## §7 Status lifecycles (use the 5 tones)

| Entity | States |
|---|---|
| Work Order | Planned · Released · In Progress · On Hold · Completed |
| Purchase Order | Draft · Confirmed · Partially Received · Received · Invoiced · Overdue |
| LP | Available · Reserved · Blocked · Expiring · Expired |
| QA | Pending · Passed · Failed · Hold · Released |
| NCR | Open · In Progress · Closed |

Tone rules: `draft/pending`→neutral · `active/running/picking/in_progress`→info(blue) ·
`done/completed/shipped/released/passed`→ok(green) · `warning/partial/overdue-risk/short`→warn(amber) ·
`failed/overdue/held/blocked/quarantined/cancelled`→bad(red).

---

## §8 Iconography

- **Module nav = emoji** (🏠 ⚙️ 🔧 📅 🏭 📦 📱 ✅ 🚚 💡 💰 📊 🔗). Intentional; keep.
- Small affordances = text glyphs: `›  ←  ↕  ✓  ⋮  ×  ▾`.
- **Never hand-draw SVG icons.** No icon font yet — emoji is the system.

---

## §9 Token map for React / Tailwind / shadcn

If you're not using the raw CSS, mirror these into `tailwind.config` / CSS vars:

```js
colors: {
  blue:   { DEFAULT:'#1976D2', 600:'#1565C0', 50:'#dbeafe', 700:'#1e40af', 900:'#1e3a5f' },
  green:  { DEFAULT:'#22c55e', 50:'#dcfce7', 700:'#166534' },
  amber:  { DEFAULT:'#f59e0b', 50:'#fef3c7', 700:'#92400e' },
  red:    { DEFAULT:'#ef4444', 50:'#fee2e2', 700:'#991b1b' },
  info:   '#3b82f6',
  bg:'#f8fafc', card:'#ffffff', sidebar:'#1e293b',
  text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
  surface:{1:'#ffffff',2:'#f1f5f9',3:'#e2e8f0'},
},
borderRadius: { sm:'4px', DEFAULT:'6px', lg:'8px', pill:'10px' },
fontFamily:   { sans:['Inter','system-ui','sans-serif'], mono:['JetBrains Mono','ui-monospace','monospace'] },
```

shadcn component map: `TabsCounted`→`Tabs`+`Badge`; `EmptyState`→`Card` variant;
`Modal`→`Dialog`; `CompactActivity`→`Accordion`+`Collapsible`; surface tokens→`bg-muted/bg-card`;
semantic tokens→`text-destructive` etc. Keep prop shapes identical so the port is find-and-replace.
