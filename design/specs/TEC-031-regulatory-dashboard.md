# TEC-031 Regulatory Compliance Dashboard — Engineering Brief

**Task:** T-066
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §9.3, §9.5 TEC-031, §4A TEC-031
**Status:** SPEC-DRIVEN-WAVE0 — prototype creation deferred; spec-driven T3-ui task may proceed from this brief.
**Marker:** [INDUSTRY-CONFIG]

---

## 1. Purpose

This brief defines the Regulatory Compliance Dashboard contract: a read-only overview screen showing per-regulation compliance status for the org's FG portfolio, with per-FG flag tables and cross-links to 09-QUALITY ATP/cleaning evidence.

---

## 2. Regulation Tiles (7)

Each tile shows: regulation name, compliance status (OK / WARNING / FAIL / N/A), count of FGs affected, and last-evaluated timestamp.

| # | Tile label | Data source | Threshold / pass rule |
|---|---|---|---|
| 1 | **EU 1169/2011 — Allergen Declaration** | `items.allergen_profile` (via allergen cascade) | FAIL if any active FG has no `allergen_declaration` or allergen profile is incomplete (null allergens on a shipped FG) |
| 2 | **FSMA 204 — Traceability Records** | `lot_genealogy_status` view (traceability foundation §E03.10) | WARNING if any FG lot in last 90 days has missing traceability links (`lot_events` count = 0) |
| 3 | **BRCGS v9 — Training Competence Link** | `brcgs_training_links` reference (cross-link to 09-QUALITY training records) | WARNING if org has BRCGS v9 toggle enabled but no training record link exists for any active FG SOP |
| 4 | **ISO 22000 — HACCP Control Points** | `items.factory_spec.haccp_ccp_count` (from `factory_specs.internal_product_spec` JSONB) | FAIL if `haccp_ccp_count` = 0 for any FG with `shelf_life_mode = 'use_by'` |
| 5 | **EU 2023/915 — Contaminant Limits** | `alert_thresholds` where `threshold_key = 'atp_swab_rlu_max'` + lab results in 09-QUALITY read model | FAIL if any ATP swab result > `atp_swab_rlu_max` (default 10 RLU, PRD §10.6) in last 30 days |
| 6 | **GS1-DL — GTIN Completeness** | `items.gs1_gtin` | WARNING if any active FG has null `gs1_gtin` |
| 7 | **Peppol — EDI Readiness** | `items.d365_item_id` + org's `integration.d365.enabled` toggle | N/A if D365 disabled; WARNING if D365 enabled and >10% of active FGs have `d365_sync_status = 'unsynced'` |

**Note:** Tiles 3 (BRCGS) and 7 (Peppol) are `[INDUSTRY-CONFIG]` and should only render when the respective org toggle is enabled. The dashboard renders N/A tiles gracefully rather than hiding them.

Data sources for tiles 1–6 that are not yet shipped should show a "Data unavailable — pending [source module] implementation" notice rather than a false FAIL. Do not bind hard data sources that are not yet shipped.

---

## 3. Per-FG Flag Table Contract

Below the regulation tiles, a paginated table lists every active FG with per-regulation flag columns.

### Table columns

| Column | Type | Notes |
|---|---|---|
| FG Name | TEXT | `items.name` where `item_type = 'fg'` |
| Item Code | TEXT | `items.item_code` |
| EU 1169 | Badge | OK / FAIL |
| FSMA 204 | Badge | OK / WARNING / N/A |
| BRCGS v9 | Badge | OK / WARNING / N/A |
| ISO 22000 | Badge | OK / FAIL / N/A |
| ATP Swab | Badge | OK / FAIL / N/A |
| GS1-DL | Badge | OK / WARNING |
| Peppol | Badge | OK / WARNING / N/A |

### Filtering

- Filter by regulation tile (click tile = filter table to FGs with non-OK status for that regulation).
- Text search on FG Name / Item Code.

---

## 4. ATP/Cleaning Evidence Cross-link to 09-QUALITY

The ATP Swab tile (tile 5) and per-FG ATP badge cross-link to 09-QUALITY lab results:

- The dashboard reads `lab_results` as a **read model** from 09-QUALITY (03-TECHNICAL is read-only consumer; authorship of lab workflows stays in 09-QUALITY per PRD §0 decision 8).
- Click on a FAIL ATP badge opens a slide-over panel: "ATP Lab Evidence — [FG Name]".
- Panel shows: test date, RLU value, pass/fail vs threshold, linked WO reference, analyst name (from 09-QUALITY read model).
- "View in Quality module" deep-link navigates to the 09-QUALITY lab results log (TEC-045 / TEC-045 brief).

---

## 5. Server Action Semantics

- `getRegulatoryDashboard()` — aggregated read; org-scoped; returns tile summaries + FG flag rows.
- `getRegulatoryFgDetail(itemId)` — per-FG per-regulation detail for slide-over.
- All read-only; no write actions on this screen.
- Refresh cadence: tile data cached with 5-minute TTL; "Refresh now" button forces re-query.

---

## 6. Acceptance Gates (T3-ui drafting gate)

Before a T3-ui task may be drafted from this spec, **all** of the following must be confirmed:

1. All 7 regulation tiles reviewed and approved by Quality Lead.
2. Per-FG flag table columns confirmed by Quality Lead.
3. ATP/cleaning evidence cross-link to 09-QUALITY approved by Quality Lead and 09-QUALITY module owner.
4. N/A handling for unshipped data sources acknowledged by UX team.
5. Read-only server action signatures confirmed by backend engineer.

---

## 7. Out of Scope (this brief)

- Prototype JSX creation
- Implementation of tiles or flag table
- Authorship of lab workflows (09-QUALITY owns those)
- Hard-binding data sources not yet shipped
