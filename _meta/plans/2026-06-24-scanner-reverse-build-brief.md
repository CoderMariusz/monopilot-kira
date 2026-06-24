# Scanner Reverse-Consume + Settings PIN/Sign-off Toggles — Build Brief

**Date:** 2026-06-24
**Scope:** Scanner reverse-consume flow (FIRST); new Settings section for PIN/sign-off toggles for the reverse flow.
**Auth model (owner decision):** default = operator-PIN + supervisor-PIN required; toggle to operator-PIN-only.

---

## 1. Desktop reverseConsumption — ground truth

The desktop action already exists and is fully implemented. It is the canonical shared action both lanes MUST import.

**Canonical server action file:**
`apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts`

- Export: `reverseConsumption(input: ReverseConsumptionInput): Promise<ReverseConsumptionResult>` (line 900)
- `ReverseConsumptionInput` shape (lines 64-69): `{ consumptionId: string; reasonCode: CorrectionReasonCode; note?: string | null; signature: { password: string } }`
- RBAC gate inside: `assertCorrectionAllowed` with `permission: 'production.consumption.correct'` (line 939)
- E-sign intent string: `'production.consumption.reverse'` (line 21 constant `CONSUMPTION_REVERSE_INTENT`)
- What it writes (in order, all within one `withOrgContext` transaction):
  1. Locks `wo_material_consumption` row FOR UPDATE (via `loadConsumptionForUpdate`, line 244)
  2. Checks `hasConsumptionCorrection` (idempotency guard, line 916)
  3. Locks LP FOR UPDATE; validates status in `['consumed', 'available', 'received']` (line 928)
  4. Locks `wo_materials` row and validates decrement stays non-negative (`lockWoMaterialsAndValidateDecrement`, line 344)
  5. Calls `assertCorrectionAllowed` (e-sign with SHA-256 receipt via `@monopilot/e-sign`, line 937)
  6. `insertCounterEntry` into `wo_material_consumption` with `qty_consumed = -original.qty_consumed` and `correction_of_id = original.id` (line 961)
  7. `decrementConsumedQty` on `wo_materials` (line 990)
  8. `restoreLicensePlate` — QA-aware: restores to `'available'` only if `qa_status = 'released'`, else `'received'` (lines 628-631, 999)
  9. `writeLpRestoredHistory` in `lp_state_history` with `reason_code = 'consumption_reversed'` (line 1001)
  10. `writeConsumptionReverseAudit` in `audit_events` (line 1004)
- Guards: WO status gate (closed WO requires `production.corrections.closed_wo`); LP restorability; ledger non-negative check; unique partial index (mig 297, `correction_of_id`) = DB backstop against duplicate reversal.
- The `'use server'` directive is at line 1 — this is a Next.js server action, NOT callable from a scanner bearer-auth API route directly. The scanner lane needs a thin bearer-auth wrapper (see section 2).

---

## 2. Scanner architecture — where the new route slots

**Scanner bearer-auth API pattern** (all production scanner writes follow this):
- Routes live under: `apps/web/app/api/production/scanner/wos/[id]/`
- Auth: `requireScannerSession` from `apps/web/lib/scanner/guard.ts` — reads `Authorization: Bearer <token>` header or `body.token`; resolves a `ScannerSessionRow` with `user_id` and `org_id`.
- Org context within a scanner route: use `registerTxnOrgContext` / `cleanupTxnOrgContext` from `apps/web/lib/scanner/txn-org-context.ts` (pattern established in the consume route lines 100-105).
- RBAC inside scanner routes: `hasPermission(permCtx, 'production.consumption.write')` called inline with `{ client, userId: session.user_id, orgId: session.org_id }` (consume route lines 93-97).
- Idempotency: `client_op_id` + `scanner_audit_log` advisory-lock pattern (consume route lines 104-139).

**New route to create (BACKEND lane):**
`apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts`

This route CANNOT directly call the server action (it has `'use server'` + `withOrgContext` which reads Supabase auth cookies, incompatible with scanner bearer auth). The scanner route must re-implement the DB writes inline or call a shared pure function extracted from the server action. The recommended approach (consistent with how `consume/route.ts` works) is to re-implement the write sequence inline using the raw `pg.PoolClient` obtained via `requireScannerSession`, with `registerTxnOrgContext` for org scoping. The route reuses all the helper functions that are already extracted into `corrections-actions.ts` ONLY IF they are refactored to pure functions taking a `pg.PoolClient` — but they currently use `withOrgContext` internally. Therefore:

**Shared action path (exact path both lanes use):**
The server action at `apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts` is the **desktop UI lane's** entry point. The scanner API route at `apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts` is the **scanner lane's** entry point. Both lanes enforce the same business logic. Shared pure helpers (loadConsumptionForUpdate, lockWoMaterialsAndValidateDecrement, etc.) should be extracted to a shared lib — proposed location: `apps/web/lib/production/reverse-consume-core.ts` — so both `corrections-actions.ts` and the scanner route can import them without the `'use server'` boundary conflict.

**Existing consume screen** (for parity reference):
- UI page: `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/consume/page.tsx`
- Screen component: `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/consume/_components/consume-screen.tsx` (inferred from page import)
- API call target: `POST /api/production/scanner/wos/[id]/consume`
- Hub tiles are at `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/_components/wo-execute-screen.tsx` lines 329-331. A fourth tile "Reverse consume" must be added there.

**New scanner UI files to create:**
- `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/reverse-consume/page.tsx`
- `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/reverse-consume/_components/reverse-consume-screen.tsx`

**New scanner API route to create:**
- `apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts`

---

## 3. PIN mechanisms — existing, reuse not reinvent

**Scanner session PIN (operator):**
- Setup: `/api/scanner/set-pin` and `/api/scanner/change-pin` routes; `setPin` from `packages/auth/src/verify-pin.js`
- Verify: `verifyPin(userId, pin, { client })` from `apps/web/lib/scanner/auth.ts` (re-exported from `packages/auth/src/verify-pin.js`)
- Table: `public.user_pins` (queried in `userHasPin` at `apps/web/lib/scanner/auth.ts` line 26)
- Already used in `consume/route.ts` lines 282-330 for supervisor over-consumption approval

**Supervisor PIN (over-consumption approver):**
- Same `verifyPin` function, same `user_pins` table
- Email lookup: `findUserByEmail(client, email)` from `apps/web/lib/scanner/auth.ts` line 14
- Pattern established in `consume/route.ts` lines 281-342:
  1. Parse `body.approver.email` + `body.approver.pin`
  2. `findUserByEmail` to get `approver.id`
  3. Guard: `approver.org_id === session.org_id` AND `approver.id !== session.user_id` (SoD)
  4. `userHasPin` enrolled check
  5. `verifyPin` — returns `true | false | 'locked'`
  6. RBAC check: `hasPermission(approverCtx, 'production.consumption.override_approve')`
  7. On failed PIN: COMMIT (to persist lockout counter), do NOT rollback

**For scanner reverse, auth logic is:**

DEFAULT (supervisor-PIN required flag = true in `tenant_variations.feature_flags`):
- Operator must supply their own PIN (`signature.pin`) — verified via `verifyPin(session.user_id, ...)`, replacing the e-sign password flow
- Supervisor must additionally supply email + PIN in `body.supervisor` (same pattern as `body.approver` in consume route)
- Supervisor RBAC check: `hasPermission(supervisorCtx, 'production.consumption.override_approve')` (reuse existing permission — no new perm needed for the supervisor tier)
- RBAC check for the operator: `hasPermission(permCtx, 'production.consumption.correct')` (the same gate as the desktop action)

OPERATOR-PIN-ONLY mode (supervisor-PIN required flag = false):
- Only operator PIN required; no supervisor lookup
- Still: `hasPermission(permCtx, 'production.consumption.correct')`

The flag is read from `public.tenant_variations.feature_flags->>'scanner_reverse_require_supervisor_pin'` (new key, stored as boolean-as-text `'true'`/`'false'`, defaulting to `true` when absent).

**Desktop e-sign vs scanner PIN:**
The desktop `reverseConsumption` uses `assertCorrectionAllowed` with `requireEsign: true` which calls `signEvent` from `@monopilot/e-sign` (SHA-256 receipt). The scanner does NOT use `@monopilot/e-sign` — it uses the raw `verifyPin` call and writes a `scanner_audit_log` entry instead. This is the established scanner pattern (no e-sign receipt on scanner paths). The audit trail is maintained via `scanner_audit_log` + the counter-entry in `wo_material_consumption`.

---

## 4. Settings section — where + how to add it

**Settings nav registry:**
`apps/web/lib/navigation/settings-nav.ts` — the `SETTINGS_NAV_GROUPS` constant (line 25). The existing `signoff` group (line 65) already exists:
```
group("signoff", "Sign-off", true, [item("signoff", "Sign-off policies", "✍")]),
```
Add a new item inside this group for the scanner PIN policies:
```
item("scanner-auth", "Scanner auth policies", "📱", false, "/settings/scanner-auth")
```
Or, as the owner decision specifies a new Settings section, add it to the `operations` group (line 66-70) which already has `devices` (scanner devices):
```
group("operations", "Operations", true, [
  item("devices", "Scanner devices", "📱"),
  item("scanner-auth", "Scanner auth", "🔐", false, "/settings/scanner-auth"),  // NEW
  ...
])
```

**New Settings page to create:**
- `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/page.tsx`
- `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/_actions/scanner-auth-actions.ts` (`'use server'`)
- `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/_components/scanner-auth-policies.client.tsx`

**Storage — NO new table needed:**
The toggle is stored in `public.tenant_variations.feature_flags` JSONB (same table as `overconsume_threshold_pct` and `overconsume_warn_pct`, managed by `setOverconsumeThresholds` in `signoff-actions.ts`). The key name: `'scanner_reverse_require_supervisor_pin'` (string `'true'` / `'false'`).

**No migration is needed** for storage — `tenant_variations` already exists (migration 040) with `feature_flags jsonb not null default '{}'::jsonb`. The new flag key is just a new JSONB key in the existing column, written by the new Settings action using the same `jsonb || jsonb_build_object(...)` upsert pattern.

**However, migration 322 IS needed for RBAC seeding of the new permission** (see section 5).

**Read path in the scanner route:**
The scanner reverse route reads the flag inside the same transaction:
```sql
select feature_flags->>'scanner_reverse_require_supervisor_pin' as require_supervisor
from public.tenant_variations
where org_id = $1::uuid
limit 1
```
If absent or `'true'`, supervisor PIN is required. If `'false'`, operator-PIN-only.

**Settings action signature:**
```ts
export async function setScannerReverseAuthPolicy(
  input: { requireSupervisorPin: boolean }
): Promise<{ ok: true } | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' }>
```
RBAC gate: `settings.flags.edit` (same as `setOverconsumeThresholds`).

---

## 5. RBAC delta

**No new permissions needed** — all required strings already exist:

| Permission | Already in enum? | Seeded to roles? |
|---|---|---|
| `production.consumption.correct` | Yes (not in enum, in DB only via mig 293/296) | Yes — admin + supervisor roles via `seed_correction_permissions_for_org` (mig 293, updated mig 296) |
| `production.consumption.override_approve` | Yes — `Permission.PRODUCTION_CONSUMPTION_OVERRIDE_APPROVE` (enum line 207) | Yes — migration 185, seeded to org-admin + production-supervisor roles |

**Critical observation:** `production.consumption.correct` is NOT in `packages/rbac/src/permissions.enum.ts` nor in `ALL_PRODUCTION_PERMISSIONS`. It exists only as a raw string in the DB seeder functions (migrations 293, 296). It is used as a raw string literal `CONSUMPTION_CORRECT_PERMISSION = 'production.consumption.correct'` in `corrections-actions.ts` line 18 and is checked via `hasPermission`. This is a known gap — the correction permission family is not in the enum. The scanner route must use the same raw string pattern.

**permissions.test.ts count:** The `expectedProductionPermissions` array in `packages/rbac/src/__tests__/permissions.test.ts` currently has 18 entries and the test asserts `toHaveLength(18)` (line 697). `production.consumption.correct` is NOT in this array and NOT in the enum — so no test count bump is needed for this build. If the owner decides to add correction permissions to the enum in a future cleanup, BOTH `permissions.enum.ts` AND the expected array in `permissions.test.ts` must be updated together.

**Migration 322 purpose:** Seed `production.consumption.correct` to the production-operator role family so scanner operators can trigger a reversal on their own (operator-PIN-only mode). Currently it is only seeded to admin + supervisor families (mig 296). The scanner operator role codes to add: `'production_operator'`, `'scanner_operator'`, `'operator'`. This is the minimum required for the feature to work end-to-end in operator-PIN-only mode.

**Migration 322 sketch:**
```sql
-- 322-scanner-reverse-consume-operator-perm.sql
-- Grant production.consumption.correct to scanner/production operator roles so
-- scanner reverse-consume is reachable in operator-PIN-only mode.
-- Also seeds the scanner_reverse_require_supervisor_pin default (absent = true,
-- so no explicit seed needed — absence IS the default).

create or replace function public.seed_scanner_reverse_operator_perm(p_org_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_perm text := 'production.consumption.correct';
  v_operator_roles text[] := array[
    'production_operator','scanner_operator','operator','scanner','production_scanner'
  ];
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, v_perm
  from public.roles r
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  update public.roles r
     set permissions = coalesce(
       (select jsonb_agg(distinct merged.p order by merged.p)
          from (select jsonb_array_elements_text(coalesce(r.permissions,'[]'::jsonb)) as p
                union all select v_perm) merged),
       '[]'::jsonb)
   where r.org_id = p_org_id
     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));
end;
$$;

revoke all on function public.seed_scanner_reverse_operator_perm(uuid) from public;
revoke all on function public.seed_scanner_reverse_operator_perm(uuid) from app_user;

-- Backfill
do $$
declare v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_scanner_reverse_operator_perm(v_org_id);
  end loop;
end $$;
```

---

## 6. Complete file list

### Backend lane

| File | Action |
|---|---|
| `apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts` | CREATE — new bearer-auth POST handler |
| `apps/web/lib/production/reverse-consume-core.ts` | CREATE — pure DB helpers extracted from corrections-actions.ts (loadConsumptionForUpdate, lockWoMaterialsAndValidateDecrement, decrementConsumedQty, restoreLicensePlate, writeLpRestoredHistory, writeConsumptionReverseAudit, insertCounterEntry is already in lib/corrections/) |
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts` | EDIT — refactor reverseConsumption to call the shared core lib (or leave standalone if the desktop path is NOT refactored) |
| `packages/db/migrations/322-scanner-reverse-consume-operator-perm.sql` | CREATE — operator perm seed |
| `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/_actions/scanner-auth-actions.ts` | CREATE — `'use server'` action: `getScannerAuthPolicy` + `setScannerReverseAuthPolicy` |

### UI lane

| File | Action |
|---|---|
| `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/reverse-consume/page.tsx` | CREATE — scanner screen page |
| `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/reverse-consume/_components/reverse-consume-screen.tsx` | CREATE — client component |
| `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/_components/wo-execute-screen.tsx` | EDIT — add "Reverse consume" tile (4th tile, alongside Consume/Output/Waste at lines 329-331) |
| `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/page.tsx` | CREATE — Settings page |
| `apps/web/app/[locale]/(app)/(admin)/settings/scanner-auth/_components/scanner-auth-policies.client.tsx` | CREATE — client component with toggle |
| `apps/web/lib/navigation/settings-nav.ts` | EDIT — add `scanner-auth` item to `operations` group |
| `apps/web/components/shell/__tests__/settings-subnav.test.tsx` | EDIT — update snapshot/item count if needed |

---

## 7. Auth model summary (enforced in the scanner route)

```
POST /api/production/scanner/wos/:id/reverse-consume

Body:
{
  token: string,             // scanner bearer token (or Authorization header)
  consumptionId: string,     // UUID of the wo_material_consumption row to reverse
  reasonCode: CorrectionReasonCode,  // one of: entry_error | wrong_quantity | wrong_batch | wrong_product | other
  note?: string,
  operatorPin: string,       // operator's PIN (verifyPin(session.user_id, operatorPin))
  supervisor?: {             // required when feature_flags->>'scanner_reverse_require_supervisor_pin' != 'false'
    email: string,
    pin: string
  }
}

Auth flow:
1. requireScannerSession -> session (user_id, org_id)
2. hasPermission(session, 'production.consumption.correct') — RBAC gate
3. verifyPin(session.user_id, operatorPin) — operator identity
4. Read feature_flags->>'scanner_reverse_require_supervisor_pin' from tenant_variations
5. If require_supervisor = true (default):
   a. Parse body.supervisor.email + body.supervisor.pin
   b. findUserByEmail(email) -> approver (must be same org, different user)
   c. userHasPin(approver.id) check
   d. verifyPin(approver.id, supervisor.pin) — COMMIT on failed PIN (lockout counter)
   e. hasPermission(approver, 'production.consumption.override_approve')
6. DB writes (identical to desktop reverseConsumption, adapted for scanner context):
   - insertCounterEntry in wo_material_consumption (negative qty, correction_of_id set)
   - decrementConsumedQty in wo_materials
   - restoreLicensePlate (QA-aware: available if qa_status=released, else received)
   - writeLpRestoredHistory in lp_state_history
   - writeConsumptionReverseAudit in audit_events
   - scanner_audit_log row with result_code='ok' and client_op_id (idempotency)
7. Idempotency: advisory lock on client_op_id; replay on scanner_audit_log hit
```

---

## 8. Open questions for owner

1. **Tile placement on WoExecuteScreen:** The hub currently has 3 tiles (Consume / Output / Waste, lines 329-331). The reverse-consume tile could be (a) always visible, (b) only visible when WO has at least one consumption record, or (c) in a secondary/overflow section. Decision needed before UI lane starts.

2. **Scanner reverse available WO statuses:** The desktop action allows reversal on any non-cancelled WO (including completed/closed with the extra `production.corrections.closed_wo` perm). Should the scanner surface the same status range, or restrict to `in_progress` / `paused` only? This affects the `OUTPUT_RECORDABLE_STATES` check (or a new set for corrections).

3. **Consumption list UX on scanner:** The scanner needs to select WHICH consumption row to reverse (a WO can have many). Options: (a) show a list of the WO's consumption records, (b) scan an LP barcode to identify the consumption. The consume screen uses LP scan + material selection — should reverse follow the same pattern in reverse? This is the most significant UX decision for the scanner lane.

4. **The `operatorPin` field name:** The desktop action uses `signature.password` as the field name (shared with e-sign). The scanner route is new, so the field name can be chosen cleanly. The brief uses `operatorPin`. Confirm the wire name before the scanner route is implemented.

5. **Backward compat of `production.consumption.correct` absence from the RBAC enum:** The permission string exists only in migrations, not in `permissions.enum.ts`. If the enum lock test (`permissions.test.ts`) is ever extended to cover correction permissions, a count bump AND enum addition will be required. Recommend a follow-up task to add `PRODUCTION_CONSUMPTION_CORRECT = 'production.consumption.correct'` (and the other correction family strings) to the enum and `ALL_PRODUCTION_PERMISSIONS` — but that is out of scope for this build.

---

## Evidence index

| Claim | File | Lines |
|---|---|---|
| reverseConsumption server action | `apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts` | 900-1028 |
| CONSUMPTION_CORRECT_PERMISSION constant | same file | 18 |
| CONSUMPTION_REVERSE_INTENT constant | same file | 21 |
| assertCorrectionAllowed (e-sign) | `apps/web/lib/corrections/correct-ledger-entry.ts` | 71-107 |
| Scanner bearer-auth pattern | `apps/web/lib/scanner/guard.ts` | 1-50 |
| Scanner consume route (idempotency + PIN pattern) | `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts` | 67-524 |
| verifyPin / findUserByEmail / userHasPin | `apps/web/lib/scanner/auth.ts` | 1-49 |
| user_pins table | `apps/web/lib/scanner/auth.ts` | 26-32 |
| WoExecuteScreen tile block | `apps/web/app/[locale]/(scanner)/scanner/wos/[woId]/_components/wo-execute-screen.tsx` | 329-331 |
| Settings nav registry | `apps/web/lib/navigation/settings-nav.ts` | 25-101 |
| signoff group in nav | same file | 65 |
| Signoff page (structural model to follow) | `apps/web/app/[locale]/(app)/(admin)/settings/signoff/page.tsx` | 1-192 |
| signoff-actions.ts (setScannerAuthPolicy mirrors setOverconsumeThresholds) | `apps/web/app/[locale]/(app)/(admin)/settings/signoff/_actions/signoff-actions.ts` | 293-367 |
| tenant_variations.feature_flags (storage) | `packages/db/migrations/040-tenant-l2.sql` | 5-14 |
| signoff_policies table (reference) | `packages/db/migrations/275-signoff-policies.sql` | 1-58 |
| production.consumption.correct seed (admin + supervisor) | `packages/db/migrations/296-corrections-hardening.sql` | 17-80 |
| permissions.test.ts production count assertion | `packages/rbac/src/__tests__/permissions.test.ts` | 697 (toHaveLength(18)) |
| ALL_PRODUCTION_PERMISSIONS (no correction perms) | `packages/rbac/src/permissions.enum.ts` | 666-685 |
| production.consumption.override_approve (supervisor RBAC) | `packages/rbac/src/permissions.enum.ts` | 207 |
| Next free migration | mig 321 is last (321-shipping-seq-grant-and-ccp-limit.sql); next = 322 | — |
