# SKILL: Designing for MonoPilot MES

When asked to design any screen, flow, or component for MonoPilot, follow this playbook.

## 1 — Pick the surface first

**Desktop (default, ~90% of screens)** — light page, dark sidebar, dense tables, KPI rows. Anything used by managers, planners, QA, technical, buyers.

**Scanner (mobile, dark)** — 390px device frame, 56px topbar, big tap targets (≥44px), bottom-anchored primary button, Polish copy. Anything used by shop-floor operators or warehouse pickers: consume material, register output, pick, pack, receive PO, receive TO, putaway, move LP, QA inspect.

If the user says "mobile", "operator", "scanner", "scan", "shop floor", "warehouse staff" → scanner mode.

## 2 — Always import tokens

```html
<link rel="stylesheet" href="colors_and_type.css">
```

Never hardcode colors. Always use the CSS variables: `var(--blue)`, `var(--green)`, `var(--amber)`, `var(--red)`, `var(--muted)`, `var(--border)`, etc.

## 3 — Page layout recipe (desktop)

```
┌──────────────────────────────────────────────┐
│ sidebar 220px │ main content                 │
│ #1e293b       │ padding: 40px 20px 20px      │
│ logo + nav    │                              │
│               │ ┌── page-title (20px/700)    │
│               │ ├── breadcrumb (12px/muted)  │
│               │ ├── kpi-row (grid 5 cols)    │
│               │ ├── card                     │
│               │ │   • card-title 14/600      │
│               │ │   • table OR form OR list  │
│               │ └── card                     │
└──────────────────────────────────────────────┘
```

Full-bleed tables inside cards, primary actions top-right of card header, secondary actions after.

## 4 — Page layout recipe (scanner)

```
┌─────────────────────┐  Device frame 390px
│ 9:41    📶 🔋       │  Status bar 44px
├─────────────────────┤
│ ← Title         JK ⋮│  Topbar 56px #1e293b
├─────────────────────┤
│                     │
│   scrollable        │  #0f172a
│   content           │
│                     │
├─────────────────────┤
│ [ Primary action  ] │  Bottom actions
│ [ Secondary       ] │  (.brow)
└─────────────────────┘
```

Primary action is always a 50px full-width button near the bottom. No floating action buttons. Back-chevron in topbar handles navigation; no bottom tab bar.

## 5 — Copy rules

- **Desktop** — English, short, operational. "Create PO", "Run MRP", "Approve", "Release", "Hold".
- **Scanner** — **Polish**, imperative. "Skanuj", "Potwierdź", "Anuluj", "Zarejestruj", "Utwórz nowy LP".
- Status labels: desktop English (In Progress / Released / Done / On Hold / Planned), scanner Polish (W toku / Zwolnione / Gotowe / Wstrzymane / Zaplanowane).
- Never marketing. Never explain domain terms. Never say "please".

## 6 — Data-dense over decorative

- No gradients. No drop shadows beyond `--shadow-modal`. No rounded-pill hero sections.
- No marketing-style icon-plus-headline-plus-paragraph cards.
- Tables should have 20+ rows visible. KPI rows show 4–5 tiles. Forms should use `grid-template-columns: 1fr 1fr` to pack fields.
- Use `border-bottom: 3px solid var(--blue)` as the KPI's only decoration.

## 7 — Status the operator way

Every entity has a status badge. Use `.badge.badge-{color}` (desktop) or `.status.st-{state}` (scanner). The mapping:

| Entity | States |
|---|---|
| Work Order | Planned · Released · In Progress · On Hold · Completed |
| Purchase Order | Draft · Confirmed · Partially Received · Received · Invoiced · Overdue |
| LP | Available · Reserved · Blocked · Expiring · Expired |
| QA | Pending · Passed · Failed · Hold · Released |
| NCR | Open · In Progress · Closed |

Dot prefix convention: `●` = active/confirmed, `○` = pending/draft/archived, `◉` = in-progress-ish, `✓` = done, `⚠️` = warning/overdue.

## 8 — Always label it with a domain code

Every row, card, or detail header leads with the code in mono font: `WO-2025-0142`, `LP-00234`, `PO-1089`, `TO-0045`, `SO-2451`, `NCR-89`, `QH-23`. The product name is secondary. Operators find things by code, not name.

## 9 — Reach for the source before inventing

Before designing a new screen, grep `source/MONOPILOT-SITEMAP.html` and `source/SCANNER-PROTOTYPE.html` — almost every screen is already spec'd there. Your job is to execute the spec cleanly, not invent.

## 10 — When asked for variations

If the user asks for multiple options, vary ONE dimension at a time: e.g. table density, KPI arrangement, primary-action placement. Don't reinvent the chrome — the sidebar + topbar + card structure is locked.
