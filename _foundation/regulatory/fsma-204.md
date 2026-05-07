---
title: "FDA Food Safety Modernization Act — Section 204 (FSMA 204) Additional Traceability Records"
enforcement_date: "2028-07-20"
scope_modules:
  - 01-NPD
  - 05-WAREHOUSE
  - 08-PRODUCTION
  - 11-SHIPPING
last_reviewed_at: "2026-05-07"
source_url: "https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods"
---

# FSMA 204 — FDA Additional Traceability Records for Certain Foods

> Enforcement date: **2028-07-20** — source: PRD §11 regulatory roadmap table.
> Source URL: https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods

## Scope

FSMA Section 204 requires food manufacturers, processors, packers, and holders of foods on the
Food Traceability List (FTL) to maintain additional traceability records (Key Data Elements — KDEs)
at defined Critical Tracking Events (CTEs) in the supply chain.

**Key obligations:**
- Maintain KDEs at each CTE: growing, receiving, transforming, creating, shipping.
- Records must be retrievable within 24 hours of an FDA request.
- Traceability lot codes (TLC) must link forward and backward through the supply chain.
- Electronic records are required for entities above the small-business threshold.

**Monopilot scope:** All FTL commodity lots tracked via `org_id`-scoped lot records.
Audit trail entries with `aggregate_type IN ('lot','shipment')` satisfy Part 11 +
FSMA 204 record-retention requirements (PRD §11 Audit log compliance scope).

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `_foundation/contracts/d365-posture.md` | `org_id` scoping on all lot/shipment audit records |
| `_foundation/glossary/domain-terms.md` | `fg.*` event prefix for finished-good lot creation |
| `audit_events` schema (PRD §11) | `retention_class='security'` → 10 years for US tenants with FDA 21 CFR Part 11 |

Module implementations (01-NPD lot DDL, 05-WAREHOUSE lot receive, 08-PRODUCTION WO lot,
11-SHIPPING EPCIS events) are out of scope for this Foundation artifact.

## Open questions

1. Which FTL commodity categories apply to Apex's current product portfolio?
2. Is the small-business exemption applicable for current org size?
3. Does the EPCIS 2.0 event schema in 11-SHIPPING cover all required KDEs for TLC linkage?
4. What is the retention strategy for lot records after the 2-year minimum (PRD §11 security tier = 7y / 10y for Part 11)?
