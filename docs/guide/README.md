# MonoPilot Kira — Owner's Guide

A grounded, code-verified guide to what the app does today, how to use it, and how to
test it. Written 2026-06-18. Every claim in these docs is anchored to a real route or
file — stubs and gaps are marked honestly, not hidden.

## Read order

1. **[01 — Golden end-to-end flow](01-golden-flow-end-to-end.md)** — the full path
   *product → NPD acceptance → BOM → factory-spec release → planning (PO/WO/MRP) →
   warehouse receive/put-away → production consume/output → QA → shipment*, click-by-click
   with the screen + server action at each step, **plus a flow diagram** (Mermaid + ASCII)
   and a "where it breaks / gaps" section.
2. **[02 — Manual test plan](02-manual-test-plan.md)** — a runnable checklist (markdown
   checkboxes) to verify the app works on the live deploy and locally: automated gates,
   login/shell smoke, per-module click tests with expected results, the golden E2E walk,
   and negative/edge tests. Start here to "see if the app works".
3. **[03 — Module how-to / where-is-what](03-module-howto.md)** — per module: which screens
   exist, what you can add/configure and where (button → action), what options each form
   exposes, and how RBAC grants flow.
4. **[04 — Architecture & multi-tenancy](04-architecture-multitenancy.md)** — the stack,
   route groups, the `org_id` / `app.current_org_id()` law, RBAC + outbox SoT, e-sign, and
   **authoritative answers to: is multi-site built? are scanners per-site or per-org?**
5. **[05 — Status matrix & known gaps](05-status-matrix.md)** — module-by-module
   built / partial / stub map, what shipped on 2026-06-18, and a grounded dead-ends list.

## Quick answers

- **Multi-site:** *partial.* The sites registry, `app.current_site_id()` / site-context
  primitives, `inter_site_transfer_orders` shell + RLS, and a cookie-based site filter on a
  few screens exist; ~38 tables carry `site_id`. **Not built:** a `withSiteContext` request-path
  HOF (named only as a future seam), full per-site RLS scoping, and the `/multi-site` page
  (still a stub). See doc 04.
- **Scanners:** *site-scoped* (and line/shift-scoped) **within an org** — the scanner login
  forces a site → line → shift pick and the session carries `siteId`/`lineId`. As of
  2026-06-18 the bootstrap now returns each line's real `site_id` (the previous `null`
  hardcode was fixed). See doc 04.
- **Login:** `admin@monopilot.test` / `Admin2026!!!` on the live Vercel + Supabase deploy.

## What shipped 2026-06-18 (this session)

Scanner de-mock (real-phone full-bleed, no fake OS chrome); **W11 R4 reversibility LIVE**
(transfer-receive reversal + factory-spec recall, migs 300); **E6 MRP loop LIVE**
(planned-order persistence + Create-PO/WO + forecasts feeding MRP, migs 301+302);
**E3** `/quality/ccp-monitoring`; **E-IO** PO CSV export; and dead-end/bug fixes
(UUID leaks, GRN-QC "coming soon" reword, 15 disabled-button tooltips). Full list in doc 05.
