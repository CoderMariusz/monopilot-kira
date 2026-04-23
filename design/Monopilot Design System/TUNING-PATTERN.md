# Monopilot Prototype Tuning — Canonical Pattern

Polish pass reference. Every Monopilot module is retrofitted against the patterns below to match
the quality bar set by `agent-control-plane/prototypes/dashboard-v2-mock-tuned/`. This is not a
redesign — it is **polish + pattern lifting**. Do not alter data flow, modal contracts, or
information architecture.

---

## §1 Source

Based on `ACP v2-tuned README.md` (2026-04-23 iteration) which lifted from:

- Airflow / Prefect / Dagster / Temporal / Argo (orchestration refs)
- Linear / GHA / Vercel / Railway / Supabase / Cloudflare / Grafana / Sentry (modern ops refs)

Monopilot context differs from ACP: **desktop is light-first** (factory environment, readability),
only scanner is dark-first. So we do not blanket-apply dark palette — instead we lift the
**structural and behavioural** patterns (sparklines, tabs w/ counts, compact activity, GHA
auto-expand, sticky step headers, dry-run, empty states, tabular-nums everywhere, surface-level
contrast, semantic threshold pills). Dark-first is scoped to scanner only.

---

## §2 Design tokens — Monopilot polish overlay

Monopilot already defines tokens in `colors_and_type.css`. Tuning **adds** these missing tokens,
does not replace existing ones.

### 2.1 Surface layering (NEW — inspired by Linear "structure felt not seen")

```css
/* add to :root in colors_and_type.css */
--surface-0: var(--bg);        /* page background = #f8fafc */
--surface-1: #ffffff;           /* cards, panels */
--surface-2: #f1f5f9;           /* nested rows, sub-panels, inner wells */
--surface-3: #e2e8f0;           /* deepest, rarely used — e.g. sparkline track */
--border-soft: #eef1f5;         /* softer than --border, for nested dividers */
```

Rule: **prefer surface contrast over border**. Nested rows inside a card use `--surface-2` bg
instead of a second border. Keep `--border` for card outer edge only.

### 2.2 Semantic threshold tokens (NEW — single source for ok/warn/bad)

```css
--sem-ok:    var(--green);
--sem-warn:  var(--amber);
--sem-bad:   var(--red);
--sem-info:  var(--blue);
--sem-neutral: var(--gray-600);

--sem-ok-bg:    var(--green-050);
--sem-warn-bg:  var(--amber-050);
--sem-bad-bg:   var(--red-050);
--sem-info-bg:  var(--blue-050);
--sem-neutral-bg: var(--gray-050);
```

Use these in new code instead of raw `--green`/`--amber`/`--red`. Existing code that already
uses the raw tokens is fine — no search-and-replace churn required.

### 2.3 Sparkline track

```css
--spark-track: var(--surface-3);
--spark-ok:    var(--sem-ok);
--spark-warn:  var(--sem-warn);
--spark-bad:   var(--sem-bad);
```

### 2.4 Tabular numerics (global)

Add to `html, body` in `colors_and_type.css`:

```css
font-variant-numeric: tabular-nums;
```

Scanner module retains its own font stack; apply `tabular-nums` on numeric cells there explicitly.

---

## §3 Component tuning rules

### 3.1 Sparkline `<RunStrip/>`

Inline 8-outcome strip. Per-cell 3px wide, 12px tall, 1px gap. Colour per outcome token.
Place in `_shared/RunStrip.jsx`:

```jsx
<RunStrip outcomes={["ok","ok","warn","ok","bad","ok","ok","ok"]} max={8} />
```

Where it belongs:
- **Production** line card footer (today's hour OEE outcomes)
- **Reporting** KPI card footer (last 8 periods trend)
- **OEE** heatmap row summary column
- **Planning-ext** schedule run-history card
- **Quality** NCR trend per severity
- **Multi-site** lane health strip per site row
- **Maintenance** asset 8-PM outcomes

### 3.2 Tabs with count badges `<TabsCounted/>`

Sentry-style pre-categorised tabs. Number inside a pill next to label. Zero state = muted pill.

```jsx
<TabsCounted current="failed" tabs={[
  {key:"all", label:"All", count:312},
  {key:"failed", label:"Failed", count:4, tone:"bad"},
  {key:"running", label:"Running", count:2, tone:"info"},
  {key:"done", label:"Done", count:306, tone:"neutral"}
]} />
```

Where:
- **Planning** WO list (All / Draft / Released / Overdue)
- **Warehouse** LP list (All / Available / Reserved / Blocked / Expired)
- **Quality** NCR (All / Open / Invest / CAPA / Closed)
- **Shipping** SO list (All / Confirmed / Picking / Packing / Shipped / Held)
- **Finance** Variance (All / Favorable / Unfavorable / Critical)
- **Maintenance** mWO list (All / Requested / Open / In Progress / Overdue)
- **Multi-site** IST list (All / Queued / Running / Failed / Resolved)

### 3.3 GHA-style auto-expand failed/running in lists

Collapsible group rows where `status in {failed, running, overdue, hold}` default-expanded,
others default-collapsed. Applies to:
- **Production** today's WO list (running auto-expanded)
- **Planning-ext** run history (failed auto-expanded)
- **Quality** NCR (overdue auto-expanded)
- **Shipping** SO (held auto-expanded)
- **Maintenance** mWO (overdue auto-expanded)

### 3.4 Sticky step / form header

Long form or wizard — header (title + step indicator + primary action) becomes `position: sticky`
at scroll. Applies to:
- **NPD** Brief Detail (very long form), FA Detail
- **Technical** BOM Detail, Product Spec form
- **Planning** WO Detail, Cascade Detail
- **Scanner** flow screens (already sticky — confirm)
- **Quality** NCR Detail, Spec Detail
- **Maintenance** mWO Detail, Asset Detail

### 3.5 Compact events / activity feed `<CompactActivity/>`

Cloudflare invocation-grouped feed: events folded per correlation id (LP, WO, mWO), internal
events hidden by default. Applies to:
- **Production** dashboard live feed (group by WO)
- **Multi-site** replication lane events (group by lane)
- **Reporting** admin recent-runs
- **Maintenance** asset history tab (group by mWO)
- **Shipping** shipment timeline (group by SO)

### 3.6 Dry-run / preview CTA

Secondary button adjacent to primary destructive/commit action, shows preview modal before
commit. Applies to:
- **Planning-ext** Scheduler (Run → Dry-run)
- **Settings** Rules browser (Activate → Dry-run)
- **Planning** Cascade generate (Generate → Dry-run preview)
- **Multi-site** Push rule to sites (Publish → Dry-run / affected-sites preview)
- **Finance** Close period (Close → Preview variances)

### 3.7 Sidebar counter badges

Each sidebar nav item shows a count badge when non-zero. `--sem-bad` if overdue, `--sem-warn` if
pending, muted otherwise. Where:
- **All modules**: top-level sidebar — number of items needing attention on that module's
  dashboard. This is the single biggest shared polish.
- Specifically visible: NPD (open briefs), Planning (overdue WOs), Quality (open NCRs), Shipping
  (held SOs), Maintenance (overdue mWOs), Multi-site (failed IST).

### 3.8 Empty state primitive `<EmptyState/>`

Lives in `_shared/EmptyState.jsx`. Icon (emoji), title, body, optional CTA.

```jsx
<EmptyState icon="📦" title="No license plates yet"
  body="Register a new LP from the Scanner or import from D365."
  action={{label:"Register LP", onClick: ...}} />
```

Every list that can be empty (most) currently renders `<tbody></tbody>` or 0 rows with no
affordance. Add EmptyState to all list screens across modules. Expected ~40–60 insertion sites
total.

### 3.9 Surface-level contrast replacement

Audit CSS for these patterns and replace:
- Two borders separating nested elements → outer border + inner `background: var(--surface-2)`
- `.card` inside `.card` with two `1px solid var(--border)` → inner card gets bg `--surface-2`
  and `border: 0`
- List row `border-bottom: 1px solid var(--border)` → keep (that's correct), but group headers
  that use `border` + `background` double-styling → drop the border

### 3.10 tabular-nums coverage

Every numeric table cell, every KPI value, every variance amount, every time value gets
`font-variant-numeric: tabular-nums`. After the global rule in §2.4 this is automatic for text
but **must be explicitly present on any element that overrides `font-family` to monospace**.
Currently ~60% of modules use `.mono` class without tabular-nums.

### 3.11 "More filters" collapse

Any filter bar with >3 active filters collapses rest under a "More filters ▾" toggle. Current
state: most list screens render 5–8 filter dropdowns inline. Apply to:
- **Warehouse** LP list, Movement list
- **Planning** WO list, PO list
- **Quality** NCR, Hold list
- **Shipping** SO list, Shipment list
- **Finance** Variance screens
- **Reporting** filter panel

### 3.12 Status colour consistency

Audit every status pill across modules. Rules:
- `draft / pending` → neutral (`--sem-neutral-bg`)
- `active / running / picking / packing / in_progress` → info (`--sem-info-bg`)
- `done / completed / shipped / released / passed` → ok (`--sem-ok-bg`)
- `warning / partial / overdue-risk / short` → warn (`--sem-warn-bg`)
- `failed / overdue / held / blocked / quarantined / cancelled` → bad (`--sem-bad-bg`)

Shipping uses 12 status colours including custom greys — reduce to the 5 semantic tones where
possible. Quality uses 15 badge variants — consolidate duplicates (e.g., `.badge-pass` and
`.badge-released` are both green — keep both but make sure they use the shared token).

---

## §4 Tuning checklist (per module)

Each agent working a module MUST complete this 15-item checklist and tick each item in the
PR description.

1. [ ] `colors_and_type.css` global `font-variant-numeric: tabular-nums` applied? (one-time check)
2. [ ] Surface tokens `--surface-1/2/3` and `--border-soft` available? (one-time check)
3. [ ] Semantic threshold tokens `--sem-ok/warn/bad/info/neutral` available? (one-time check)
4. [ ] Dashboard has sidebar count badges where module has pending/overdue items
5. [ ] All list screens use `<TabsCounted/>` with at least `All / <priority> / <closed>`
6. [ ] List screens with failable rows have GHA-style auto-expand on failed/running/overdue
7. [ ] Long detail forms use sticky header (step indicator + title + primary CTA)
8. [ ] At least one surface replaced inner-border → `--surface-2` bg
9. [ ] Every list has `<EmptyState/>` rendering when zero rows
10. [ ] Numeric cells all use `.mono` + tabular-nums
11. [ ] Status pills use the 5-tone semantic palette (no per-module colour re-invention)
12. [ ] Filter bar with >3 filters collapsed under "More filters ▾"
13. [ ] If module has run-history / trend / per-period outcome → `<RunStrip/>` applied
14. [ ] If module has activity/event feed → `<CompactActivity/>` grouping applied
15. [ ] If module has a destructive or irreversible action → dry-run button added adjacent

---

## §5 Out of scope — DO NOT touch

- Data flow, `data.jsx` mock shape — keep byte-compatible
- Modal contract in `_shared/MODAL-SCHEMA.md` — any modal primitive change goes to the
  designated `_shared/` agent only
- Module feature additions (no new screens, no new flows)
- Moving files between modules
- Changing sidebar structure, sub-nav structure, URL hash routes
- Backlog items flagged P2 in BACKLOG.md — leave for real-code phase
- Scanner dark palette — do not light-ify it (it's intentionally dark for glare reduction on
  handhelds)
- Cell-state tokens (`--cell-locked`, `--cell-auto-derived`, `--cell-d365-*`) — MES-specific, keep
- Emoji icon choices — keep
- `source/MONOPILOT-SITEMAP.html` and `source/SCANNER-PROTOTYPE.html` — read-only

---

## §6 shadcn mapping (forward compatibility)

Real product will use shadcn/ui. Keep tuning primitives shape-compatible so the port is a
find-and-replace, not a rewrite.

| Prototype primitive | shadcn real counterpart |
|---|---|
| `<TabsCounted/>` | `<Tabs/>` + `<Badge/>` slot in `<TabsTrigger/>` |
| `<RunStrip/>` | custom — but wrap in shadcn `<TooltipProvider/>` per cell |
| `<EmptyState/>` | shadcn `<Card/>` variant; use `lucide` icon slot |
| `<CompactActivity/>` | shadcn `<Accordion/>` + `<Collapsible/>` |
| `<Modal/>` | Radix `<Dialog/>` via shadcn `<Dialog/>` |
| Sparkline SVG | `recharts` `<LineChart/>` with minimal axes OR keep inline SVG |
| Surface tokens | Tailwind `bg-muted` / `bg-card` / `bg-accent` — declared in `tailwind.config` |
| Semantic tokens | Tailwind `text-destructive` etc. — declared in `tailwind.config` |
| Tabular nums | Tailwind `tabular-nums` utility class |

Naming convention: match shadcn's kebab-case directory and PascalCase export. Future refactor
runs `codemod` from `<TabsCounted/>` → `<Tabs/>`.

---

## §7 PR / dispatch coordination

See `TUNING-PLAN.md` §4 for agent coordination rules. Summary:
- `_shared/` edits go through the designated Group C agent to avoid merge conflicts
- New shared primitives (`RunStrip`, `EmptyState`, `TabsCounted`, `CompactActivity`) live at
  `_shared/primitives.jsx` — created by Group C agent first, consumed by A + B
- Each agent rebases on `_shared/` changes before opening PR
- Do not commit — planning phase only; agents produce diffs for review

---

## §8 Done criteria

Module is "tuned" when:
- §4 checklist 15/15 ticked
- Smoke-test: module loads, all previously-working screens still render, no console errors
- Visual diff screenshot attached for at least 3 key screens (dashboard + 1 list + 1 detail)
- No change to `data.jsx` contents (hash-equal before/after)
- No change to any modal's `onConfirm` signature
- BACKLOG.md BL-*-TUNE items this wave addresses are crossed off with commit ref
