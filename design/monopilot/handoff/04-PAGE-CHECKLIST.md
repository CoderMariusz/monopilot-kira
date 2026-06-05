# 04 · PAGE CHECKLIST — run before calling any page "done"

18 points. A page conforms only when **every** box is ticked. Paste this into your PR / commit
description for each page and check it off. If an item is genuinely not applicable, mark `N/A`
with a one-line reason — don't silently skip.

---

## Tokens & color
- [ ] **1.** No hardcoded hex in markup or styles — every color is a token from `monopilot-tokens.css`.
- [ ] **2.** Primary action is `--blue` (#1976D2). No black/navy/custom-hue buttons.
- [ ] **3.** No gradients anywhere. No card drop shadows (shadows only on modals).
- [ ] **4.** Status colors use the 5 semantic tones only (neutral / info / ok / warn / bad).

## Type
- [ ] **5.** Body & headings are **Inter**; nothing in a stray system/Roboto/Arial font.
- [ ] **6.** Codes, IDs, timestamps, ref hashes are in **`.mono`** (JetBrains Mono).
- [ ] **7.** No headline/KPI number in monospace. KPI value = Inter 26/700.
- [ ] **8.** Numerics align (tabular-nums present, incl. on any mono override).

## Chrome & layout
- [ ] **9.** Fixed 220px dark `#sidebar` present, with groups and an `.active` item.
- [ ] **10.** Fixed white `.topbar` present; `#main` offset by sidebar + topbar.
- [ ] **11.** Content is left-aligned, full-width in `#main` — not a centered max-width column.
- [ ] **12.** `.breadcrumb` + `.page-title` (20/700) + one-line `.muted` description at the top.
- [ ] **13.** Primary action sits top-right of the page/card header.

## Components
- [ ] **14.** KPI tiles use `.kpi` (+ semantic class) with the 3px coloured bottom accent; 6px radius; no shadow.
- [ ] **15.** Tables are dense (th 8/10, td 7/10, 13px), rows lead with the code in `.mono`, hover state present.
- [ ] **16.** Every list that can be empty renders an `EmptyState` (not a blank `<tbody>`).
- [ ] **17.** Cards use a single 1px `--border`; nested panels use `--surface-2` bg, not a 2nd border.
- [ ] **18.** Badges/alerts/forms/modals match `03-COMPONENTS.md` markup and tones.

---

## Conditional (tick if the page has the feature)
- [ ] List screen with categories → uses `TabsCounted` (`All / <priority> / <closed>`).
- [ ] List with failable rows → GHA-style auto-expand on failed/running/overdue.
- [ ] Long detail form → `.sticky-form-header` keeps title + step + primary CTA pinned.
- [ ] Trend / per-period data → `RunStrip` sparkline in the footer.
- [ ] Activity/event feed → `CompactActivity` grouping (folded per correlation id).
- [ ] Destructive action fanning out to many objects → `DryRunButton` preview before commit.
- [ ] Module has overdue/pending items → sidebar count badge on the nav item.
- [ ] Filter bar with >3 filters → collapses extras under "More filters ▾".

---

## Smoke test (do this last)
- [ ] Page loads with **zero console errors**.
- [ ] All previously-working interactions still work (no logic/data change).
- [ ] Side-by-side with the matching prototype screen, the chrome, density, and color read identically.
- [ ] A teammate could not tell which is the prototype and which is your build.

> If the final box fails, you drifted somewhere above. Re-walk items 1–18.
