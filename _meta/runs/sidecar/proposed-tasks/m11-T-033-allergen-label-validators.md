# PROPOSED NEW TASK — 11-shipping T-033: Allergen-label validators (V-SHIP-LBL-01..05) + SSCC-ASN allergen element

**Type:** NEW task. **Priority:** MED. **Finding:** S-1. **Sub-module:** 11-shipping-f (Documents).

## Why
PRD §4.1 #6 lists allergen labelling on "packing slip + BOL + **SSCC ASN**" as a P1 **Must**, and §11 defines **V-SHIP-LBL-01..05** validators. Existing T-023 covers the *bold allergen list rendering* on BOL/packing-slip PDFs, but no task owns the **validator suite as a testable unit**:
- V-SHIP-LBL-01: allergen list matches BOM cascade (via 03-TECH `allergen_cascade_v1`)
- V-SHIP-LBL-02..04: no missing EU-14 allergens; customer-restriction conflict → segregation warning on picking sequence
- V-SHIP-LBL-05: format validation

Also unowned: the **SSCC ASN `Allergens` GTIN-linked element** (§13.3) — note the full retailer ASN *file* (EDI-856 / EPCIS JSON-LD) is correctly P2 (Epic 11-G/11-L), so scope here is the **P1 validators + the allergen data element shape**, NOT the P2 ASN transport.

## Proposed task contract
- `apps/web/lib/services/shipping-allergen-label-validator.ts` [create] — pure functions implementing V-SHIP-LBL-01..05; consumes `products.allergens` (03-TECH) + `customers.allergen_restrictions`; calls `allergen_cascade_v1` (03-TECH rule).
- unit tests [create] asserting each V-SHIP-LBL rule (pass + fail + segregation-warning paths).
- wire into T-023 (BOL/packing-slip generation) and T-013/T-016 (pick segregation warning) as a function call.

## Dependencies
- 11-shipping T-001 (customers.allergen_restrictions), T-006 (sales_order_lines.product_id)
- 03-technical: `allergen_cascade_v1` rule + `products.allergens`
- 01-npd T-001 (product FG allergens SSOT)

## Out of scope
- Retailer ASN transport file (EDI-856 / EPCIS JSON-LD) — P2 Epic 11-G/11-L.
- GS1 Digital Link QR — P2 (D-SHP-16).

## Acceptance
- All five V-SHIP-LBL rules have RED-first unit tests, green.
- BOL/packing-slip generation (T-023) rejects/flags per validators; pick flow shows segregation warning on customer-restricted allergen conflict.
