# 11-SHIPPING Atomic Task Coverage

PRD: `docs/prd/11-SHIPPING-PRD.md`
UX: `prototypes/design/11-SHIPPING-UX.md`
Prototype index: `_meta/prototype-labels/prototype-index-shipping.json`
Translation notes: `_meta/prototype-labels/translation-notes-shipping.md`
Bootstrap: 2026-05-14 (32 tasks T-001..T-032; T-031 is the p0-blocker permission-enum task)

## Sub-module map

| Sub-module | Scope | Tasks | PRD anchors |
|---|---|---|---|
| **11-shipping-a** | Customer domain (customers + contacts + addresses + allergen restrictions) | T-001..T-005 | §9.1, §15.4 SHIP-001..004 |
| **11-shipping-b** | Sales Orders (schema + status machine + wizard + list + detail) | T-006..T-010 | §6 D-SHP-8, §8.1, §9.1, §9.2, §15.4 SHIP-005..007 |
| **11-shipping-c** | Allocation + Quality Hold gate (FEFO + D-SHP-13) | T-011..T-014 | §6 D-SHP-1, §6 D-SHP-2, §6 D-SHP-13, §8.2, §10, §15.4 SHIP-008/029 |
| **11-shipping-d** | Pick + Wave (schema + APIs + UI) | T-015..T-017 | §6 D-SHP-6, §11 V-SHIP-PICK-*, §15.4 SHIP-012..016 |
| **11-shipping-e** | Pack + SSCC-18 + Ship confirm | T-018..T-022 | §6 D-SHP-4, §6 D-SHP-14, §8.4, §13.1, §13.2, §15.4 SHIP-017..019/024/030 |
| **11-shipping-f** | Documents (packing slip + BOL + POD) + BRCGS 7y retention | T-023..T-025 | §13.3, §13.5, §14.4, §15.4 SHIP-020/021/025/028 |
| **11-shipping-g** | RMA Phase 1 | T-026 | §8.5, §11 V-SHIP-RMA-*, §15.4 SHIP-026/027 (P2 stub) |
| **11-shipping-h** | Carriers + Shipping Settings | T-027..T-028 | §6 D-SHP-19, §15.4 SHIP-014b/023 |
| **11-shipping-i** | INTEGRATIONS Stage 3 D365 push (outbox + DLQ + dispatcher) | T-029 | §6 D-SHP-14, §9.3, §12 |
| **11-shipping-j** | Dashboard + cross-cutting + E2E spine | T-030, T-032 | §15.4 SHIP-022, §8 |
| **11-shipping-k** | Permissions enum delta (p0-blocker) | T-031 | §3, §6 D-SHP-7, §6 D-SHP-8, §10, §13.1, §14.4 |

## Coverage rows

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §3 / §6 D-SHP-7/8 / §10 / §13.1 / §14.4 | tasks/T-031.json | 11-shipping-k | T1-schema | covered (p0-blocker, priority 90) |
| §9.1 customers/contacts/addresses + §15.4 SHIP-003/004 | tasks/T-001.json | 11-shipping-a | T1-schema | covered |
| §3 personas / §9.1 / §14.4 audit / §15.4 SHIP-001..004 | tasks/T-002.json | 11-shipping-a | T2-api | covered |
| §15.4 SHIP-001 / §3 / §11 V-SHIP-SO-01 | tasks/T-003.json | 11-shipping-a | T3-ui | covered (prototype: customer-screens.jsx:1-129) |
| §15.4 SHIP-003/004 / §11 V-SHIP-SO-02 | tasks/T-004.json | 11-shipping-a | T3-ui | covered (prototype: customer-screens.jsx:132-363) |
| §15.4 SHIP-003/004 / §11 V-SHIP-SO-02/LBL-01/02 | tasks/T-005.json | 11-shipping-a | T3-ui | covered (prototypes: modals.jsx:27-67, 69-94, 96-113) |
| §9.1 + §9.2 + §6 D-SHP-7/8/11 + §11 V-SHIP-SO-04 | tasks/T-006.json | 11-shipping-b | T1-schema | covered |
| §6 D-SHP-8 + §8.1 + §10 + §11 V-SHIP-SO-01..08 | tasks/T-007.json | 11-shipping-b | T2-api | covered |
| §15.4 SHIP-006 + §8.1 + §11 V-SHIP-SO-* | tasks/T-008.json | 11-shipping-b | T3-ui | covered (prototype: modals.jsx:115-271; BL-SHIP-02 fix) |
| §15.4 SHIP-005 + §6 D-SHP-8 | tasks/T-009.json | 11-shipping-b | T3-ui | covered (prototype: so-screens.jsx:1-139) |
| §15.4 SHIP-007 + §6 D-SHP-8 + §10 | tasks/T-010.json | 11-shipping-b | T3-ui | covered (prototypes: so-screens.jsx:141-366; modals 342-378/380-410/504-536/412-453/809-835) |
| §9.1 + §9.2 + §6 D-SHP-1/2/13 + §8.2 + §11 V-SHIP-ALLOC-* | tasks/T-011.json | 11-shipping-c | T1-schema | covered |
| §6 D-SHP-1/2/13 + §8.2 + §11 V-SHIP-ALLOC-* | tasks/T-012.json | 11-shipping-c | T2-api | covered (prototypes: modals.jsx:292-340, 809-835) |
| §6 D-SHP-13 + §10 + §11 V-SHIP-PICK-02/03 V-SHIP-SHIP-03 | tasks/T-013.json | 11-shipping-c | T2-api | covered (service) |
| §15.4 SHIP-029/008 + §6 D-SHP-2/13 | tasks/T-014.json | 11-shipping-c | T3-ui | covered (prototypes: so-screens.jsx:370-519; modals.jsx:292-340, 809-835) |
| §9.1 + §6 D-SHP-6/2 + §11 V-SHIP-PICK-* | tasks/T-015.json | 11-shipping-d | T1-schema | covered |
| §6 D-SHP-6/13 + §11 V-SHIP-PICK-* + §15.4 SHIP-013..016 | tasks/T-016.json | 11-shipping-d | T2-api | covered |
| §15.4 SHIP-012/013/014/016 | tasks/T-017.json | 11-shipping-d | T3-ui | covered (prototypes: pick-screens.jsx:1-94, 98-184, 217-330; modals 455-502/538-562/564-575; BL-SHIP-03 fix) |
| §9.1 + §6 D-SHP-4 + §13.1 + §11 V-SHIP-PACK-02..04 V-SHIP-SHIP-01/05 | tasks/T-018.json | 11-shipping-e | T1-schema | covered |
| §13.1 + §13.2 + §11 V-SHIP-PACK-02..04 V-SHIP-LBL-02/03 + §6 D-SHP-4 | tasks/T-019.json | 11-shipping-e | T2-api | covered (service + worker job) |
| §6 D-SHP-13/14 + §8.4 + §11 V-SHIP-PACK-* V-SHIP-SHIP-* + §12.1 | tasks/T-020.json | 11-shipping-e | T2-api | covered |
| §15.4 SHIP-017/030/024 + §11 V-SHIP-PACK-04 V-SHIP-SHIP-01..03 | tasks/T-021.json | 11-shipping-e | T3-ui | covered (prototypes: pack-screens.jsx:4-45, 47-220; modals 577-607/609-700/792-807; BL-SHIP-14 fix) |
| §15.4 SHIP-019 + §13.1 + §11 V-SHIP-PACK-04 V-SHIP-LBL-02 | tasks/T-022.json | 11-shipping-e | T3-ui | covered (prototypes: pack-screens.jsx:224-314, 317-336; modals.jsx:702-739; BL-SHIP-07 fix) |
| §13.3 + §13.5 + §14.4 + §14.7 + §11 V-SHIP-LBL-01/04 | tasks/T-023.json | 11-shipping-f | T2-api | covered |
| §15.4 SHIP-020/021/025 + §13.5 | tasks/T-024.json | 11-shipping-f | T3-ui | covered (prototypes: doc-screens.jsx:4-104, 107-215, 217-308; modals 741-757/759-790; BL-SHIP-10 fix) |
| §15.4 SHIP-028 + §8.4 + §14.4 | tasks/T-025.json | 11-shipping-f | T3-ui | covered (prototype: doc-screens.jsx:310-422; BL-SHIP-01 fix — POD upload modal) |
| §9.1 + §8.5 + §11 V-SHIP-RMA-* | tasks/T-026.json | 11-shipping-g | T2-api | covered (prototype: doc-screens.jsx:468-534; SHIP-027 4-tab P2 ScaffoldedScreen per BL-SHIP-04) |
| §15.4 SHIP-014b + §6 D-SHP-19 + §9 | tasks/T-027.json | 11-shipping-h | T2-api | covered (prototypes: doc-screens.jsx:424-466; modals.jsx:792-807) |
| §15.4 SHIP-023 + §11 V-SHIP-PACK-03 + §12 + §6 D-SHP-19 | tasks/T-028.json | 11-shipping-h | T3-ui | covered (prototype: doc-screens.jsx:536-648; BL-SHIP-12/13 P2 disabled toggles) |
| §6 D-SHP-14 + §9.3 + §12 (all subsections) | tasks/T-029.json | 11-shipping-i | T2-api | covered (cross-module deps: 02-SET D365_Constants, 08-PROD outbox_status_enum, 00-foundation T-051 posture) |
| §15.4 SHIP-022 + §2 KPIs | tasks/T-030.json | 11-shipping-j | T3-ui | covered (prototype: dashboard.jsx:1-224; BL-SHIP-11 fix — global search wired) |
| §8 (SO→Alloc→Pick→Pack→Ship→POD spine) + §6 D-SHP-14 + §2 OTD% | tasks/T-032.json | 11-shipping-j | T4-wiring-test | covered (E2E across 11-SHIP + 05-WH + 09-QA + NPD + 02-SET) |

## Out-of-scope (per PRD §4.2 / §4.3)

- §4.2 Phase 2: catch weight full automation, ASN, EUDR full (P2 stub gated), HAZMAT, multi-language packing slip, real-time Realtime channel, credit_limit enforcement, carrier_configs API integration, RMA Detail 4-tab.
- §4.3 Exclusions: production scheduling (08-PROD), warehouse internal moves (05-WH), invoicing/AR (10-FIN), credit checks beyond P1 stub.
- §16.2 P2 carve-outs: explicitly deferred from this 32-task bootstrap and tracked as task-level red-lines.

## Known prototype bugs addressed (BL-SHIP)

| Bug ID | Severity | Fix task |
|---|---|---|
| BL-SHIP-01 | Medium | T-025 (POD upload modal separate from BOL sign-off) |
| BL-SHIP-02 | Low | T-008 (allergen override inline collapse on shipping_qa active) |
| BL-SHIP-03 | Medium | T-017 (wave edit modal backing the Edit stub) |
| BL-SHIP-04 | Medium | T-026 (SHIP-027 4-tab P2 ScaffoldedScreen placeholder; full screen P2) |
| BL-SHIP-07 | Low | T-022 (bulk SSCC reprint up to 10) |
| BL-SHIP-10 | Low | T-024 (D365 DLQ inline event preview chip) |
| BL-SHIP-11 | Low | T-030 (global topbar search wired) |
| BL-SHIP-14 | Low | T-021 (Ship confirm Replay DLQ button visible to ship.dlq.replay) |

P2-deferred (in scope as disabled UI only): BL-SHIP-05, BL-SHIP-06, BL-SHIP-09, BL-SHIP-12, BL-SHIP-13, BL-SHIP-08.

## Cross-module integration assertions

- **FG SSOT (Wave0 v4.3)**: `sales_order_lines.product_id` references NPD `product` table; no parallel `fa_id` introduced (T-006 risk red-line).
- **RLS / tenant context**: all 14 shipping tables use `org_id = app.current_org_id()` via foundation T-125 `withOrgContext` HOF; zero `current_setting('app.tenant_id'|'app.current_org_id')` GUC reads (grep-asserted per task).
- **Quality Hold gate D-SHP-13**: T-013 shared service consumes 09-QUALITY `v_active_holds` view; emits `shipping.quality_hold.overridden` outbox event consumed by 09-QA T-011 audit.
- **D365 export-only contract**: T-029 R15 anti-corruption adapter strictly excludes `factory_release_state` (asserted in T-029 AC6 and T-032 E2E AC3).
- **LP state machine**: T-020 confirmShipment calls 05-WH `transition_lp(lp, 'shipped')` DSL; never writes directly to license_plates.status.
- **RMA cross-writes**: T-026 processRMA calls 05-WH `create_lp` (restock) or 09-QA `create_hold` (quality_hold); never duplicates state.
- **BRCGS 7y retention**: T-023 + T-025 use Supabase Storage with `brcgs_retention=true` tag + RLS-blocked DELETE; SHA-256 hashes persisted on shipments.bol_pdf_hash / signed_hash / pod_hash.
- **GDPR**: T-001 registers erasure handler `shipping_customers` via @monopilot/gdpr (T-113) — customers.email/phone/tax_id + customer_contacts.email/phone.

## Outbox events introduced

| Event | Producer task | Consumer(s) |
|---|---|---|
| shipping.customer.created/deactivated/allergen_updated | T-002 | 02-SET audit, 09-QA |
| shipping.so.created/confirmed/cancelled/allocated/partially_allocated | T-007, T-012 | 10-FIN (P2 invoicing) |
| shipping.hold.placed/released | T-007 | 09-QA audit |
| shipping.allergen.overridden | T-007 | 09-QA audit |
| shipping.allocation.released, shipping.fefo.overridden, shipping.quality_hold.overridden | T-012, T-013 | 09-QA T-011 audit |
| shipping.wave.released, shipping.pick.executed, shipping.pick.short_pick_resolved, shipping.pick.reassigned | T-016 | reporting/dashboard |
| shipping.box.closed, shipment.confirmed | T-020 | T-029 D365 dispatcher (shipment.confirmed only) |
| shipping.sscc.reprinted | T-019 | audit |
| shipping.packing_slip.generated, shipping.bol.signed | T-023 | audit |
| shipping.shipment.delivered | T-025 | 10-FIN (P2 invoicing trigger), reporting |
| shipping.rma.created/approved/received/processed | T-026 | 09-QA (if disposition=quality_hold), 10-FIN (P2 credit-note) |
| shipping.carrier.created/updated/deactivated | T-027 | audit |
| shipping.settings.updated | T-028 | audit |
| shipping.d365.push_attempted/succeeded/failed | T-029 | observability + DLQ |

## Notes

- T-031 (permissions) is the p0-blocker (priority 90) — must land before any Server Action task can compile under the 02-settings T-046 ESLint enum-lock guard.
- All UI tasks (T-003/004/005/008/009/010/014/017/021/022/024/025/026/028/030) carry `prototype_match: true` and `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.
- All migrations use the next-free 4-digit slot — pre-impl step asserts via `git status --short` + read `packages/db/migrations/`.
- Catch weight (V-SHIP-PACK-04) is sourced from `product.variance_tolerance_pct` (Technical/NPD) with shipping_config fallback (T-028).
- Wave 1 in execution order: T-031 (permissions) → T-001/T-006/T-011/T-015/T-018/T-026-schema (schema parallel-safe) → T-002/T-007/T-012/T-013/T-016/T-019/T-020/T-023/T-025-server-action/T-026-server-actions/T-027/T-029 (server actions wave) → T-003..T-005/T-008..T-010/T-014/T-017/T-021/T-022/T-024/T-025-UI/T-026-UI/T-028/T-030 (UI wave) → T-032 (E2E).
