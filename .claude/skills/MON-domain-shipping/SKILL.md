---
name: MON-domain-shipping
description: "Use when implementing 11-shipping tasks: Customer SO, allocation+hold gate, pick/wave, pack/SSCC-18 (mod-10 server-side), ship/BOL/POD (SHA-256 + BRCGS 7y), carriers, D365 stage 5 (export-only), RMA P1. Heavy regulatory + integration overlap."
version: 1.0.0
model: opus
canonical_spec: _meta/atomic-tasks/11-shipping/coverage.md
---

# MON-domain-shipping — 11-Shipping Implementation Playbook

**Purpose:** route, contract, and red-line guidance for any atomic task in `_meta/atomic-tasks/11-shipping/tasks/T-NNN.json` (T-001..T-032, bootstrapped 2026-05-14). Shipping is the **highest regulatory + integration overlap** module — BRCGS Issue 9 §3.5 (7-year retention), CFR-21 e-sign, GS1 SSCC-18, GDPR PII, D365 R15 export-only, and a 6-way cross-mod fan-in (NPD FG SSOT, 09-quality holds, 05-warehouse LP, 02-settings GS1/ref-tables, 06-scanner role, 08-prod outbox enum). Skipping this skill = compliance + outbox drift.

## When to use

- Any task in `_meta/atomic-tasks/11-shipping/tasks/T-001.json` .. `T-032.json`
- Any cross-mod task whose `cross_module_dependencies` cites `11-shipping/*` (e.g., 10-finance P2 invoicing consumer, 09-quality `v_active_holds` consumer-side)
- Any task touching `customers`, `sales_orders`, `so_lines`, `so_allocations`, `pick_lists`, `pick_executions`, `shipments`, `shipment_boxes`, `shipment_box_contents`, `sscc_counters`, `bol_*`, `pod_*`, `rma_*`, `shipping_outbox_events`, `shipping_push_dlq`, `shipping_config`, `carriers`
- Any SSCC-18 / GS1 / GTIN work — even outside 11-shipping (e.g., 14-multi-site cross-site shipment)

## Do NOT use when

- Pure scanner UX (dark-mode pick scanner, pack scanner) — owned by 06-scanner-p1; use [[MON-domain-scanner]]
- LP state transitions themselves (`license_plates.status`) — owned by 05-warehouse `transition_lp` DSL; this module **calls** the DSL, never writes directly
- D365 *posture* itself — owned by 00-foundation T-051 + `_foundation/contracts/d365-posture.md`; this module **consumes** the contract via T-029

## Required reading (in this order)

1. [[MON-project-overview]] — repo map, tech-stack locks, module glossary
2. `_meta/atomic-tasks/11-shipping/coverage.md` — sub-module map, BL-SHIP bug list, cross-mod assertions, outbox event registry
3. `_meta/atomic-tasks/11-shipping/manifest.json` — wave order (1: perm+schema, 2: server actions, 3: UI, 4: E2E)
4. `_meta/atomic-tasks/11-shipping/BOOTSTRAP-REPORT-2026-05-14.md` — bug fixes log, exemplar conformance
5. `_meta/audits/2026-05-14-fixer-F17-shipping-cleanup.md` — canonical rules: BRCGS 7y retention, SSCC anchors (`organizations.gs1_company_prefix`), D365 export-only red-line, 09-Q T-064 consume-gate
6. `docs/prd/11-SHIPPING-PRD.md` — vocabulary, D-SHP-* decisions, V-SHIP-* validators, §15.4 SHIP-* screen index
7. `_meta/specs/event-naming-convention.md` — `<aggregate>.<verb_phrase>` ISA-95 dot format authority (note: shipping uses **2-segment** `shipment.epcis_commissioning` and **3-segment** `shipping.<resource>.<verb>` — the registered prefix is `shipment.*`; the per-task outbox uses verbose `shipping.<resource>.<verb>` — see §Outbox events below)
8. The target task JSON itself — `scope_files`, `acceptance_criteria`, `risk_red_lines` are normative

## Sub-modules

| Sub-module | Tasks | Scope | Specialist |
|---|---|---|---|
| **11-a customer** | T-001..T-005 | customers + contacts + addresses + allergen restrictions (4 tables, GDPR-registered) | [[MON-t1-schema]] / [[MON-t3-ui]] |
| **11-b SO** | T-006..T-010 | sales_orders + so_lines + status machine + wizard + list + detail | [[MON-t2-api]] / [[MON-t3-ui]] |
| **11-c allocation + hold gate** | T-011..T-014 | FEFO + D-SHP-13 hold gate (consumes `v_active_holds` from 09-quality T-064) | [[MON-t2-api]] |
| **11-d pick + wave** | T-015..T-017 | pick_lists, waves, pick_executions, short-pick + reassign | [[MON-t2-api]] / [[MON-t3-ui]] |
| **11-e pack + SSCC + ship** | T-018..T-022 | shipment_boxes, sscc_counters (atomic per-org), pack workbench, ship confirm | [[MON-t2-api]] / [[MON-domain-warehouse]] |
| **11-f docs (packing/BOL/POD)** | T-023..T-025 | packing slip, BOL with SHA-256, POD upload + SHA-256, BRCGS 7y retention | [[MON-integrations-compliance]] |
| **11-g RMA P1** | T-026 | return authorization + 3-disposition restock/scrap/quality_hold cross-writes | [[MON-t2-api]] |
| **11-h carriers + settings** | T-027..T-028 | carriers ref-data, shipping_config UPSERT (catch-weight tolerance, HS-code, EUDR/HAZMAT P2 toggles disabled) | [[MON-t2-api]] |
| **11-i D365 dispatcher** | T-029 | INTEGRATIONS Stage 3/5 SO confirm push + DLQ + R15 anti-corruption | [[MON-integrations-compliance]] |
| **11-j dashboard + E2E** | T-030, T-032 | shipping dashboard, full spine E2E (SO→Alloc→Pick→Pack→Ship→POD) | [[MON-t3-ui]] / [[MON-t4-test]] |
| **11-k perm-enum** | T-031 | 14 `ship.*` permission strings (p0-blocker, priority 90) | [[MON-multi-tenant-site]] |

## Key concepts

### SO state machine (D-SHP-8)

`draft → confirmed → allocated | partially_allocated → picked → packed → shipped → delivered`, plus `cancelled` (from `draft|confirmed`) and `on_hold` (from any pre-`shipped` state when a hold is placed). State transitions are enforced server-side in T-007 + T-012 + T-020; clients never PATCH `status` directly. Guards: address present, allergen cascade reconciled, no active QA critical hold (consumes `v_active_holds` — see Hold gate).

### Allocation strategy (D-SHP-1/2/13)

Default = **FEFO** (first-expiry-first-out) via `v_fefo_lp_candidates` view sorting `license_plates` by `expiry_date` then `received_at`. Soft-gate overrides (FEFO, expired ±N days, QA hold) require reason code from `reason_codes` (context='fefo_deviation') + `ship.alloc.override` permission + emit `shipping.fefo.overridden` / `shipping.quality_hold.overridden` outbox events. Hard-gate (allergen conflict from customer_allergen_restrictions vs product allergens) requires `ship.allergen.override` + QA persona + writes `allergen_overrides` row.

### Hold gate (D-SHP-13) — Cross-mod with 09-quality T-064

Every allocation/pick/pack/ship task **MUST** call the 09-quality `holdsGuard(lp_id | so_id)` consume gate (T-064) before transitioning state. The gate reads `v_active_holds` and blocks unless override path is taken. F17 fix added `09-quality/T-064` to `cross_module_dependencies` of every shipping consumer task (T-007, T-010, T-011, T-012, T-013, T-014, T-016, T-020, T-021, T-026, T-030, T-031, T-032). **Grep-assertion red-line**: every Server Action that touches LP/SO state MUST contain a `holdsGuard(` call site.

### SSCC-18 + wave/pick

SSCC-18 = 18-digit GS1 Serial Shipping Container Code. Pack/wave details flow: customer SO → wave released → pick_list executed → carton closed → SSCC label printed → shipment confirmed.

## FG SSOT rule

Finished Goods Single Source of Truth: **`sales_order_lines.product_id` references the NPD `product` table** (canonical FG row created via NPD T-001). **NEVER introduce a parallel `fa_id` field** on shipping tables — this was an explicit Wave0 v4.3 lock + audit `_meta/audits/2026-05-14-tenant-context-remediation.md` decision (T-006 risk red-line). Allergen attributes + `variance_tolerance_pct` for catch-weight are read **from `product`**, not duplicated on SO lines. See [[MON-domain-npd]] for production-side handoff and FG creation flow.

## SSCC-18 generation

- **Algorithm**: server-side mod-10 check digit only — never trust client-computed digits (V-SHIP-LBL-03)
- **GS1 prefix source**: `organizations.gs1_company_prefix` (02-settings, §12.1) — **always read from organizations table**, never from env config or code constants (F17 hardening to dodge `local.*gs1` regex false-positive)
- **Per-org counter**: `sscc_counters` table (T-018) with row-level atomic `UPDATE ... RETURNING` increment, guaranteeing V-SHIP-PACK-04 no-gap sequence
- **Reprint cap**: T-022 enforces ≤10 bulk reprints per call, audited via `shipping.sscc.reprinted` outbox event
- See [[MON-integrations-compliance]] §GS1 for GTIN-14 + AI-(00) + barcode rendering rules

## POD canonical hash

Proof-of-Delivery integrity = `SHA-256(delivery_time || signer_name || photo_hash || organization_id || so_id)` — immutable, persisted as `shipments.pod_hash`. **7-year retention per BRCGS Issue 9 §3.5 / §14.4** — stored in Supabase Storage with `brcgs_retention=true` tag and RLS-blocked DELETE. Same pattern applies to `shipments.bol_pdf_hash` and `shipments.signed_hash` (signed BOL). F17 added the SHA-256 + 7y retention contract to risk_red_lines of T-010, T-018, T-020, T-021, T-023, T-024, T-025, T-031.

## R15 anti-corruption (D365)

Stage 5 D365 dispatcher (T-029) exports SO/shipment data **one-way** to D365. Rules:
- **NEVER mutate** `factory_release_state` or any D365-owned customer master fields (T-020 risk_red_line, F17-added)
- **NEVER import** D365 callback state into MES tables (R15 contract from `_foundation/contracts/d365-posture.md`)
- Dispatcher pushes only `shipment.confirmed` events — read from `shipping_outbox_events`, write to `shipping_push_dlq` on failure with exponential backoff
- D365_Constants table (02-settings) supplies endpoint URLs + auth — never hardcode
- T-032 E2E AC3 asserts no D365 mutation of canonical Monopilot state
- See [[MON-integrations-compliance]] §D365 for full export-only posture

## Outbox events

Per `_meta/specs/event-naming-convention.md` the **registered** prefix for the shipment aggregate is `shipment.*` (2-segment, e.g., `shipment.epcis_commissioning`). The shipping module's outbox table `shipping_outbox_events` uses a **3-segment verbose form** `shipping.<resource>.<verb_past>` for finer-grained consumer routing (audit, reporting, 10-finance, 09-quality, observability/DLQ). Both forms are valid; check the target task's `outbox_event` field for the canonical string.

| Event | Producer | Consumer(s) |
|---|---|---|
| `shipping.customer.created` / `.deactivated` / `.allergen_updated` | T-002 | 02-settings audit, 09-quality |
| `shipping.so.created` / `.confirmed` / `.cancelled` / `.allocated` / `.partially_allocated` / `.released` | T-007, T-012 | 10-finance (P2 invoicing) |
| `shipping.hold.placed` / `.released` | T-007 | 09-quality audit (T-011) |
| `shipping.allergen.overridden` | T-007 | 09-quality audit |
| `shipping.allocation.completed` / `.released` / `.fefo.overridden` / `.quality_hold.overridden` | T-012, T-013 | 09-quality T-011 audit |
| `shipping.wave.released` / `.pick.executed` / `.pick.short_pick_resolved` / `.pick.reassigned` | T-016 | reporting/dashboard |
| `shipping.pack.scanned` / `.box.closed` / `.shipment.confirmed` | T-020 | T-029 D365 dispatcher (`shipment.confirmed` only) |
| `shipping.sscc.reprinted` | T-019 | audit |
| `shipping.packing_slip.generated` / `.bol.signed` | T-023 | audit |
| `shipping.pod.received` / `.shipment.delivered` / `.shipment.dispatched` | T-025, T-020 | 10-finance (P2 invoicing trigger), reporting |
| `shipping.rma.created` / `.approved` / `.received` / `.processed` | T-026 | 09-quality (if disposition=quality_hold), 10-finance (P2 credit-note) |
| `shipping.carrier.created` / `.updated` / `.deactivated` | T-027 | audit |
| `shipping.settings.updated` | T-028 | audit |
| `shipping.d365.push_attempted` / `.succeeded` / `.failed` | T-029 | observability + DLQ |

All emissions go through `@monopilot/outbox` (foundation T-112), never direct queue writes. Outbox status enum (`outbox_status_enum`) is shared with 08-production (canonical owner).

## BRCGS bugs fixed inline

Bootstrap 2026-05-14 fixed 8 known prototype bugs inline (no separate remediation task needed):

| Bug | Severity | Fix task | Note |
|---|---|---|---|
| BL-SHIP-01 | Medium | T-025 | POD upload modal separated from BOL sign-off |
| BL-SHIP-02 | Low | T-008 | Allergen override inline collapse on shipping_qa active |
| BL-SHIP-03 | Medium | T-017 | Wave edit modal backing the Edit stub |
| BL-SHIP-04 | Medium | T-026 | SHIP-027 4-tab P2 ScaffoldedScreen placeholder |
| BL-SHIP-07 | Low | T-022 | Bulk SSCC reprint capped at 10 |
| BL-SHIP-10 | Low | T-024 | D365 DLQ inline event preview chip |
| BL-SHIP-11 | Low | T-030 | Global topbar search wired |
| BL-SHIP-14 | Low | T-021 | Ship confirm Replay DLQ button visible to `ship.dlq.replay` |

P2-deferred (rendered as **disabled UI with explanatory tooltips**, not removed): BL-SHIP-05, BL-SHIP-06, BL-SHIP-08, BL-SHIP-09, BL-SHIP-12, BL-SHIP-13. Do not delete these placeholders during impl — disabled state is the requirement.

## Cross-module deps

This module is a **heavy consumer**, light producer (events only). Producer responsibilities are all outbox emissions above; consumer responsibilities are:

- **00-foundation**: T-040 (audit_events R13), T-051 (D365 posture), T-111 (worker JobRegistry), T-112 (outbox), T-113 (GDPR registry — `shipping_customers` erasure handler in T-001), T-116 (OTel), T-117 (pino redact for PII), T-121 (rate-limit on public Server Actions), T-123 (Playwright harness for T-032), T-124 (e-sign for BOL/POD), T-125 (`withOrgContext` + `app.current_org_id()`)
- **01-npd T-001**: product FG SSOT — `sales_order_lines.product_id` references `product`, NEVER `fa_id`; allergen cascade + `variance_tolerance_pct` (catch-weight) sourced here
- **02-settings**: `allergen_families` ref table, `reason_codes` ref table (contexts `fefo_deviation` / `rma` / `manual`), `organizations.gs1_company_prefix`, `printers` + `packing_stations` ref tables, tenant L2 config infra (`shipping_config` UPSERT), `D365_Constants`
- **05-warehouse T-002/T-013**: `license_plates` SSOT + `transition_lp(lp, 'shipped')` DSL — shipping NEVER writes `license_plates.status` directly; T-026 RMA restock calls `create_lp` Server Action
- **06-scanner-p1**: operator role model (`pick_lists.assigned_to` visibility), `scan_event_id` session contract (V-SHIP-PICK-01), SHIP-015 Pick Scanner + SHIP-018 Pack Scanner are **owned by scanner module** (not shipping)
- **08-production**: shares `outbox_status_enum` (canonical owner = 08-prod)
- **09-quality T-010/T-011/T-064**: `v_active_holds` view (T-010), audit consumer (T-011), `holdsGuard` consume gate (T-064 — mandatory red-line on every allocation/pick/pack/ship task); `create_hold` cross-write for RMA quality_hold disposition
- **10-finance**: P2 invoicing consumer of `shipping.shipment.delivered` + `shipping.rma.processed`

## Cross-links

- [[MON-project-overview]] — first-read orientation, repo map
- [[MON-t1-schema]] — Drizzle schema + migration authoring (use for T-001/T-006/T-011/T-015/T-018/T-031)
- [[MON-t2-api]] — Server Actions, auth-adjacent backend (use for T-002/T-007/T-012/T-013/T-016/T-019/T-020/T-023/T-025/T-026/T-027/T-029)
- [[MON-t3-ui]] — Next.js App Router UI with prototype parity (use for T-003/T-004/T-005/T-008/T-009/T-010/T-014/T-017/T-021/T-022/T-024/T-028/T-030)
- [[MON-t4-test]] — E2E spine (T-032)
- [[MON-foundation-primitives]] — outbox, worker, rate-limit, e-sign, GDPR, observability
- [[MON-multi-tenant-site]] — `org_id`, `withOrgContext`, `app.current_org_id()`, RLS policies
- [[MON-integrations-compliance]] — D365 export-only, BRCGS retention, CFR-21 e-sign, GS1 SSCC-18, GDPR PII flows
- [[MON-domain-quality]] — `holdsGuard` consumer, `v_active_holds` view, allergen cascade
- [[MON-domain-warehouse]] — `transition_lp` DSL, `license_plates` SSOT, `create_lp` action
- [[MON-domain-production]] — `outbox_status_enum` shared owner
