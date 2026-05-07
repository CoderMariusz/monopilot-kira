---
title: "EU Deforestation Regulation (EUDR) — Regulation (EU) 2023/1115"
enforcement_date: "2026-12-30"
scope_modules:
  - 01-NPD
  - 11-SHIPPING
last_reviewed_at: "2026-05-07"
source_url: "https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en"
---

# EUDR — EU Deforestation Regulation (EU) 2023/1115

> Enforcement date: **2026-12-30** — source: PRD §11 regulatory roadmap table.
> Source URL: https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en

## Scope

The EU Deforestation Regulation prohibits placing on the EU market, or exporting from it,
products associated with deforestation or forest degradation after 31 December 2020.
Covered commodities include: cattle, cocoa, coffee, palm oil, soya, wood, rubber,
and derived products.

**Key obligations:**
- Due diligence statements (DDS) required before placing in-scope products on the EU market.
- Geolocation data must link products to the specific plot(s) of land where they were produced.
- Risk assessment and mitigation procedures for each supply chain actor.
- Operators and traders must maintain records for 5 years.

**Monopilot scope:** BOM commodity traceability in 01-NPD (raw material sourcing metadata),
and shipment documentation in 11-SHIPPING. Future Procurement module will carry supplier
deforestation risk assessments.

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `_foundation/glossary/domain-terms.md` | `shared_bom` / `factory_spec` rows — commodity sourcing metadata fields |
| `_foundation/contracts/d365-posture.md` | D365 item-master pull jobs bring commodity data; `org_id`-scoped only |
| `audit_events` schema (PRD §11) | `retention_class='standard'` (3 years); EUDR requires 5 years — gap to resolve in 01-NPD |

## Open questions

1. Is cocoa or palm oil a significant commodity in Apex's current product portfolio requiring DDS?
2. How does the geolocation plot data integrate with the existing `shared_bom` schema?
3. What is the 5-year retention strategy for EUDR DDS records vs the current `standard` (3y) retention tier?
4. Which supplier fields are required in the future Procurement module to satisfy EUDR risk assessment?
5. Has the enforcement date of 2026-12-30 been confirmed following the Commission's 2024 delay proposal?
