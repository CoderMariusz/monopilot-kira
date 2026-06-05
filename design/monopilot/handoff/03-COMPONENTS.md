# 03 · COMPONENTS — paste-ready markup

Copy these verbatim. Class names match `monopilot-components.css`. For React, the same
structure applies — swap `class` → `className` and map handlers. A shadcn mapping is at the
end of each major block.

Import order in any HTML page:
```html
<link rel="stylesheet" href="monopilot-tokens.css">
<link rel="stylesheet" href="monopilot-components.css">
```

---

## §1 Page shell (chrome) — every desktop screen

```html
<div id="sidebar">
  <div class="sidebar-logo">MonoPilot <span>MES · Apex</span></div>

  <div class="sidebar-group">Core</div>
  <div class="sidebar-item">🏠 Dashboard</div>
  <div class="sidebar-item">⚙️ Settings</div>
  <div class="sidebar-item">🔧 Technical</div>

  <div class="sidebar-group">Operations</div>
  <div class="sidebar-item active">📅 Planning</div>
  <div class="sidebar-item">🏭 Production</div>
  <div class="sidebar-item">📦 Warehouse</div>
  <div class="sidebar-item">📱 Scanner</div>

  <div class="sidebar-group">QA &amp; Shipping</div>
  <div class="sidebar-item">✅ Quality</div>
  <div class="sidebar-item">🚚 Shipping</div>

  <div class="sidebar-group">Premium</div>
  <div class="sidebar-item">💡 NPD <span class="sidebar-count bad">2</span></div>
  <div class="sidebar-item">💰 Finance</div>
  <div class="sidebar-item">📊 OEE</div>
  <div class="sidebar-item">🔗 Integrations</div>
</div>

<div class="topbar">
  <div class="search"><input placeholder="Search WO, PO, LP, product…"></div>
  <div class="spacer"></div>
  <span class="badge badge-amber">🛎 3 alerts</span>
  <div class="avatar">JK</div>
</div>

<div id="main">
  <div class="breadcrumb"><a href="#">Planning</a> / Work Orders</div>
  <div class="page-title">Work Orders</div>
  <div class="muted" style="font-size:12px;margin-bottom:16px">
    Schedule, release, and track WOs across production lines.
  </div>
  <!-- kpi-row, alerts, cards… -->
</div>
```

Rules: sidebar is fixed 220px dark; topbar fixed white 48px; `#main` is offset by both and
content is **left-aligned full-width** (never a centered max-width column).

---

## §2 KPI row

```html
<div class="kpi-row">
  <div class="kpi">
    <div class="kpi-label">Active Work Orders</div>
    <div class="kpi-value">12</div>
    <div class="kpi-change muted">3 lines</div>
  </div>
  <div class="kpi green">
    <div class="kpi-label">Avg Yield</div>
    <div class="kpi-value">91.2%</div>
    <div class="kpi-change" style="color:var(--green)">↑ 0.8%</div>
  </div>
  <div class="kpi amber">
    <div class="kpi-label">Pending Release</div>
    <div class="kpi-value">6</div>
    <div class="kpi-change" style="color:var(--amber)">Awaiting BOM approval</div>
  </div>
  <div class="kpi red">
    <div class="kpi-label">Behind</div>
    <div class="kpi-value">1</div>
    <div class="kpi-change" style="color:var(--red)">WO-0139 · 2h late</div>
  </div>
</div>
```

`.kpi-value` is Inter 26/700. The colored class drives the 3px underline + the change color.
**Never** wrap the value in `<code>`/mono. **Never** add a shadow.

---

## §3 Card + table

```html
<div class="card" style="padding:0">
  <div class="card-head" style="padding:16px 16px 12px">
    <div style="display:flex;align-items:center;gap:16px">
      <div class="card-title">All Work Orders</div>
      <div class="pills">
        <span class="pill on">All</span>
        <span class="pill">Today</span>
        <span class="pill">This Week</span>
        <span class="pill">Behind</span>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary">Export</button>
      <button class="btn btn-primary">+ Create WO</button>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>WO # ↕</th><th>Product ↕</th><th>BOM</th><th>Qty</th><th>Line</th>
      <th>Scheduled</th><th>Progress</th><th>Status</th><th>Priority</th><th>Actions</th>
    </tr></thead>
    <tbody>
      <tr>
        <td class="mono">WO-0143</td>
        <td>Chicken Nuggets 1kg</td>
        <td>v3</td><td>500 kg</td><td>Line 1</td><td>Dec 16 · 08:00</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="bar-track"><div class="bar-fill ok" style="width:36%"></div></div>
            <span class="mono" style="font-size:11px">36%</span>
          </div>
        </td>
        <td><span class="badge badge-amber">● In Progress</span></td>
        <td><span class="badge badge-red">High</span></td>
        <td style="color:var(--muted)">✏️ ⋮</td>
      </tr>
    </tbody>
  </table>
</div>
```

Lead each row with the **code in `.mono`**. Progress bar uses `.bar-track` + `.bar-fill.ok|warn|bad`.

---

## §4 Buttons

```html
<button class="btn btn-primary">+ Create Work Order</button>   <!-- blue -->
<button class="btn btn-secondary">Export CSV</button>          <!-- white + border -->
<button class="btn btn-success">Release</button>               <!-- green -->
<button class="btn btn-danger">Cancel Order</button>           <!-- red -->
<button class="btn btn-secondary btn-icon">⋮</button>
<button class="btn btn-primary btn-lg">Approve PO</button>     <!-- detail-page primary -->
```

---

## §5 Status badges (5 tones + lifecycle glyphs)

```html
<span class="badge badge-green">● Active</span>
<span class="badge badge-blue">● Released</span>
<span class="badge badge-amber">● In Progress</span>
<span class="badge badge-gray">○ Planned</span>
<span class="badge badge-red">⚠ Overdue</span>
<span class="badge badge-green">✓ Completed</span>
```

Glyphs: `●` active/confirmed · `○` pending/draft/archived · `◉` reserved/in-progress ·
`✓` done · `⚠` warning/overdue.

---

## §6 Alerts

```html
<div class="alert alert-red"><div class="alert-title">WO-0139 behind schedule</div>
  Pork Sausages · Line 2 · expected 14:30, now 16:30.</div>
<div class="alert alert-amber"><div class="alert-title">Material shortage forecast</div>
  WO-0145 needs 450 kg Chicken Breast; 420 kg reserved.</div>
<div class="alert alert-blue"><div class="alert-title">MRP suggestion</div>
  18 suggested POs based on WO demand + safety stock.</div>
```

---

## §7 Empty state (every list that can be empty)

```html
<div class="empty-state">
  <div class="empty-state-icon">📦</div>
  <div class="empty-state-title">No license plates yet</div>
  <div class="empty-state-body">Register a new LP from the Scanner or import from D365.</div>
  <div class="empty-state-action"><button class="btn btn-primary">Register LP</button></div>
</div>
```

---

## §8 TabsCounted (list-screen filter tabs)

```html
<div class="tabs-counted">
  <button class="tabs-counted-tab active"><span>All</span><span class="tabs-counted-pill">16</span></button>
  <button class="tabs-counted-tab"><span>Finished articles</span><span class="tabs-counted-pill tone-info">7</span></button>
  <button class="tabs-counted-tab"><span>Intermediate</span><span class="tabs-counted-pill tone-neutral">3</span></button>
  <button class="tabs-counted-tab"><span>Raw materials</span><span class="tabs-counted-pill tone-neutral">4</span></button>
</div>
```

---

## §9 Form (modal / detail)

```html
<div class="ff-inline">
  <div class="ff">
    <label>Company Name <span class="req">*</span></label>
    <input value="Apex Sp. z o.o.">
  </div>
  <div class="ff">
    <label>Timezone <span class="req">*</span></label>
    <select><option>Europe/Warsaw</option></select>
  </div>
</div>
<div class="ff">
  <label>Notes</label>
  <textarea placeholder="Internal notes, not printed on PO…"></textarea>
</div>
```

---

## §10 Modal shell

```html
<div class="modal-overlay">
  <div class="modal-box">
    <div class="modal-head">
      <div class="modal-title">Create Work Order</div>
      <button class="modal-close">×</button>
    </div>
    <div class="modal-body"><!-- .ff fields / .wiz-stepper --></div>
    <div class="modal-foot">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-primary">Create</button>
    </div>
  </div>
</div>
```

---

## §11 React / shadcn equivalents

| Prototype class | React/shadcn |
|---|---|
| `#sidebar` / `.topbar` | layout shell components; tokens via `tailwind.config` |
| `.kpi` | `<Card>` with `border-b-[3px]` accent + `text-[26px] font-bold` value (NOT `font-mono`) |
| `.btn-primary` | `<Button>` default variant, `bg-blue text-white` |
| `.badge-*` | `<Badge variant="…">` mapped to the 5 tones |
| `.tabs-counted` | `<Tabs>` + `<Badge>` inside each `<TabsTrigger>` |
| `.empty-state` | `<Card>` empty variant + lucide icon (or keep emoji) |
| `.modal-*` | `<Dialog>` / `<DialogContent>` / `<DialogFooter>` |
| `.alert-*` | `<Alert>` with left-border + tinted bg per tone |

Keep prop shapes identical to the prototype primitives so the port stays find-and-replace,
not a rewrite. **The token values are fixed regardless of framework.**
