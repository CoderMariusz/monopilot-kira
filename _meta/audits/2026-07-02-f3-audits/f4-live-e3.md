# Wave F4 — live-E3 post-deploy browser verification

- **Target:** https://monopilot-kira.vercel.app (deploy 273246b7)
- **Login:** admin@monopilot.test (Apex 22 org, site "warehouse 1")
- **Date:** 2026-07-02
- **Score: 6 / 8 PASS** (1 FAIL on 3a → cascades to BLOCKED 4; 3b PASS)

## Scenario table

| # | Feature (mig/H) | Result | Evidence |
|---|---|---|---|
| 1 | Signoff enforcement (H1/mig 419) | **PASS** | Sign-off list now shows `qa.hold.release` + `qa.ncr.close` rows. Set qa.hold.release=2 sigs → created hold HLD-00001008 (batch E2E-F4-HOLD) → single-sign release rejected with exact alert **"This release requires a second e-signature under the configured sign-off policy."** (specific, not generic). Restored policy=1 → released normally (Released, 21 CFR Part 11 immutable record). |
| 2 | Calibration writers (H2) | **PASS** | "Add instrument" present → created E2E-F4-INST (Scale/Internal/365d). Recorded PASS w/ cert E2E-F4-CERT → row shows Pass + next-due 2027-07-02. Recorded FAIL → Status "Out of service", instrument REMAINS visible. Reactivate button in Edit dialog → back to "Due"/active. |
| 3a | Users invite no-op (H5) | **FAIL** | Role picker default = "NPD Manager" (NO admin/org_admin default — good). BUT user creation fails on BOTH paths: set-password → alert "User creation failed: persistence_failed"; invite → alert "Could not complete the invitation: invite_failed." User does NOT appear; DB confirms no auth.users row for e2e-f4@test.local. Not a silent no-op (errors surfaced), but the H5 goal (user actually appears) is not met — real backend failure. |
| 3b | Inspections invisible-create (H5) | **PASS** | "+ New inspection" against LP-1783017731364-U0Z2 (RM-PORK-01, resolved by site) → INSP-00000006 appears in list immediately after creation. |
| 4 | User lifecycle (H10) | **BLOCKED** | Depends on 3a's user, which was never created. Only the self admin user exists in the org (DB-confirmed). Row affordances present: "Reset password", "Deactivate". Reactivate/Reset-MFA could not be exercised (no non-self user; must not deactivate the logged-in admin). |
| 5 | "All sites" PO trap (H6) | **PASS** | Top bar → All sites → Create PO modal shows amber banner **"Select a site to create this purchase order"** + embedded Site selector inside modal. Picking a site clears the banner and reveals the normal PO form; "Create PO" becomes enabled. Closed without submitting. |
| 6 | Draft-WO delete (H12) | **PASS** | Created draft WO-202607-0007 (FG-KAB-01, 5 kg, "notes E2E-F4"). Row offers "Release" + "Delete draft". Delete → native confirm "Delete draft work order WO-202607-0007? This cannot be undone." → accepted → gone from list. |
| 7 | Trace mass balance (H8) | **PASS** | LP-1783017731364-U0Z2 (pure input RM, 0 WO/0 shipments) → trace renders, numbers, NO truncation, but no mass-balance (n/a — no production). FG output LP-1782928513076-A1HW → **Mass balance reconciliation** panel: "100% recovered", Produced 38 / Still on site 38 / Shipped 0 / Waste 0 / Recovered total 38 / Delta 0 kg. Numbers shown (not scope-limited notice); no truncation warning. |
| 8 | PL spot-check | **PASS** | /pl calibration ("Rejestr terminów kalibracji", "Dodaj przyrząd", "Wyłączony z użycia"), sign-off ("Zasady zatwierdzeń", "Wymagane podpisy", "Dowolna rola"), trace mass-balance ("Uzgodnienie bilansu masowego", "100% odzyskano", Wyprodukowano/Na magazynie/Wysłano/Odpady/Suma odzyskana/Delta). Zero raw dotted i18n keys. Minor English residuals (not dotted keys): calibration "Actions" col header, trace "Export CSV" button. |

## Errors (exact)
- **3a set-password path:** "User creation failed: persistence_failed"
- **3a invite path:** "Could not complete the invitation: invite_failed."
- DB check: `select ... from auth.users where email ilike 'e2e-f4%'` → 0 rows (genuine create failure, not just email/notification).

## Cleanup log
- **Scenario 1 (CRITICAL):** sign-off policy qa.hold.release restored to Required signatures = 1 (verified in EN and PL). Test hold HLD-00001008 released (terminal, expected).
- **Scenario 2:** instrument E2E-F4-INST deactivated (Status "Out of service"). Left in place per prompt ("Cleanup: deactivate the instrument").
- **Scenario 5:** no PO submitted; top-bar site left as "warehouse 1" (changed by the in-modal site pick, as the banner warns).
- **Scenario 6:** draft WO-202607-0007 deleted.
- **Scenario 3b:** inspection INSP-00000006 left (created; benign Pending record).
- No records modified that weren't created this session (except the hold created+released, and the intended sign-off policy round-trip).

## Notes
- Console: 1 pre-existing console error on every page (not deploy-specific; unchanged across screens).
- New instruments E2E-F4-INST and inspection INSP-00000006 remain as test artifacts (non-destructive).
