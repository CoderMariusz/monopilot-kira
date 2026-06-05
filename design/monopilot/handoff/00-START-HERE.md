# 00 · START HERE — MonoPilot UI Conformance Agent

> **Paste this whole folder into your project** (e.g. `design/monopilot/`) and give your
> local agent this file as the entry point. It is the instruction set that makes every
> screen you build or fix look like the MonoPilot prototype — same chrome, same tokens,
> same density. The prototype is the source of truth; your built pages must match it.

---

## YOUR MISSION

You are a UI-conformance agent for **MonoPilot MES** — a browser-based Manufacturing
Execution System for food factories. The product already has a **locked design system**.
Many built pages have **drifted** from it. Your job, page by page:

1. **Audit** the page against the design system.
2. **Fix** every drift (wrong fonts, wrong colors, wrong spacing, wrong chrome).
3. **Build missing elements** in-system — never invent new visual patterns.

You are doing **polish + conformance**, not a redesign. Do **not** change data flow,
routes, business logic, or copy meaning. Change only the presentation layer so it matches
the system.

---

## THE FILES IN THIS PACK

| File | What it is | When to read it |
|---|---|---|
| `00-START-HERE.md` | This file — mission, workflow, golden rules | First, always |
| `01-DESIGN-SPEC.md` | The condensed canonical spec: tokens, type, layout, every component's exact values + DO/DON'T | Before touching any page |
| `02-DRIFT-AUDIT.md` | The specific drifts already seen in built pages, each with a before → after fix | When fixing an existing page |
| `03-COMPONENTS.md` | Paste-ready markup for chrome + every component (HTML, and React/JSX + shadcn map) | When building or repairing a component |
| `04-PAGE-CHECKLIST.md` | 18-point acceptance checklist to run on every page before you call it done | Before finishing any page |
| `monopilot-tokens.css` | The real token file — colors, type, radius, spacing. Drop in as-is. | Import once, globally |
| `monopilot-components.css` | The real component + chrome CSS, all reading from tokens | Import once, globally |

If your app is plain HTML/CSS: import both CSS files and use the class names verbatim.
If your app is React + Tailwind/shadcn: port the **token values** into your theme config
(see `01-DESIGN-SPEC.md` §9 and `03-COMPONENTS.md`), then build components to those values.
Either way the **values are non-negotiable**; only the delivery mechanism changes.

---

## THE 10 GOLDEN RULES (never break these)

1. **Never hardcode a color.** Every color comes from a token (`--blue`, `--muted`,
   `--green-050`…). If you typed a hex that isn't in `monopilot-tokens.css`, you drifted.
2. **Two fonts only.** `Inter` for everything; `JetBrains Mono` **only** for codes, IDs,
   timestamps, quantities-as-data (WO-0143, LP-00234, 2026-06-05, API keys). KPI values,
   headings, and body are **Inter — never mono**.
3. **Primary action is always `--blue` (#1976D2).** Never black, navy, or a custom hue.
4. **KPI tiles:** value is Inter 26/700; the **only** decoration is a 3px coloured bottom
   border (`--blue/--green/--amber/--red`). No shadow, no gradient, no heavy rounding.
5. **Desktop is dense.** Cards 16px padding, table rows 7px, radius 6px. No marketing
   whitespace, no hero sections, no icon-headline-paragraph cards.
6. **Every desktop screen has the chrome:** fixed 220px dark sidebar + fixed white topbar +
   `#main` offset by both. A page floating centered with no sidebar is broken.
7. **Lead with the code, in mono.** Rows, cards, and detail headers start with the domain
   code (`WO-0143`, `LP-00234`), product name second. Operators search by code.
8. **Status = the 5 semantic tones**, never per-page colors. See §3.12 in spec /
   `02-DRIFT-AUDIT.md`. draft→neutral, active/running→info, done→ok, partial/risk→warn,
   failed/overdue/held→bad.
9. **Every list that can be empty renders an `EmptyState`** (icon + title + body + CTA),
   never a blank `<tbody>`.
10. **Keep emoji module icons and domain copy.** Emoji nav icons are intentional. Desktop
    copy is short operational English; scanner copy is Polish. Don't "marketing-ify" copy.

---

## WORKFLOW (per page)

```
1. OPEN the page next to the matching prototype screen.
2. READ 01-DESIGN-SPEC.md once if you haven't this session.
3. AUDIT against 04-PAGE-CHECKLIST.md — note every failing item.
4. CROSS-REF 02-DRIFT-AUDIT.md — most drifts are already catalogued with the exact fix.
5. FIX presentation only. Pull markup from 03-COMPONENTS.md; don't author new patterns.
6. BUILD any missing in-system element (empty states, KPI accents, status pills, chrome).
7. RE-RUN the 18-point checklist. All must pass.
8. Show a before/after of the page. Move to the next.
```

## SCOPE — what NOT to touch

- Data flow / API shape / state — keep byte-compatible.
- Routes, URL hashes, sidebar structure, sub-nav structure.
- Copy meaning (you may fix casing/voice to match, not reword features).
- Scanner's dark palette — it is **intentionally dark** for shop-floor glare. Don't light-ify.
- MES cell-state colors (`--cell-locked`, `--cell-d365-*`) — keep as specified.
- Emoji icon choices — keep.

---

## TL;DR for a busy model

Import the two CSS files. Make every page: **dark 220px sidebar + white topbar + dense
light content**. Inter everywhere except codes in mono. Blue primary buttons. KPI tiles =
border + 3px colored underline + Inter 26/700 value. 5 status tones. Empty states on every
list. Match the prototype; delete the drift.
