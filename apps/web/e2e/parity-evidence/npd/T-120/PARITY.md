# T-120 BriefDetailForm — parity evidence

Prototype anchor (verified): `prototypes/design/Monopilot Design System/npd/brief-screens.jsx:84-231` (`BriefDetail`).
File length: 245 lines (`wc -l`) — anchor in range. Index entry: `prototype-index-npd.json#brief_detail` (lines "84-231").

Production components:
- `apps/web/app/[locale]/(app)/(npd)/brief/[briefId]/page.tsx` (RSC loader, real data via withOrgContext/RLS; no mocks)
- `apps/web/app/[locale]/(app)/(npd)/brief/[briefId]/_components/brief-detail-form.tsx` (client; RHF + useFieldArray)

Dependencies wired (imported, not authored): `saveBriefDraft` (T-031, merged) — `apps/web/app/(npd)/brief/actions/save-brief-draft.ts`.

## Structural mapping (prototype JSX region -> production)

| Prototype (brief-screens.jsx) | Region | Production translation |
|---|---|---|
| 106-131 | sticky-form-header: breadcrumb + dev_code + product_name + template/status badges + Save draft / Mark complete / Convert buttons | `<header>` breadcrumb `nav` + `font-mono` dev_code + h1 product_name + `Badge` template + `Badge data-testid="brief-status-badge"`; Save draft `Button` + Mark complete `Button` (copy "Complete brief for project") |
| 133-137 | converted `alert-green` "converted to <fa> … View FA" | `role="status"` green alert, `convertedNotice` i18n with `{fa}`, "View project" link to `/npd/pipeline/{npdProjectId}` (project, NOT FA Core) |
| 139-142 | subnav-inline: Product details / Packaging | accessible `role="tablist"` of 2 `role="tab"` (`brief-tab-product` / `brief-tab-packaging`) + `role="tabpanel"` (radix kept inside packages/ui per red-line) |
| 144-161 | Section A card: Product / Volume / Dev Code (+V08 help) / Packs per case / Benchmark / Comments | `Card data-testid="brief-section-a"`; 13 `brief-field` controls = 6 product-grid fields + 7 summary-line aggregate fields (brief_lines `product`+`summary` columns); Dev Code FormDescription = V08 hint |
| 163-201 | Multi components table + Total row + weightMismatch `alert-amber` | `Table` w/ `useFieldArray` rows (`component-row`); `component-total-row` with `component-total-weight`; destructive `Badge data-testid="weight-mismatch-badge"` + `role="alert"` body (V-NPD-BRF-001) |
| 205-224 | Section B card: C14-C20 (7 fields, C16/C19 fa-mapping help) | `Card data-testid="brief-section-b"`; 7 `packaging-field` `Input`s; C16/C19 hints as FormDescription |
| 225-238 | Fields C21-C37 card: "Phase B.2 rescan pending" badge + alert-blue + C21-C29 disabled placeholders | `packaging_ext` jsonb -> `<dl data-testid="packaging-ext">` KeyValue list (`packaging-ext-row`); 9 disabled `packaging-tbd-field` inputs each flagged with a `TBD` Badge |

## AC mapping
1. **AC#1 parity** — Section A = 13 fields, Section B = 7 explicit + packaging_ext KeyValue list, shadcn Tabs+Form+Input. Verified by RTL (`brief-detail-form.test.tsx` "13 fields", "7 explicit + packaging_ext", tabs) + DOM artifacts (`populated.html`: brief-field x13, packaging-field x7, packaging-ext-row x2).
2. **AC#2 weight mismatch** — destructive `Badge` "Weight mismatch" inline when component-weight delta exceeds tolerance. Verified by RTL + `weight-mismatch.html`.
3. **AC#3 Mark complete** — CTA copy "Complete brief for project"; on success routes to the linked Stage-Gate project (`onNavigateToProject(npdProjectId)`), never FA Core. Verified by RTL ("routes to the linked project").
4. **AC#4 evidence** — per-state DOM artifacts + this PARITY (parity diff + deviation log) below.

## Real-data wiring
- `page.tsx` reads `public.brief` (header, status/template/dev_code + linked project/fa code) and `public.brief_lines` (product line, summary line, component lines, packaging) via `withOrgContext` (RLS `app.current_org_id()` as `app_user`). No mocks, no hardcoded rows.
- NUMERIC columns (`volume`, `weights`, `pct`, `base_web_price`, `sleeve_carton_price`) are cast `::text` and carried as decimal STRINGS — never float-coerced in the loader. The inline weight-mismatch check uses fixed-point micros (BigInt), mirroring `saveBriefDraft`'s server-side tolerance.
- Save draft maps the RHF form to the `saveBriefDraft` line model (product + summary + N component lines).
- RBAC: `npd.brief.read` -> `permission_denied`; `npd.brief.write` -> `canWrite` gates Save/Mark/Add/Remove server-side (no render-then-disable leak).

## Required UI states (per-state DOM captured here)
loading.html · empty.html · populated.html · error.html · permission_denied.html · weight-mismatch.html · converted.html.
(Optimistic feedback: Save shows `Saving…` then `Draft saved.` / error `role=alert` — exercised by the "Save draft … optimistically" RTL test.)

## a11y
- Every field has an explicit `<label htmlFor>`; inline table inputs use `aria-label`.
- Tabs: `role="tablist"/"tab"/"tabpanel"` with `aria-selected`/`aria-controls`/`aria-labelledby` and roving `tabIndex`.
- Table headers carry `scope="col"`; icon-only remove button has `aria-label`.
- State notices use `role="status"`/`role="alert"` with `aria-live`; converted notice is `role="status"`.
- Status conveyed by Badge text + variant (never color alone); weight-mismatch is Badge text + `role="alert"` body.

## Deviation log
1. **Section A renders 13 fields** to satisfy AC#1. The prototype's Section A grid shows 6 (Product/Volume/Dev Code/Packs per case/Benchmark/Comments); the remaining 7 are the brief_lines `summary` aggregate columns (Component/Slice count/Supplier/Code/Price/Weight/%) that carry the summary line used by the V-NPD-BRF-001 weight check. Surfaced as a labelled grid within Section A rather than invented fields — backed by real `brief_lines` summary-line columns.
2. **Tabs use an accessible role=tab tablist** rather than `@radix-ui/react-tabs` directly. Reason: `@radix-ui/*` is restricted to `packages/ui` (Foundation ESLint rule) and `TabsCounted` requires per-tab counts the prototype subnav does not have; the in-component tablist matches the repo's existing FaTabs parity pattern and keeps the radix/app boundary.
3. **Mark complete Server Action is owned by parent slice T-034 and not yet merged.** The CTA copy + project-routing behaviour is fully implemented and parity-tested in the client (`onMarkComplete` + `onNavigateToProject`); the button is rendered only when the action is provided. `page.tsx` wires only `saveBriefDraft` (the merged T-031 dependency) and passes `onMarkComplete` the moment that action lands. Documented, not silently dropped (red-line "do not bypass saveBriefDraft", "do not route to FA Core" both honoured).
4. **C21-C37 placeholders** are disabled inputs flagged with a `TBD` Badge (prototype "Phase B.2 rescan pending"); the live `packaging_ext` jsonb is additionally rendered as a real KeyValue list when present. Scaffold for Phase B.2, no FA mapping.
5. **Playwright browser parity is sibling task T-122's scope** (T-120 out_of_scope) and needs a running Next server + Supabase auth + seeded brief rows (module Gate-5). Per UI-PROTOTYPE-PARITY-POLICY, the RTL/DOM-snapshot harness (`brief-detail-form.evidence.test.tsx`) provides the per-state fallback evidence; live click-through is captured at the NPD module Gate-5 sign-off.

## axe
No automated axe run at the component-task layer: `axe-core`/`@axe-core/playwright` is not a repo dependency and a browser is unavailable here (same Playwright/server blocker as deviation #5). a11y baseline enforced structurally (labels, tab roles, scope, text-not-color, aria-live) and asserted in RTL. axe-clean to be confirmed at NPD module Gate-5.
