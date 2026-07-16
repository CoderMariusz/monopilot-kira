# HUNT — Finance + Quality + Shipping + Settings + Auth/RBAC (Fable)

Scope: `apps/web/lib/finance/**`, `lib/auth/**`, `lib/rbac/**`, module actions for
finance / quality / shipping, `actions/**`, admin settings.
Baseline deduped against FULL-REPORT C001–C120 + LEDGER W1–W8.

**Honest bottom line:** this area is *exceptionally* hardened (8 fix waves + audits).
The high-value security vectors I probed are all closed:
- `withOrgContext` / `withSiteContext` — JWT verified via `getUser()` (not cookies), org
  resolved from `public.users` (not JWT claims), deactivated-user check, platform-admin
  act-as gated + audited, fail-closed site binding. Clean.
- `assignRole` — grant-subset escalation guard + privileged-system-role guard +
  last-owner protection, all server-side. Clean.
- Security policy / force-MFA / D365-sync / holds / NCR / cancel-shipment / WAC math —
  every client-callable write gates on a real DB-backed permission check; e-sign paths
  intact; WAC NUMERIC clamps coherent. Internal helpers that take a `ctx`/pg-client arg
  are NOT reachable as server actions (non-serializable), so their lack of an inline gate
  is not exploitable.
- Audit `audit_log` vs `audit_events` split is a non-issue — the audit reader
  (`settings/audit/audit-log-loader.ts:258-260`) UNIONs both tables.

3 novel findings below (none in C001–C120). Nothing P0/P1.

| id | sev | file:line | one-line | why novel |
|----|-----|-----------|----------|-----------|
| NEW-P01 | P2 correctness | finance/_actions/wo-cost-actions.ts:344-348 | Hardcoded `'PLN'` fallback currency makes the whole WO actual-cost screen fail with a false `unsupported_currency` error whenever a resolved material has no `item_cost_history`/WAC snapshot. | C033/C034/C087-C090 cover WIP/labor/rounding costing; none touch this currency-tag false-reject. |
| NEW-P02 | P3 security/PII | shipping/customers/_actions/customer-actions.ts:122,155 | `listCustomers` / `getCustomer` have **no** RBAC gate — any authenticated org user (Viewer, operator) can read all customer PII (email/phone/tax_id + contacts + allergen restrictions). | C004 was the *users* directory PII leak; customer master-data readers are a different surface, never flagged. |
| NEW-P03 | P4 concurrency | shipping/customers/_actions/customer-actions.ts:80-92 | `nextCustomerCode` does unlocked `max(seq)+1`; concurrent `createCustomer` calls collide → one fails with a raw duplicate error, no retry. | Not in C001-C120 (audit was browser-driven, single-session). |

---

## NEW-P01 — WO actual-cost false `unsupported_currency` rejection (P2)

**File:** `apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts`
**Lines:** cost-currency CASE `344-348`, flag `377`, rejection `519-527`.

The materials CTE tags each consumption line with a `cost_currency`:

```sql
case
  when nullif(trim(c.ext_jsonb->>'wac_avg_cost'), '') is not null then $3::text   -- GBP
  when ch.cost_per_kg is not null then ch.currency
  else coalesce(ch.currency, 'PLN')        -- <-- hardcoded PLN
end as cost_currency
```

The `else` branch runs when the line has **no** `wac_avg_cost` snapshot **and** no
`item_cost_history` row (`ch` is null). `cost_per_kg` on the same line still falls back to
`i.cost_per_kg` (the denormalized item master cost), so the line is a fully *resolved*
material — but its currency is stamped `'PLN'`.

Then:
```sql
bool_or(cost_currency is distinct from $3::text) as has_non_gbp_currency   -- $3 = 'GBP'
```
and the action rejects the **entire WO** (lines 519-527):
```ts
const mixedCurrencyMaterial = resolvedMaterials.find((row) => row.has_non_gbp_currency);
if (mixedCurrencyMaterial) return { ok: false, reason: 'unsupported_currency', message: `Material … includes non-GBP consumption …` };
```

**Failure scenario:** A completed WO consumes a component whose cost lives only in
`items.cost_per_kg` (no `item_cost_history` row was ever written, no WAC snapshot on the
consumption — common for master-data-costed or manually-entered components). `computeWoActualCost`
returns `unsupported_currency` and the finance WO-cost screen shows a misleading
"includes non-GBP consumption" error instead of the cost. Worse: a **fully uncosted but
UoM-resolved** material (`cost_per_kg` null) is *also* tagged `'PLN'` → same false rejection,
claiming non-GBP data that does not exist.

**Root cause / lazy fix:** the fallback currency should be the reporting currency
(`$3` = GBP / org base), not a hardcoded `'PLN'`. One-token change in the CASE `else`.
Add a self-check WO with a `cost_per_kg`-only material asserting `ok:true`.

---

## NEW-P02 — Customer read endpoints have no RBAC gate (P3, within-org PII)

**File:** `apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-actions.ts`
**Lines:** `listCustomers` `122`, `getCustomer` `155`.

The write actions correctly gate on `SHIP_CUSTOMER_WRITE` via `hasCustomerWritePermission`
(`createCustomer:232`, `updateCustomer:281`, `setCustomerActive:339`). The two **read**
actions wrap only `withOrgContext` — **zero** permission check:

```ts
export async function listCustomers(params) {
  return await withOrgContext(async ({ client }) => { /* no hasPermission */ …select customers… });
}
export async function getCustomer(customerId) {
  return await withOrgContext(async ({ client }) => { …loadCustomerById + addresses + contacts + allergen restrictions… });
}
```

`getCustomer` returns the full detail: customer `email`/`phone`/`tax_id`/`credit_limit_gbp`,
every contact's name/email/phone, and allergen restrictions.

**Failure scenario:** A server action is callable directly regardless of page-level UI gating.
An authenticated org user with *any* role (Viewer, warehouse operator, someone with no shipping
permission at all) can invoke `listCustomers()` / `getCustomer(id)` and enumerate the org's
entire customer contact PII. Compare the peer modules which DO read-gate
(`quality.dashboard.view`, `fin.costs.read`); shipping even has a `ship.dashboard.view`
permission that these readers should use. Same class as C004 (Viewer could read users PII),
but on the customer surface — not covered by C004's fix.

**Fix:** gate both readers on a shipping read permission (e.g. `ship.dashboard.view`),
mirroring `so-form-data.ts` / `shipments-data.ts` which already do.

---

## NEW-P03 — `nextCustomerCode` unlocked sequence (P4)

**File:** `customer-actions.ts:80-92`. `select max((substring(customer_code …))::int) … + 1`
with no row lock / advisory lock. Two concurrent `createCustomer` calls compute the same
next code; the unique constraint rejects one with a raw pg error (mapped to a duplicate/
persistence failure, no retry). Low impact (self-limiting, not data corruption) but a real
race on a code generator. Fix: advisory lock on `('cust-code', org_id)` or a DB sequence.

---

## Areas verified clean (no finding)

- `lib/auth/with-org-context.ts`, `with-site-context.ts`, `has-permission.ts` — trust
  boundary solid.
- `lib/rbac/enforced-permissions.ts`, `role-grant-guards.ts`, `actions/users/assign-role.ts`
  — escalation guards solid.
- `lib/finance/upsert-wac.ts`, `book-receipt-wac.ts`, `resolve-output-wac.ts` — coherent
  NUMERIC clamps, `for update` locks, currency/UoM fail-closed.
- `actions/security/upsert-policy.ts`, `force-mfa.ts`, `actions/d365/sync-config.ts` —
  inline `requireSecurityAdmin` / `hasManagePermission` gate before any write.
- `quality/_actions/{hold,ncr}-actions.ts`, `shipping/_actions/cancelShipment.ts` — every
  client-callable mutation gates + e-signs; `closeNcr` enforces `close_critical` for
  critical severity.
