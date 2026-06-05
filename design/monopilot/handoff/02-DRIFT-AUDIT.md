# 02 · DRIFT AUDIT — what's broken and how to fix it

These are the real drifts observed in built pages. Each has a **symptom → cause → fix**.
When you open a page, scan this list first — most of what's wrong is already here. The fix
column gives the exact token/class to apply (from `monopilot-components.css`).

The reference page that is **correct** is the Technical → Products list (sidebar + breadcrumb +
TabsCounted + filters + dense table + mono codes + status badges). When unsure, make the page
look like that one.

---

## A. The big offenders (seen on the Technical Dashboard build)

### A1 · KPI value rendered in monospace
- **Symptom:** "No sync yet", "2", "0" in the KPI tiles render in a typewriter/mono font.
- **Cause:** the KPI value inherited `font-family: mono` (or a global `code`/`pre` rule).
- **Fix:** KPI value is **Inter 26/700**. Use `.kpi-value` (it sets `font-family: var(--font-sans)`).
  Mono is ONLY for codes/IDs/timestamps — never headline numbers.

```html
<!-- ✗ drift -->            <!-- ✓ fixed -->
<div class="kpi">           <div class="kpi">
  <div class="kpi-label">D365 SYNC STATUS</div>
  <code>No sync yet</code>    <div class="kpi-value">No sync yet</div>
</div>                        <div class="kpi-change muted">Latest synchronisation job</div>
                            </div>
```

### A2 · KPI tiles have no 3px coloured bottom accent
- **Symptom:** KPI cards are plain bordered boxes with rounded corners + soft shadow.
- **Cause:** built as generic cards; the system's KPI signature (bottom accent) was dropped.
- **Fix:** add `border-bottom: 3px solid <semantic>` via `.kpi` (blue default) / `.kpi.green`
  / `.kpi.amber` / `.kpi.red`. **Remove the drop shadow.** Radius stays 6px (not 12–16px).

### A3 · Primary button is black / dark-navy
- **Symptom:** "Create item" renders as a near-black pill.
- **Cause:** a default/neutral button style instead of the brand primary.
- **Fix:** primary = `.btn-primary` → `background: var(--blue)` (#1976D2), white text. The
  ONLY black surface in the product is the sidebar. Buttons are blue, secondary are white.

```html
<button class="btn btn-primary">Create item</button>   <!-- blue, not black -->
<button class="btn btn-secondary">New BOM</button>      <!-- white + border -->
```

### A4 · No sidebar / page floats centered
- **Symptom:** content is centered in the viewport with big empty gutters, no nav rail.
- **Cause:** the desktop chrome was never applied.
- **Fix:** every desktop screen = fixed `#sidebar` (220px, `--sidebar`) + fixed `.topbar` +
  `#main { margin-left: 220px; padding: 72px 24px 40px }`. Markup in `03-COMPONENTS.md` §1.
  Content is **left-aligned and full-width** inside `#main`, never centered with max-width.

### A5 · Marketing whitespace / airy cards
- **Symptom:** oversized padding, big gaps, "Items / Bills of materials / Allergens" feel
  like landing-page feature cards.
- **Cause:** generic card spacing, not MES density.
- **Fix:** card padding 16px; section gaps 12px; use a real grid of dense tiles, not
  hero-style cards. Desktop is **data-dense**: 20+ table rows visible, 4–5 KPI tiles per row.

---

## B. Color & token drift

| Symptom | Fix |
|---|---|
| Hardcoded hex anywhere (`#2563eb`, `#0f172a`, `#000`…) | Replace with the matching token (`var(--blue)`, `var(--sidebar)`…). If no token matches, you picked the wrong color. |
| Indigo/violet/teal accents | Not in palette. Primary is `--blue #1976D2`. Remove other accent hues. |
| Custom status colors per page (12+ greys, bespoke greens) | Collapse to the **5 semantic tones** (neutral/info/ok/warn/bad). See spec §7. |
| Card drop shadows | Remove. Cards = 1px `--border` only. Shadow exists solely for modals (`--shadow-modal`). |
| Gradients (buttons, headers, KPI) | Remove all. The system has zero gradients. |

---

## C. Typography drift

| Symptom | Fix |
|---|---|
| Body/headings in system-ui / Roboto / Arial | Load and use **Inter** (`--font-sans`). |
| Codes/IDs in a sans font | Wrap in `.mono` (`--font-mono` JetBrains Mono): `WO-0143`, `LP-00234`, ref hashes, timestamps. |
| Headline numbers in mono (see A1) | Inter. Mono is data-only. |
| Numbers jitter in columns | `font-variant-numeric: tabular-nums` (global; re-declare on any mono override). |
| Page title too big/small | H1 = 20/700 (`.page-title`); settings dashboards 24/700. |

---

## D. Layout & chrome drift

| Symptom | Fix |
|---|---|
| Missing breadcrumb | Add `.breadcrumb` above the H1: `Technical / Dashboard` (links blue, separator muted). |
| No one-line page description | Add a 12px `.muted` line under the H1. |
| Primary action buried / bottom of page | Move to **top-right of the card head** (or page header). |
| Sidebar item has no active state | Active item = `.sidebar-item.active` (blue-900 bg + 3px blue left border). |
| Sidebar groups missing | Group headings (`.sidebar-group`): Core / Operations / QA & Shipping / Premium. |
| Module needs a count badge (overdue/pending) | Add `.sidebar-count.bad|warn|neutral` on the nav item. |

---

## E. Component-pattern drift

| Symptom | Fix |
|---|---|
| Empty list shows blank area / "no data" text | Use `EmptyState` (icon + title + body + CTA). Never an empty `<tbody>`. |
| Plain tabs where counts matter | Use `TabsCounted` with `All / <priority> / <closed>` + tone pills. |
| Long detail form with header scrolling away | Apply `.sticky-form-header` (title + step indicator + primary CTA stay pinned). |
| Nested panel uses a second border | Use `background: var(--surface-2); border: 0` instead (surface contrast > border). |
| Filter bar with 5–8 inline dropdowns | Keep 3 visible, collapse rest under "More filters ▾". |
| Trend / per-period data with no glanceable viz | Add `RunStrip` (8-cell sparkline) in the card/row footer. |
| Destructive action that fans out to many objects | Add `DryRunButton` (preview affected objects) next to the commit button. |

---

## F. Quick self-test (if any answer is "yes", you've drifted)

1. Is there a hex literal in the markup/styles that isn't a token? 
2. Is a headline/KPI number in a monospace font? 
3. Is the primary button anything other than `--blue`? 
4. Does a card have a drop shadow or a gradient? 
5. Is the desktop page missing the sidebar or the topbar? 
6. Does a KPI tile lack its 3px coloured underline? 
7. Is an empty list rendering nothing instead of an `EmptyState`? 
8. Are status colors invented per-page instead of the 5 tones? 

Fix every "yes" before moving on.
