---
title: "Peppol B2B e-invoicing — Belgium (Mandatory B2B)"
enforcement_date: "2026-01-01"
scope_modules:
  - 11-SHIPPING
last_reviewed_at: "2026-05-07"
source_url: "https://www.peppol.org/news/belgium-to-mandate-e-invoicing-for-b2b-transactions/"
---

# Peppol B2B Belgium — Mandatory B2B e-Invoicing

> Enforcement date: **2026-01-01** — source: PRD §11 regulatory roadmap table.
> Source URL: https://www.peppol.org/news/belgium-to-mandate-e-invoicing-for-b2b-transactions/

## Scope

Belgium mandates Peppol-based e-invoicing for B2B transactions.
All Belgian businesses must be able to receive structured e-invoices via the Peppol network
from 1 January 2026, with phased obligation for sending.

**Key obligations:**
- Invoices must be structured electronic documents (UBL 2.1 / CII) transmitted via Peppol.
- A Peppol access point (SMP-registered) is required for send/receive.
- The Peppol BIS Billing 3.0 profile is the standard invoice format.
- VAT details, line-item structure, and supplier/buyer Peppol IDs must be present.

**Monopilot scope:** 11-SHIPPING is the primary module responsible for generating
and transmitting Peppol-compliant invoices. The Peppol access point vendor decision
is deferred to Phase C4 (PRD §14 open item #12 — Storecove / Pagero / Tradeshift).

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `_foundation/contracts/d365-posture.md` | D365 push (outbound) for shipment data must not be confused with Peppol invoice send — separate pipelines |
| `audit_events` schema (PRD §11) | Peppol invoice send/receive events should be audit-logged with `retention_class='standard'` |

## Open questions

1. Peppol access point vendor selection (deferred to Phase C4): Storecove vs Pagero vs Tradeshift?
2. Is the enforcement date confirmed as 2026-01-01 for the sending obligation, or only receiving?
3. Which `org_id`s in Apex's customer base are Belgian legal entities subject to this mandate?
4. How does the Peppol SMP registration interact with the `org_id` multi-tenant model?
5. Does the Belgian mandate cover cross-border EU invoices, or only domestic BE transactions?
