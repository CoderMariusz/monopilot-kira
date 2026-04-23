# Audit — Tune-3: Shipping + Settings Prototype vs PRD
**Audit agent:** Audit-3 (READ-ONLY)
**Date:** 2026-04-23
**Sources:**
- PRD: `11-SHIPPING-PRD.md` v3.0, `02-SETTINGS-PRD.md` v3.3, `00-FOUNDATION-PRD.md` v3.0
- UX: `design/11-SHIPPING-UX.md`, `design/02-SETTINGS-UX.md`
- Prototype: `design/Monopilot Design System/shipping/` (11 files), `design/Monopilot Design System/settings/` (13 files)

---

## MODULE 11-SHIPPING

### A — PRD → Prototype coverage

| PRD requirement | Prototype status |
|---|---|
| SHIP-022 Dashboard (KPI ×8, Alerts, Charts ×3, Quick Actions) | COVERED — `dashboard.jsx` ✓ |
| SHIP-001/002 Customer List + Detail (6 tabs) | COVERED — `customer-screens.jsx` ✓ |
| SHIP-003/004/005 SO List + Create Wizard (4 steps) + Detail | COVERED — `so-screens.jsx` ✓ |
| SHIP-007 Allocation Wizard (LP FEFO, override modal M-06) | COVERED — `so-screens.jsx` + `modals.jsx` M-06 ✓ |
| SHIP-008 Wave Picking Builder | COVERED — `pick-screens.jsx` `ShWave` ✓ |
| SHIP-009/010 Pick List Table + Pick Detail | COVERED — `pick-screens.jsx` ✓ |
| SHIP-010 Packing Workbench (3-col: LPs / Box Builder / Summary) | COVERED — `pack-screens.jsx` ✓ |
| SHIP-011 Shipment Detail | COVERED — `doc-screens.jsx` `ShShipments` ✓ |
| SHIP-012 BOL Preview + Print | COVERED — `doc-screens.jsx` `ShDocBol` ✓ |
| SHIP-013 RMA List + Detail (SHIP-026) | PARTIAL — list present, RMA detail/disposition = scaffold (P2 banner) |
| SHIP-014 Shipping Dashboard | COVERED (merged into SHIP-022) |
| SHP-SCN-05 Quality Hold Override Modal (soft gate, D-SHP-13) | COVERED — M-06 `AllocOverrideModal` handles severity variants ✓ |
| M-15 Ship Confirm with D365 outbox payload preview | COVERED — `modals.jsx` M-15 `ShipConfirmModal` ✓ |
| SSCC Queue + preview (SHIP-016/017) | COVERED — `ShSSCCQueue`, M-16 `SsccPreviewModal` ✓ |
| Allergen Override Modal (M-21 `AllergenOverrideModal`) | COVERED — registered in app.jsx ✓ |
| Catch weight `actual_weight_kg` manual entry in Pack Close | COVERED — M-14 `PackCloseModal` CW variance ✓ |
| D365 DLQ Shipping View (ADMIN-SHP-02) | **MISSING** — no `/admin/integrations/d365/dlq?source=shipping` screen |
| Shipping Override Reasons Config (ADMIN-SHP-01) | **MISSING** — no reference-table CRUD for `shipping_override_reasons` |
| Scanner screens SHP-SCN-01..04 (pick/pack/return/pallet loading) | DEFERRED by design — delegated to 06-SCN; scanner cards present as launch points ✓ |
| Carriers management screen | COVERED — `ShCarriers` ✓ |
| V-SHIP-ALLOC-04 expired LP hard-block in allocation wizard | PARTIAL — `AllocOverrideModal` covers FEFO deviation + QA hold, but expired-LP distinct hard-block path not explicitly shown |
| V-SHIP-SHIP-03 no open critical holds guard in ShipConfirm | COVERED — M-15 guards checklist includes this check ✓ |
| GS1 prefix config blocking SSCC gen | PARTIAL — validation message for missing prefix shown in M-14, but no org-level setting link |

**P1 screen coverage estimate: ~85%** (14/16 desktop screens + partial RMA + 2 admin screens missing)

---

### B — Hallucinations (prototype invents things not in PRD/UX)

| # | Finding | Classification | Detail |
|---|---|---|---|
| B-SHP-01 | RMA header note: "P2: full QA disposition, re-stock to LP, credit note (EPIC 11-E)" — PRD marks disposition as P1 (Must, §4.1 #7: "disposition: restock/scrap/quality_hold") | **(A) Functional hallucination** | `doc-screens.jsx` line ~495: `"P1: create + list · P2: full QA disposition..."` — PRD §4.1 explicitly puts full RMA disposition P1 |
| B-SHP-02 | RMA tab label shows "Received" as a status — PRD §9.1 `rma_requests.status` enum is `pending/approved/receiving/received/processed/closed`; prototype omits `approved`, `receiving`, `processed` tabs | **(B) Spec drift** | Missing intermediate states reduces fidelity to SO lifecycle compliance audit requirements |
| B-SHP-03 | `ShSettings` screen shows a module-level Shipping settings screen (`/shipping/settings`) — UX §2.2 route map includes `/shipping/settings` and UX §2.1 sidebar includes "Settings" sub-item, but PRD defines only 2 admin screens (ADMIN-SHP-01/02) under 02-SETTINGS, not a standalone shipping settings page | **(C) Scope/architecture drift** | Low risk — additive, but blurs boundary between 02-SETTINGS and 11-SHIPPING settings ownership |
| B-SHP-04 | M-15 ShipConfirm shows `d365_shipping_push_enabled` feature flag label — PRD §1 states flag name as `integration.eudr.enabled` (EUDR) and D-SHP-14 uses `shipping_outbox_events`; no distinct `d365_shipping_push_enabled` flag name appears in PRD | **(B) Minor naming drift** | Low risk — flag name is illustrative, not blocking |
| B-SHP-05 | Dashboard "Data refreshed 8s ago · Cached 30s" header — UX specifies "auto-refresh toggle 30s ON/OFF" but auto-refresh is already shown as always-on with per-session dismiss; no toggle visible | **(B) Spec drift** | UX §3 SHIP-022 specifies a toggle control; prototype omits the toggle and bakes in auto-refresh state |

---

### C — Drift (prototype vs UX spec)

| # | Finding | Severity |
|---|---|---|
| C-SHP-01 | Customer Detail tabs: prototype has 5 tabs (Profile, Contacts, Addresses, Allergens, Orders). UX §SHIP-002 specifies 6 tabs: Profile, Addresses, Allergens, **Pricing**, **Credit**, History. Pricing and Credit tabs missing | HIGH — PRD P2 content, but tabs should be present as "Phase 2" stubs |
| C-SHP-02 | SO Create Wizard has 4 steps (Header, Lines, Allergen, Review). UX §SHIP-004 matches PRD — no drift on wizard steps ✓ | None |
| C-SHP-03 | Allocation Wizard route listed in UX as `/shipping/allocations` — prototype integrates allocation into SO Detail (tab) and separate `ShAllocation` screen matching UX §SHIP-007 ✓ | None |
| C-SHP-04 | Dashboard Quick Actions bar — UX specifies exactly 5 buttons: "Create SO", "Build Wave", "Open Packing", "Print SSCC Queue", "Upload Signed BOL". Prototype adds a 6th: "Add customer" (not in UX spec) | LOW |
| C-SHP-05 | UX §SHIP-022 specifies 3 "side-by-side charts" arranged in `grid-3`. Prototype uses `gridTemplateColumns:"1fr 1fr 1fr"` in a sub-section inside a 2-column layout (left=alerts+charts, right=activity) — structural drift from UX spec | MEDIUM — UX describes full-width chart row, prototype nests charts in 2-col grid |
| C-SHP-06 | BOL screen (ShDocBol) is present but lacks allergen aggregated list render in the document preview — PRD D-SHP-15 requires allergen union on BOL. Allergen section referenced in data but not rendered in the preview pane | MEDIUM — regulatory requirement gap |
| C-SHP-07 | V-SHIP-LBL-05 multi-language labels shown as P2 in prototype — PRD correctly marks as P2. UX §4.4 says OQ-SHIP-04 open. No drift. ✓ | None |

---

### D — Fitness Assessment

**Coverage:** ~85% of PRD §15 P1 screens represented. RMA disposition downgraded (B-SHP-01, HIGH). 2 admin screens absent (DLQ view, override reasons CRUD).

**Risk summary:**

| Issue | Risk | Severity |
|---|---|---|
| B-SHP-01 RMA disposition incorrectly P2 | Builds wrong scope understanding | HIGH |
| C-SHP-01 Customer Detail Pricing/Credit tabs absent | UX incompleteness — P2 content stubs expected | MEDIUM |
| C-SHP-05 Dashboard layout structural drift | Prototype deviated from UX grid spec | MEDIUM |
| C-SHP-06 BOL allergen list missing in preview | Regulatory gap (EU 1169/2011 D-SHP-15) | MEDIUM |
| ADMIN-SHP-01/02 missing | Integration DLQ ops + override reasons not prototyped | MEDIUM |
| B-SHP-02 RMA status tabs incomplete | Lifecycle state machine not faithfully represented | LOW-MEDIUM |

**FITNESS: YELLOW**
Strong core coverage (SO lifecycle, pick/pack/ship confirm, SSCC, allergen wizard, D365 outbox preview). Blocked by: RMA disposition misclassified as P2 (it is P1 Must), BOL allergen render gap (regulatory), and 2 missing admin screens. Remaining gaps are fixable without structural rework.

---

---

## MODULE 02-SETTINGS

### A — PRD → Prototype coverage

| PRD requirement | Prototype status |
|---|---|
| SET-000 Settings Dashboard | COVERED — `CompanyProfile` is default; Settings dashboard listed as `ScaffoldedScreen` via default catch |
| SET-007 Organization Profile (name, slug, timezone, locale, GS1 prefix, region, tier) | COVERED — `CompanyProfile` in `org-screens.jsx` ✓ |
| SET-008 User List (table + card view toggle) | COVERED — `UsersScreen` in `access-screens.jsx` with table/card modes ✓ |
| SET-010 Pending Invitations | PARTIAL — `UserInviteModal` present; standalone invitations screen = `ScaffoldedScreen` |
| SET-011 Roles & Permissions | PARTIAL — permission matrix shown inline in UsersScreen; dedicated Roles screen = `ScaffoldedScreen` |
| SET-001..006 Onboarding Wizard (6 steps) | **MISSING** — no onboarding wizard screens in prototype; no screen in switch statement; falls to `ScaffoldedScreen` |
| SET-030 Schema Browser | COVERED — `SchemaBrowserScreen` in `admin-screens.jsx` ✓ |
| SET-031 Column Edit Wizard (L2/L3) | PARTIAL — `PromotionsScreen` handles L1→L2 promotion (`promoteL2` modal); full column add wizard not present |
| SET-033 Schema Migrations Queue | PARTIAL — referenced in `SchemaBrowserScreen` but no standalone screen |
| SET-040/041 Rule Registry + Rule Detail | COVERED — `RulesRegistryScreen`, `RuleDetailScreen` ✓ (dry-run modal, version tabs) |
| SET-050/051 Reference Tables Index + Detail | COVERED — `ReferenceDataScreen` in `admin-screens.jsx` ✓ |
| SET-060..064 Multi-tenant L2 Config + Upgrade Orchestration | **MISSING** — no tenant variations screens; all fall to `ScaffoldedScreen` |
| SET-070 Module Toggles Dashboard | COVERED — `FeaturesScreen` in `ops-screens.jsx` ✓ |
| SET-071 Feature Flags (PostHog + built-in) | COVERED — `FlagsAdminScreen` + `FlagEditModal` ✓ |
| SET-080/081 D365 Connection Config + Constants Editor | COVERED — `D365ConnectionScreen`, `D365MappingScreen`, `d365Test` modal ✓ |
| SET-090/091 Email Config + Template Preview | COVERED — `EmailTemplatesScreen`, `EmailTemplateEditModal` ✓ (+ `LabelEditor` interactive) |
| SET-012/014/016/018 Infrastructure (Warehouses, Locations, Machines, Lines) | COVERED — `WarehousesScreen`, `SitesScreen`, dedicated screens ✓ |
| SET-020 Allergen Management | PARTIAL — referenced in sidebar nav; falls to `ScaffoldedScreen` for `/settings/allergens` |
| SET-021 Tax Codes | PARTIAL — `UnitsScreen` present; tax codes listed but may fall to scaffold |
| SET-023 API Keys | PARTIAL — referenced in IA; falls to `ScaffoldedScreen` |
| SET-025 Audit Logs | COVERED — `AuditLogScreen` present ✓ (minimal) |
| SET-026 Security Settings | COVERED — `SecurityScreen` ✓ |
| SET-027 Notifications | COVERED — `NotificationsScreen` ✓ |
| D365 Constants: FNOR/ForzDG/FinGoods/FOR100048 (§11) | COVERED — `D365ConnectionScreen` + D365 mapping screen show constants ✓ |
| Reference tables: `shipping_override_reasons`, `rma_reason_codes` (v3.1 bundled delta) | **MISSING** — `ReferenceDataScreen` present but no Shipping-specific tables visible in data |
| Scanner devices (SET-016 extension) | COVERED — `DevicesScreen` in `ops-screens.jsx` ✓ |
| BOMs screen | COVERED — `BomsScreen` in `data-screens.jsx` ✓ |
| Partners (suppliers/customers master) | COVERED — `PartnersScreen` ✓ |

**P1 screen coverage estimate: ~72%** (core admin covered; onboarding wizard and multi-tenant L2 config missing; allergen management + API keys scaffolded)

---

### B — Hallucinations (prototype invents things not in PRD/UX)

| # | Finding | Classification | Detail |
|---|---|---|---|
| B-SET-01 | `AuditLogScreen` shows "Sync failed · SAP S/4HANA" in audit data — PRD/UX reference D365 (Dynamics 365), not SAP S/4HANA. Forza is a D365 shop. | **(A) Functional hallucination** | `app.jsx` line ~32: `"Sync failed" / "SAP S/4HANA"` — wrong ERP system entirely |
| B-SET-02 | `IntegrationsScreen` (`integrations.jsx`) lists 5 integration categories and 16 integrations including items like "Shopify", "Slack", "Xero" — PRD §11 and §4 scope D365 + Peppol + API keys only for P1; Shopify/Slack/Xero are not mentioned anywhere in the PRD | **(A) Functional hallucination** | Integrations catalog goes far beyond PRD scope; risks misleading stakeholders about Monopilot's integration strategy |
| B-SET-03 | `LabelEditor` (interactive WYSIWYG drag-and-drop label editor in `editor-tweaks.jsx`) — PRD §13 EmailConfig references email templates; label templates as a drag-and-drop label design tool is not described in 02-SETTINGS PRD or UX spec. ZPL label generation belongs to 11-SHIPPING (D-SHP-4, §13.2) | **(B) Module placement drift** | Label editor in Settings prototype is out-of-module scope. It belongs in 11-SHIPPING or 03-TECHNICAL |
| B-SET-04 | `PromotionsScreen` (screen key `"promotions"`) — not listed in any Settings PRD section or UX screen inventory (SET-000 to SET-093). No PRD section describes "Promotions" in 02-SETTINGS | **(A) Functional hallucination** | Module "Promotions" appears to be generated content with no PRD backing |
| B-SET-05 | `ProductsScreen` and `BomsScreen` in `data-screens.jsx` — PRD §4 explicitly excludes direct product/BOM management from 02-SETTINGS (those belong to 01-NPD / 03-TECHNICAL). UX IA shows Products route as `/settings/products` | **(B) Spec drift** | Moderate — UX IA for settings includes these routes but PRD §4.4 excludes business content like product master from SETTINGS scope. Creates confusion about module ownership |

---

### C — Drift (prototype vs UX spec)

| # | Finding | Severity |
|---|---|---|
| C-SET-01 | Onboarding Wizard (SET-001..006) completely absent. UX §3 devotes ~80 lines to 6 steps with form fields, stepper, skip logic. PRD §4.1 marks it P1 Must (E01.2). No screen in switch statement; new org gets no guided setup | HIGH — P1 must feature entirely missing |
| C-SET-02 | Multi-tenant L2 Config (SET-060..064) all `ScaffoldedScreen` — PRD §4.1 marks multi-tenant L2 config as Phase 2, but UX spec describes these screens. Acceptable for P1 prototype, but should be explicit scaffolds with spec notes ✓ (they are via ScaffoldedScreen) | LOW (Phase 2 correctly deferred) |
| C-SET-03 | `SettingsNav` inner sidebar — UX §2 specifies a 256px second nav rail alongside the 220px global sidebar. Prototype uses `SettingsNav` component; no visual inspection possible from JSX alone, but component is referenced ✓ | Cannot verify |
| C-SET-04 | SET-008 User List: UX specifies 10 system roles in role filter dropdown; `UsersScreen` only shows 4 roles ("Admin", "Manager", "Operator", "Viewer") in `window.SETTINGS_ROLES` — only 4 vs PRD's 10 system roles | MEDIUM — role data incomplete vs PRD §3 |
| C-SET-05 | Reference Tables CRUD (SET-051): `ReferenceDataScreen` present but no Shipping-specific tables (`shipping_override_reasons`, `rma_reason_codes`) added per bundled 02-SETTINGS v3.1 delta (11-SHIPPING PRD §7). Also no `AlertThresholds` or `Allergens` reference tables visible | MEDIUM — v3.1 bundled delta not applied to reference data |
| C-SET-06 | D365 Constants screen: PRD §11 defines exactly 5 constants (FNOR, FOR100048, ForzDG, FinGoods, FProd01) + P2 extensions (shipping_warehouse, customer_account_id_map, courier_default_carrier, courier_api_vault_key). `D365ConnectionScreen` shows connection config (URL, tenant ID, client ID) but D365 Constants Editor (SET-081: the actual FNOR/ForzDG/FinGoods value table) is conflated with the D365 mapping/field-level screen | MEDIUM — SET-080 (connection) and SET-081 (constants values table) merged; UX specifies them as separate screens |
| C-SET-07 | Schema Browser (SET-030): `SchemaBrowserScreen` present. UX §SET-030 specifies column browser with tier filters, dry-run trigger, shadow preview mode. Prototype has filtering and schema view modal ✓ | Minor gaps possible but core covered |

---

### D — Fitness Assessment

**Coverage:** ~72% of PRD §4.1 P1 Must screens represented. Two high-severity gaps: onboarding wizard entirely absent; SAP S/4HANA hallucination in audit data. Integrations catalog overreach adds noise. Core admin (users, roles, schema, rules registry, D365 config, feature flags, infrastructure) is well-covered.

**Risk summary:**

| Issue | Risk | Severity |
|---|---|---|
| C-SET-01 Onboarding wizard absent | New org has no guided setup path — P1 Must gap | HIGH |
| B-SET-01 SAP S/4HANA in audit log | Wrong ERP — factual error visible to Forza stakeholders | HIGH |
| B-SET-02 Integrations catalog hallucination | 16 fake integrations mislead scope conversations | HIGH |
| B-SET-04 Promotions screen has no PRD backing | Phantom feature may cause confusion | MEDIUM |
| C-SET-04 Only 4 of 10 system roles in user list | Incomplete RBAC data | MEDIUM |
| C-SET-05 v3.1 bundled delta reference tables missing | Shipping override reasons / RMA codes not in reference CRUD | MEDIUM |
| C-SET-06 D365 connection + constants conflated | Two distinct UX screens merged | MEDIUM |
| B-SET-03 Label editor in wrong module | Creates wrong module ownership mental model | LOW-MEDIUM |
| B-SET-05 Products/BOMs in Settings scope | Module boundary confusion | LOW |

**FITNESS: RED**
Strong coverage of infrastructure, rule registry, D365 config, and feature flags. But three HIGH-severity issues (missing onboarding wizard — a P1 Must — plus two factual/scope hallucinations) prevent GREEN or YELLOW rating. Onboarding wizard must be added; SAP/integrations hallucinations must be corrected before stakeholder review.

---

---

## Summary Table

| Module | Coverage est. | Fitness | Key risk |
|---|---|---|---|
| 11-SHIPPING | ~85% | YELLOW | RMA disposition mis-scoped as P2 (is P1 Must); BOL allergen render gap; 2 admin screens missing |
| 02-SETTINGS | ~72% | RED | Onboarding wizard absent (P1 Must); SAP S/4HANA hallucination; fabricated integrations catalog |

---

## Cross-module notes

1. **11-SHIPPING consumes 02-SETTINGS §7/§8/§11** — shipping_override_reasons and rma_reason_codes registered in 02-SETTINGS §8 (v3.1 bundled delta) are absent from the Settings Reference Tables prototype. Both modules must align on this.
2. **D365 constants reuse (D-SHP-18)**: Settings prototype conflates D365 connection config with constants editor. Shipping expects to read FNOR/ForzDG/FinGoods from a dedicated constants table (SET-081). This architectural gap spans both prototypes.
3. **ADMIN-SHP-02 DLQ screen**: Shipping PRD §12.6 specifies `/admin/integrations/d365/dlq` as a reuse of 08-PROD DLQ ops screen filtered by `source='shipping'`. Settings integrations screen has no DLQ view at all — this cross-module dependency is unrepresented in both prototypes.

---

*Audit-3 completed 2026-04-23. READ-ONLY — no prototype files modified.*
