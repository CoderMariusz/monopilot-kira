# Wave F3 — live-E3 post-deploy browser verification

Target: https://monopilot-kira.vercel.app (deploy 28b58511, READY)
Org: Apex 22 (A2), site "warehouse 1" selected. Logged in as admin@monopilot.test.
Migrations 415/416/417 confirmed LIVE in postgres logs (416_org_compliance_profile, 417_customer_address_default_uq).

## Score: 5 / 7 PASS (2 FAIL)

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Compliance profile (G6/mig416) | **FAIL (partial)** | Cert fields persist; **audit dates do NOT persist** |
| 2 | RBAC badges (G8) | PASS | Correct badge differential in /settings/roles View Permissions |
| 3 | Customer master (G9/mig417) | **FAIL (i18n)** | All CRUD + single-default + navigation work; detail surface leaks raw i18n keys |
| 4 | Desktop GRN receive (G10) | **FAIL** | Receive throws V-WH-GRN-001; no GRN/LP minted |
| 5 | Audit timeline (G5) | PASS | PO History renders entries; hold History renders (empty for fresh hold) |
| 6 | Batch-hold display (G2) | PASS | Batch text shows in list/detail/search; no uuid error; released cleanly |
| 7 | i18n spot-check (/pl) | PASS | Historia / Profil zgodności / Jeszcze nieegzekwowane all correct |

---

## Scenario 1 — Compliance profile (G6) — FAIL (partial)
- /settings/compliance exists under Organization nav group. Page renders Certification, Audit schedule, Registration numbers sections.
- Filled BRCGS site code "E2E-F3E-BRC1", certification body "BRC Test Body", grade "AA", last audit 2026-01-15, next audit 2027-01-15. Save (POST 200).
- **After reload: certification text fields (BRCGS code, body, grade) PERSIST. Audit date fields (last/next) are EMPTY.**
- Single shared "Save changes" button in the Certification region governs the whole form; entering dates re-enables it, save returns 200, but the dates are dropped on persist/round-trip.
- Cross-verified in PL: BRCGS code E2E-F3E-BRC1 still shows → cert-field persistence is real, date-field persistence is broken.
- Root cause is server-side date handling (the `org_compliance_profile` table has last_audit_date/next_audit_date date columns per mig 416, but the action isn't writing them). Screenshot: e2e-f3e-1.png

## Scenario 2 — RBAC badges (G8) — PASS
- Badges live at **/settings/roles** (SET-011 "Roles & Permissions"), NOT the /settings/users module-rollup grid (that grid has no per-permission badges).
- "View Permissions" read-only dialog for Finance Manager: 59 granted, grouped by module.
- Enforced perms show "Granted" with NO badge: fin.costs.read, production.consumption.write/override_approve/correct, mnt.asset.read.
- Non-enforced perms show "Not yet enforced" badge (tooltip "Granting this permission has no effect yet — no runtime check uses it."): fin.settings.edit, fin.standard_cost.edit, fin.costs.manage, fin.valuation.*, fin.variance.*, quality.settings.edit, quality.audit.export, etc.
- Differential is correct and matches lib/rbac/enforced-permissions.ts.

## Scenario 3 — Customer master (G9/mig417) — FAIL (i18n only; functionality PASS)
- Shipping → Customers. Created "E2E-F3E-CUST" (code CUST-2026-00001, uuid 7a9c4e56-c8e1-47ab-8880-bd10660fd88c).
- **Row now navigates to a DETAIL page** (/shipping/customers/<uuid>) — the create-only→detail fix works.
- Edit: changed Email → e2e-f3e@test.local, persisted on detail. PASS.
- Added address 1 (1 E2E-F3E Street, Testville, marked default) → shows defaultStar.
- Added address 2 (2 E2E-F3E Avenue, Secondtown, set default) → **address 1 lost default** (notDefault + gained a "setDefault" action). Single-default rule (mig417 unique index) works.
- Deactivated non-default address 1 → removed from active list. PASS.
- Deactivated the customer (cleanup) → Inactive.
- **FAIL: the entire customer-DETAIL surface renders raw i18n keys in BOTH en and pl** — e.g. `Shipping.customers.detail.title`, `.actions.edit`, `.actions.deactivate`, `.tabs.profile`, `.tabs.addresses0`, `.profile.identityTitle`, `.profile.fields.*`, `.addresses.title/empty/hint/columns.*`, `.addresses.modal.*`, `.edit.title/submit`. The keys use a **capital "Shipping." namespace prefix** that doesn't resolve in either locale.
- **Also on the customers LIST**: column header leaks `Shipping.customers.list.columns.addressCount`.
- GLN field absent — no GLN in create modal, edit modal, or profile.

## Scenario 4 — Desktop GRN receive (G10) — FAIL
- Created PO-202607-0013 (supplier SUP-003 Sup meat, 1 line RM-PORK-01 Pork shoulder qty 5 kg @ 5.2 GBP, notes "E2E-F3E"). Submitted → status "Sent".
- /warehouse/receive-po/<poId> renders "Receive purchase order" with the line (Ordered 5.000 kg, Outstanding 5 kg). Qty received prefilled to 5 (= outstanding, correct). Entered batch "E2E-F3E-BATCH1", dest location CHILL·LOC1.
- **Submit fails with UI toast "Something went wrong receiving. Please retry." (POST 200, server-action error payload). Retry fails identically.**
- **Postgres error (root cause): `V-WH-GRN-001: grn_items are frozen once the GRN is completed (grn_id=...)`** — logged twice at the two attempt timestamps. The receive action marks/creates the GRN completed before/while inserting grn_items, and the freeze-guard rejects the item write.
- No GRN/LP persisted (transaction rolled back cleanly; `select from grns where po_id=<po>` returns 0 rows). No stock minted → nothing to clean up on warehouse side.
- Screenshot: e2e-f3e-4.png

## Scenario 5 — Audit timeline (G5) — PASS
- PO-202607-0013 detail: collapsed "History" section at bottom renders entries — "planning.purchase_order.created" (2 Jul 2026, 19:04 · Admin) plus "status_changed" after submit. Details disclosure present.
- Quality hold HLD-00001007 detail: "History" section present and expandable. For a freshly-created hold it shows "No history yet — Changes to this document will appear here." (section renders correctly; the hold-creation event is not written into its own timeline — minor gap, not a fail of the ask which was "History section present?").

## Scenario 6 — Batch-hold display (G2, F2 escape) — PASS
- Quality → Holds → Create hold → reference type "Batch" → free-text Reference ID "E2E-F3E-BATCH1" + reason. Created HLD-00001007, **no invalid-uuid error**.
- LIST row shows Ref type "Batch", Reference "E2E-F3E-BATCH1" (not blank).
- DETAIL shows Reference: Batch → E2E-F3E-BATCH1.
- Search "E2E-F3E-BATCH1" filters the list to the hold. Works.
- Released the hold (disposition "Release as-is", notes, account password Admin2026!!!) → status "Released", "immutable (21 CFR Part 11)". Cleanup done.

## Scenario 7 — i18n spot-check (/pl) — PASS
- /pl/settings/compliance → title "Profil zgodności", "Certyfikacja", "Kod zakładu BRCGS". Saved value E2E-F3E-BRC1 persists across locale.
- /pl/settings/roles View Permissions dialog → badge "Jeszcze nieegzekwowane" (155×) with correct PL tooltip "Nadanie tego uprawnienia nie ma jeszcze skutku — żaden mechanizm runtime go nie sprawdza."
- /pl PO detail → History heading "Historia", subtitle "Tylko do odczytu — ślad audytu tego dokumentu.", audit entries present. No raw-key leakage on these three surfaces.

## Cleanup log
- Customer E2E-F3E-CUST (CUST-2026-00001): DEACTIVATED. Its 2 addresses: addr1 deactivated, addr2 remains on the inactive customer.
- Hold HLD-00001007 (batch E2E-F3E-BATCH1): RELEASED.
- Compliance profile: left org-level values (E2E-F3E-BRC1 / BRC Test Body / AA) — org-scoped header, low impact; can be blanked if desired.
- PO-202607-0013: could not be received (G10 bug). CANCELLED as cleanup (see final action).
- No stock/LP minted anywhere (G10 receive failed and rolled back).

## Non-blocking observations
- Compliance form has a single Save button for 3 sections; UX could confuse (dates share the Certification-region save).
- Customer-detail i18n keyspace uses capital "Shipping." — likely a namespace-casing mismatch in the new G9 messages wiring.
