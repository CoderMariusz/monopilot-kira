---
title: "Polska KSeF — Krajowy System e-Faktur (Polish National e-Invoicing System)"
enforcement_date: "direction-known-date-explicitly-unset"
scope_modules:
  - 10-FINANCE
  - 11-SHIPPING
last_reviewed_at: "2026-05-07"
source_url: "https://www.gov.pl/web/kas/krajowy-system-e-faktur"
---

# Polska KSeF — Krajowy System e-Faktur

> Enforcement date: **direction-known-date-explicitly-unset** — PRD §11 states
> "Opóźniony, kierunek pewny" (delayed, direction certain). No confirmed date has been
> set by the Polish Ministry of Finance at the time of this review.
> Update `enforcement_date` to an ISO 8601 date as soon as the official date is announced.
> Source URL: https://www.gov.pl/web/kas/krajowy-system-e-faktur

## Scope

KSeF (Krajowy System e-Faktur) is the Polish national platform for structured e-invoicing.
All Polish VAT taxpayers will be required to issue and receive invoices through KSeF using
the FA(2) structured XML format (UPO confirmation returned by the system).

**Key obligations (once mandatory):**
- All B2B invoices between Polish VAT taxpayers must be issued via the KSeF API.
- The FA(2) XML schema replaces paper and PDF invoices for Polish legal entities.
- Invoices receive a KSeF number (Numer KSeF) as the official invoice identifier.
- The KSeF API requires certificate-based authentication (qualified electronic seal).
- Offline mode (invoicing outside KSeF during system unavailability) has specific rules.

**Context:** The original mandatory date of 1 July 2024 was delayed by the Polish government
following technical and readiness concerns. The Ministry of Finance has committed to
mandating KSeF; a revised date is pending publication. Voluntary KSeF use is already possible.

**Monopilot scope:**
- 11-SHIPPING: Invoice generation and KSeF API submission.
- 10-FINANCE: KSeF number storage, VAT reporting integration.

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `audit_events` schema (PRD §11) | KSeF submission events (success / DLQ) must be audit-logged; `retention_class='standard'` (3 years) |
| `_foundation/contracts/d365-posture.md` | D365 Finance integration (when enabled) must not be the KSeF submission path; Monopilot owns the KSeF API call |

## Open questions

1. What is the revised mandatory KSeF date? Monitor https://www.gov.pl/web/kas/krajowy-system-e-faktur for announcements.
2. Which `org_id`s in Apex's customer base are Polish VAT taxpayers subject to KSeF?
3. Does the FA(2) XML schema align with the Peppol UBL 2.1 invoice format, or is it a divergent schema?
4. How will KSeF offline-mode invoices (issued outside KSeF during downtime) be reconciled in Monopilot?
5. Is a qualified electronic seal (kwalifikowana pieczęć elektroniczna) available for the Monopilot SaaS tenant?
