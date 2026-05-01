# 14-MULTI-SITE PRD Amendments — Coverage Closure

**Date:** 2026-04-30
**PRD version:** v3.1 → v3.2
**Closes:** audit BLOCKER #2 from `_meta/audits/2026-04-30-design-prd-coverage.md` (14-MULTI-SITE row)
**Source files referenced:** `14-MULTI-SITE-PRD.md`, `design/14-MULTI-SITE-UX.md`, `_meta/prototype-labels/prototype-index-multi-site.json`, `_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md`
**Constraint:** stayed strictly within 14-MULTI-SITE; UX file untouched; no PRD deletions.

---

## 1. Coverage delta

| | Before (v3.1) | After (v3.2) |
|---|---|---|
| PRD-coded UI surfaces | 10 (MS-001..MS-010 dashboards only) | 28 (MS-001..MS-117, includes 13 NEW MS-100..MS-117 anchors) |
| Direction B (UX/proto orphans) | ~10 orphans | 0 orphans (all anchored or `[NO-PROTOTYPE-YET]`) |
| Direction A (PRD-only no design) | ~4 P2 dashboards implicit | 4 explicit `[NO-PROTOTYPE-YET]` markers |
| Coverage % (per audit methodology) | ~50% | ~88% |

Coverage improvement driver: Transport Lanes + Rate Cards module (entirely new section) plus 10 anchor subsections in §10B for previously-orphan UX screens / modals.

---

## 2. Sections added

### §10A. Transport Lanes + Rate Cards [UNIVERSAL] — 160 lines (~1100 words)

Full new top-level PRD section. Components:

- **§10A.1 Purpose & rationale** — explains lanes as master-data layer beneath D-MS-3 IST flow; rate cards feed cost suggestion + cost allocation
- **§10A.2 Data model** — three new DDL tables:
  - `transport_lanes` — org-scoped master with from/to sites, mode, distance, transit days, carriers[], hazmat/cold-chain/customs flags, max weight, active flag, unique `(org_id, lane_code)`
  - `transport_lane_rate_cards` — versioned via `superseded_by` chain (no UPDATE), per-carrier rate type/value/currency, effective window, approval status state machine (pending/active/expired/rejected)
  - `transport_lane_rate_audit` — independent action log per rate card (upload/approve/reject/expire/supersede/delete)
- **§10A.3 CRUD & lifecycle** — lane create/edit/deactivate/view RBAC table; rate-card 4-step upload pipeline (upload → column-mapping → preview → confirm); approval workflow (`site_settings['lane_rate_approval_required']`); supersede mechanics (no overlap UPDATE — always insert + chain)
- **§10A.4 Outbox events** — `transport_lane.created`, `transport_lane_rate_card.activated` (extends D-MS-12 catalog)
- **§10A.5 RBAC matrix** — 7 roles × 6 actions
- **§10A.6 Validation rule pointer** — defers to §11.6 V-MS-24..V-MS-29
- **§10A.7 Telemetry** — lane-coverage ratio, rate-card freshness, auto-suggestion acceptance rate (P2 analytics MV)

Anchors: UX `MS-LANE` (`design/14-MULTI-SITE-UX.md:808-846`), `MS-LANE-D` (`UX:849-906`), `MODAL-LANE-CREATE/EDIT` (`UX:1351-1373`), `MODAL-RATE-CARD-UPLOAD` (`UX:1377-1383`), prototypes `ms_lanes_list`/`ms_lane_detail`/`lane_create_modal`/`rate_card_upload_modal`.

### §10B. Other UX-only screens (Direction B) — 111 lines

10 new MS-NNN subsections, one per orphan UX screen / modal:

- **MS-101** Site Permissions Matrix — anchors `MS-PRM` + `permission_bulk_assign_modal` + `MODAL-PERMISSION-BULK-ASSIGN`
- **MS-102** Site Config Overrides — anchors `MS-SIT-CFG` + `site_config_override_modal` + `MODAL-SITE-CONFIG-OVERRIDE`
- **MS-103** Master-Data Conflict Resolution — anchors `MS-CONF` + `conflict_resolve_modal` (flags BL-MS-02 prototype bug)
- **MS-104** Site Decommission — anchors `MODAL-SITE-DECOMMISSION` + `site_decommission_modal`
- **MS-105** Promote Configuration Across Levels — anchors `promote_env_modal` (P2 partial)
- **MS-106** Replication Retry / Run Sync — anchors `MODAL-REPLICATION-RETRY` + `replication_retry_modal`
- **MS-107** IST Amend / Cancel — anchors `ist_amend_modal` + `ist_cancel_modal`
- **MS-108** Activation / Rollback Confirm — anchors existing D-MS-14 to UX modals (traceability only)
- **MS-109** Module Settings Hub — anchors `MS-CFG` + `ms_settings`
- **MS-110** Multi-Site Analytics — anchors `MS-ANA` + `ms_analytics` (P2)
- **Direction A table** — 4 explicit `[NO-PROTOTYPE-YET]` entries for cross-region replication health, multi-entity finance, customs/VAT, replication topology

### §10C. UI surfaces table — 39 lines

Single canonical mapping table covering all 28 MS-NNN entries (P1 + P2) with: PRD ID, description, UX screen / modal, prototype label, status. Includes ADR-034 hygiene note flagging `sites_screen` mis-tag (relocate to `prototype-index-settings.json`, tracked OQ-MS-13).

### Other amendments (in-place, no new top-level sections)

- **§7.2 D-decisions** — D-MS-16 added (Transport Lanes as org-master + versioned Rate Cards)
- **§7.3 Direction-B amendments** — new subsection with D-MS-17 (config-promotion as auditable action) and D-MS-18 (decommission = archive, never purge)
- **§11.6 Validation Rules** — new subsection V-MS-21..V-MS-30:
  - V-MS-21 site decommission pre-conditions
  - V-MS-22 sync retry authz
  - V-MS-23 IST amend/cancel state guards
  - V-MS-24 lane CHECK + UNIQUE constraints
  - V-MS-25 rate-card overlap warn-vs-critical
  - V-MS-26 pending rates excluded from cost calc
  - V-MS-27 ISO 4217 currency
  - V-MS-28 supersede-chain acyclic
  - V-MS-29 lane deactivate gated by in-flight ISTs
  - V-MS-30 conflict-resolve e-signature gate (flags BL-MS-02 unwired prototype)
- **§17 Open Items** — OQ-MS-11 (e-signature wiring), OQ-MS-12 (MS-110 vs 12-REP overlap), OQ-MS-13 (`sites_screen` mis-tag), OQ-MS-14 (ADR-034 generic-naming follow-up)
- **§18 Changelog** — v3.2 entry summarizing the addition
- **Frontmatter** — version v3.1 → v3.2, status updated

---

## 3. ADR-034 hygiene

ADR-034 calls for migration from industry-specific to generic naming. The existing v3.1 14-MULTI-SITE PRD bakes Apex / EDGE / "Chocolate factory" / "Candy" / "Bakery" as illustrative examples (§6.4.1, §9.1, §9.5, §9.7).

**Decision in this amendment pass:** preserve existing examples (no deletions per task constraint); flag the generic-naming follow-up via **OQ-MS-14** (P2 writing pass). Phase E owner gets to decide whether to recast §6.4.1 examples as Site A / Site B with neutral industry tables (via Reference.IndustryProfiles seed) or keep current illustrative examples until ADR-034 lands across all PRDs uniformly.

The new §10A / §10B / §10C content uses **generic naming** (no Apex / EDGE / industry-specific product names) to avoid compounding the ADR-034 debt.

---

## 4. TODOs (carried forward)

| ID | TODO | Owner / Phase |
|---|---|---|
| BL-MS-02 | Wire e-signature gate on `conflict_resolve_modal` (V-MS-30) — Phase E impl | 09-QA evidence integration |
| BL-MS-03 | Timezone toggle on `ms_settings` not applied to timestamp rendering app-wide | Phase E |
| BL-MS-05 | Real chart rendering on `ms_analytics` + `ms_lane_detail` History tab (currently CSS placeholders) | Phase E (chart-lib decision) |
| BL-MS-06 | Site-heartbeat real pinger (currently mock on `ms_dashboard`) | Phase E |
| BL-MS-07 | Hierarchy-edit wizard stub on `ms_settings` — full impl deferred | Phase E |
| OQ-MS-11..14 | Open questions per §17 amendments | Architecture / Phase E review |
| `[NO-PROTOTYPE-YET]` × 4 | MS-007/008/009 + cross-region topology — design+proto required if promoted to P1 | Phase E P2 wave |
| `sites_screen` mis-tag | Relocate from `prototype-index-multi-site.json` to `prototype-index-settings.json` | _meta/prototype-labels owner (OQ-MS-13) |

---

## 5. Blockers

**None for this PRD amendment.** PRD edits are purely additive and self-consistent.

**Blockers carried forward to Phase E impl** (not introduced by this amendment, but now formally tracked):

1. **BL-MS-02 e-signature gate** — V-MS-30 marks this critical-severity compliance gate. The conflict-resolve modal renders the field but does not commit re-auth before write. **Cannot ship MS-103 to production without wiring.** Tracked OQ-MS-11.
2. **MS-110 vs 12-REP overlap** — `ms_analytics` and `MS-005` benchmark dashboard duplicate scope. Phase E must decide: keep `ms_analytics` curated or fold into 12-REP. Tracked OQ-MS-12.
3. **`sites_screen` mis-tag** — pure index hygiene; resolves with one entry move. Tracked OQ-MS-13.

---

## 6. Verification

- [x] No deletions from v3.1 content
- [x] UX file untouched
- [x] Inline citations (UX line + prototype label) present in every new MS-NNN subsection
- [x] Transport Lanes section ≥ 500 words (actual: ~1100 words / 160 lines)
- [x] All 10 Direction-B orphans (per audit row 14-MS) anchored to a new MS-NNN
- [x] UI surfaces table covers all 28 MS-NNN entries
- [x] ADR-034 hygiene flagged (OQ-MS-14) without disturbing v3.1 examples
- [x] Frontmatter version bumped (v3.1 → v3.2)
- [x] Changelog entry added
