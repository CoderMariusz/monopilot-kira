# MonoPilot Design System

A complete design system for **MonoPilot MES** — a multi-tenant Manufacturing Execution System for food-production companies (Forz Dairy, Kobe Dairy, etc.). Extracted from the UX specs in `design/` and the two prototype HTML files in `source/`.

---

## CONTEXT

**What MonoPilot is.** A browser-based MES covering the full factory lifecycle: Technical (products, BOMs, routings), Planning (suppliers, POs, WOs, MRP), Production (WO execution, yields, waste), Warehouse (LP tracking, GRNs, movements), Scanner (mobile shop-floor app), Quality (specs, holds, NCRs, HACCP), Shipping (SOs, picking, packing), plus premium add-ons: NPD, Finance, OEE, Integrations, Reporting, Multi-Site, Maintenance.

**Who uses it.**
- **Desktop** — plant managers, planners, QA, technical, buyers. Sidebar nav + dense tables + KPI dashboards. Light theme.
- **Mobile scanner** — operators on the shop floor, warehouse pickers. Large tap targets, barcode scanning, Polish UI copy, single-task flows. **Dark theme** (glare reduction, matches rugged handheld devices).

**Tenants.** The first live tenant is **Forz** (dairy); **Kobe Dairy** is referenced in multi-tenant screens. The system is white-label — no tenant branding in chrome, just a wordmark.

**Voice.** Operational, not marketing. Terms like *License Plate (LP)*, *Work Order (WO)*, *Purchase Order (PO)*, *Transfer Order (TO)*, *Goods Receipt Note (GRN)*, *Bill of Materials (BOM)*, *Batch*, *Yield*, *OEE*, *HACCP*, *CCP*, *NCR*, *SSCC*, *GS1-128* are used without explanation — the audience is factory staff who know them. Copy is short, imperative, data-dense.

---

## VISUAL FOUNDATIONS

### Two modes — same tokens

MonoPilot has **two surfaces that share the same blue + status palette** but invert the background:

| | Desktop (light) | Scanner (dark) |
|---|---|---|
| Page bg | `#f8fafc` | `#0f172a` |
| Card bg | `#ffffff` | `#1e293b` |
| Sidebar / Topbar | `#1e293b` (dark rail on light page) | `#1e293b` (topbar blends) |
| Primary text | `#1e293b` | `#f1f5f9` |
| Muted text | `#64748b` | `#64748b` |
| Border | `#e2e8f0` | `#334155` |

The same `--blue`, `--green`, `--amber`, `--red`, `--info` are used in both — they contrast correctly against either background. Status badges get dark variants in scanner mode (e.g. `st-inprog` = `#431407` bg + `#fb923c` text) but the semantic color is the same.

### Typography

- **Inter**, 400 / 500 / 600 / 700.
- **JetBrains Mono** for LP numbers, PO/WO IDs, API keys, codes — anything scanned or copied.
- Scale: see `colors_and_type.css`. Body 14px, table cell 13px, label 12px, badge 11px, KPI value 26px.

### Color — semantic mapping

```
blue    primary action, selected nav, KPI default, info
green   success, active, on-time, pass
amber   warning, partial, draft, pending, overdue-risk
red     error, critical, overdue, hold, blocked
gray    neutral, inactive, archived
```

MES-specific cell colors (from NPD PRD §7.2, in `colors_and_type.css`):
- `--cell-locked` — blocking rule not met
- `--cell-auto-derived` — read-only computed value
- `--cell-d365-found` / `--cell-d365-nocost` / `--cell-d365-missing` — ERP integration states
- `--cell-row-ready` / `--cell-row-alert` — row-level production state

### Spacing & shape

- Radius: `6px` cards, `4px` inputs/buttons, `8px` modals, `10px` badges (pill), `12px` mobile cards.
- Sidebar: `220px`. Settings sub-nav: `256px`. Mobile device frame: `390px`.
- 8px soft grid. Table row padding `7px 10px`. Card padding `16px`.

### Iconography

The source prototypes use **emoji** for module icons (🏭 💡 ⚙️ 🔧 📅 📦 📱 ✅ 🚚 💰 📊 🔗 📈 🏢 🔩). This is a deliberate early-stage choice — easy to read, works on every platform, no icon font to load. **Keep using emoji** until the product is ready to commission a proper icon set.

For smaller UI affordances (caret, close, chevron) use text glyphs: `›  ←  ↕  ✓  ⋮  ×`.

---

## FILE INDEX

### Foundation
- `colors_and_type.css` — every token (color, type, radius, shadow, spacing, cell states)
- `README.md` — this file
- `SKILL.md` — how to use this system when generating new screens

### Design system previews
- `components.html` — buttons, badges, inputs, KPIs, cards, tables, pills, tabs, alerts (desktop light)
- `patterns.html` — sidebar, topbar, breadcrumbs, modal shell, timeline, wizard steps, kanban (desktop light)
- `scanner-kit.html` — mobile/dark variant: device frame, bottom-up menu, scan input, WO card, component row, LP card
- `example-screen.html` — full Planning · Work Orders screen composed from the kit

### Source material (do not edit)
- `design/01-NPD-UX.md` — NPD module UX spec
- `design/02-SETTINGS-UX.md` — Settings module UX spec
- `design/03-TECHNICAL-UX.md` — Technical module UX spec
- `design/04-PLANNING-BASIC-UX.md` — Planning module UX spec
- `source/MONOPILOT-SITEMAP.html` — complete sitemap prototype (every screen, every modal)
- `source/SCANNER-PROTOTYPE.html` — scanner mobile prototype (every flow, every screen)

---

## HOW TO USE THIS KIT

1. Import `colors_and_type.css` at the top of any new HTML.
2. Pick your surface: desktop (light, sidebar + main) or scanner (dark, 390px device frame).
3. Compose from `components.html` + `patterns.html` (desktop) or `scanner-kit.html` (mobile).
4. When in doubt, open the matching screen in `source/MONOPILOT-SITEMAP.html` or `source/SCANNER-PROTOTYPE.html` — every screen is there.
5. Keep copy short and operational. Use domain terms (LP, WO, BOM) without explanation.
