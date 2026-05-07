---
title: "EU VAT in the Digital Age (ViDA) — Council Directive (EU) 2025/516"
enforcement_date: "2030-07-01"
scope_modules:
  - 10-FINANCE
  - 11-SHIPPING
last_reviewed_at: "2026-05-07"
source_url: "https://taxation-customs.ec.europa.eu/taxation/value-added-tax/vat-digital-age-vida_en"
---

# EU ViDA — VAT in the Digital Age

> Enforcement date: **2030-07-01** — source: PRD §11 regulatory roadmap table.
> Source URL: https://taxation-customs.ec.europa.eu/taxation/value-added-tax/vat-digital-age-vida_en

## Scope

EU ViDA (VAT in the Digital Age) introduces three main pillars:
1. **Digital Reporting Requirements (DRR):** Real-time digital VAT reporting for intra-EU B2B transactions.
2. **Platform economy VAT rules:** Deemed supplier rules for digital platforms.
3. **Single VAT registration:** One-Stop Shop (OSS) expansion for EU-wide supplies.

**Key obligations for Monopilot:**
- E-invoices for intra-EU B2B transactions must be structured (EN 16931 standard).
- Transaction-level VAT data must be reported digitally to tax authorities near real-time.
- Member states must accept structured e-invoices without prior authorisation from 2028;
  mandatory e-invoicing for domestic transactions from 2030-07-01.
- The Peppol network is the recommended transmission channel (aligned with peppol-be.md).

**Monopilot scope:** 11-SHIPPING (invoice generation + e-transmission) and
10-FINANCE (VAT reporting export). Foundation layer defines audit trail requirements only.

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `audit_events` schema (PRD §11) | Invoice and VAT reporting events must be audit-logged; `retention_class='standard'` (3 years) — aligns with typical VAT record retention minimums |
| `_foundation/contracts/d365-posture.md` | D365 Finance integration (when enabled) must not become the VAT reporting source of truth; Monopilot owns invoice data |

## Open questions

1. Which ViDA pillar has the earliest practical impact on Monopilot (DRR for intra-EU B2B)?
2. Does the 2030-07-01 final date supersede earlier phased obligations (e.g. 2028 e-invoice acceptance)?
3. How does ViDA align with the existing Peppol access point decision (peppol-be.md open question #1)?
4. Which EU member states in Apex's customer base require DRR earliest?
5. Does 10-FINANCE need a separate VAT ledger schema or can the existing audit trail satisfy DRR?
