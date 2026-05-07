# Regulatory Roadmap — `_foundation/regulatory/`

> **Owner role:** Regulatory Compliance Lead (see PRD §11 "Regulatory roadmap — first-class artifact").
> The Regulatory Compliance Lead is responsible for keeping all regulation files current,
> escalating deadline changes to the Product Owner, and coordinating module leads when
> an enforcement date shifts.
>
> **Source:** `docs/prd/00-FOUNDATION-PRD.md` §11 — "Review kwartalny (FDA/KE zmieniają terminy)."

---

## Review cadence

Each regulation file has a `last_reviewed_at` YAML front-matter field.
Reviews are **quarterly — every 90 days**.
The staleness guard (`scripts/check-regulatory-staleness.mjs`) fails CI
when any file has not been reviewed within **100 days** of the current date.

| Trigger | Action |
|---|---|
| Enforcement date announced / changed | Update `enforcement_date`; bump `last_reviewed_at` |
| New regulation identified | Add a new file from the template below; run staleness check |
| Quarterly calendar alarm (every 90 days) | Review all 7 files; bump `last_reviewed_at` to today |
| CI staleness failure (>100 days) | Urgent: review the stale file(s) immediately |

---

## Wave0 naming rules (§W0-v4.3)

All regulation files and any associated foundation-layer artifacts MUST follow the
Wave0 locked decisions from PRD §W0-v4.3:

| Rule | Value | Source |
|---|---|---|
| Business scope key | `org_id` (UUID) | §W0-v4.3 §1 |
| Canonical event prefix for finished goods | `fg.*` | §W0-v4.3 §2 |
| Legacy D365 event alias (migration only) | `fa.*` — LEGACY ALIAS ONLY | §W0-v4.3 §2, §4.3-AMENDMENT |
| Business tables must NOT use | `tenant_id` as scope | §W0-v4.3 §1 |

> **Lock rule:** No new business semantics may be introduced here.
> Changes to Wave0 decisions require a §W0-vX.Y PRD amendment and a corresponding task.

---

## Files in this directory

| File | Regulation | Enforcement date |
|---|---|---|
| `fsma-204.md` | FDA FSMA Section 204 (US food traceability) | 2028-07-20 |
| `eudr.md` | EU Deforestation Regulation | 2026-12-30 |
| `peppol-be.md` | Peppol B2B e-invoicing — Belgium | 2026-01-01 |
| `eu-vida.md` | EU VAT in the Digital Age (ViDA) | 2030-07-01 |
| `brcgs-issue-10.md` | BRCGS Food Safety Issue 10 | 2026 (post consultation) |
| `eu-fic-1169-2011.md` | EU FIC 1169/2011 + 2021/382 (food labelling) | Active |
| `polska-ksef.md` | Polska KSeF (e-invoicing) | direction-known-date-explicitly-unset |

---

## Front-matter template

```yaml
---
title: "<Regulation full name>"
enforcement_date: "YYYY-MM-DD"   # ISO 8601; or direction-known-date-explicitly-unset
scope_modules:
  - 00-FOUNDATION
  - 01-NPD
last_reviewed_at: "YYYY-MM-DD"
source_url: "https://..."
---
```

All 5 YAML keys are **required**. Omitting any key causes `scripts/check-regulatory-staleness.mjs` to exit 1.
