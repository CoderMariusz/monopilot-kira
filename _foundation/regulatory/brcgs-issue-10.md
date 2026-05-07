---
title: "BRCGS Global Standard for Food Safety — Issue 10"
enforcement_date: "2026-12-31"
scope_modules:
  - 03-TECHNICAL
  - 09-QUALITY
last_reviewed_at: "2026-05-07"
source_url: "https://www.brcgs.com/our-standards/food-safety/"
---

# BRCGS Food Safety Issue 10

> Enforcement date: **2026-12-31** — PRD §11 states "2026 (post consultation)"; this file uses
> 2026-12-31 as the conservative end-of-2026 placeholder until BRCGS publishes the
> official transition deadline. **Review immediately when the official date is announced.**
> Source URL: https://www.brcgs.com/our-standards/food-safety/

## Scope

BRCGS (Brand Reputation through Compliance Global Standards) Global Standard for Food Safety
Issue 10 is an audit standard used by food manufacturers seeking BRCGS certification.
Issue 10 (successor to Issue 9) introduces updated requirements across:

- Food safety culture (Section 1 enhanced)
- Environmental monitoring programmes (Section 4)
- Food fraud vulnerability assessment (Section 5)
- Allergen management (Section 5 / Clause 5.3)
- Traceability and mass balance exercises (Clause 3.9 — forward + backward within 4 hours)
- Equipment and maintenance (Section 6)
- High-care / high-risk production zone requirements (Appendix 2)

**Monopilot scope:**
- 09-QUALITY: CCP management, allergen controls, non-conformance tracking.
- 03-TECHNICAL: `factory_spec` approval workflow, traceability forward+backward (PRD §13
  success criteria: `<30s` system query; BRCGS requires audit exercise `<4h`).

## Impacted foundation contracts

| Contract | Impact |
|---|---|
| `_foundation/glossary/domain-terms.md` | `factory_spec` row — BRCGS audit readiness depends on approved factory_spec |
| `_foundation/contracts/d365-posture.md` | D365 BOM pull creates `draft` shared_bom_revision; factory-use approval (BRCGS readiness) requires `factory_spec.status=approved` |
| `audit_events` schema (PRD §11) | BRCGS mass-balance exercises require traceability audit trail; `retention_class='standard'` (3y) |

## Open questions

1. Has BRCGS published an official Issue 10 transition date? (PRD §11 says "post consultation" — update when confirmed.)
2. Does Apex currently hold BRCGS Issue 9 certification, or is Issue 10 a first-time certification target?
3. Which allergen management fields from EU FIC 1169/2011 (see `eu-fic-1169-2011.md`) overlap with BRCGS Issue 10 Clause 5.3?
4. Will the 09-QUALITY module support automated BRCGS mass-balance traceability exercises?
5. Is the PRD §13 `<30s` traceability query sufficient for BRCGS `<4h` audit exercise requirement?
