# Root-cause: Desktop WO consume silently fails on live Vercel deploy

**Bug ref:** Browser audit 2026-06-24, Bug #6  
**Symptom:** `recordDesktopConsumption` returns `{ok:false, reason:'error'}`.  
No row written to `wo_material_consumption`. `wo_materials.consumed_qty` unchanged.  
Admin holds `production.consumption.write`. Inputs are valid (2 kg, manual reason, no-LP path).  
No Postgres error surfaces in logs — a JavaScript exception swallowed by the outer catch.

---

## Primary root cause: `DATABASE_URL_OWNER` is an empty string on Vercel at runtime

**File:** `/.env.local` (Vercel-pulled; lines 6, 8)

```
DATABASE_URL=""
DATABASE_URL_OWNER=""
DATABASE_URL_APP="postgresql://app_user.khjvkhzwfzuwzrusgobp:...@aws-1-eu-central-2.pooler.supabase.com:5432/postgres"
```

`DATABASE_URL` and `DATABASE_URL_OWNER` are set to the empty string `""` in the Vercel
project environment variables. Vercel injects these into `process.env` at serverless
function startup.

**File:** `apps/web/lib/auth/with-org-context.ts`, line 96:

```typescript
function getOwnerPool(): pg.Pool {
  if (ownerPool) return ownerPool;
  const cs = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!cs) {
    throw new Error('withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL');
  }
  ...
}
```

The `??` (nullish coalescing) operator only substitutes when the left operand is `null` or
`undefined`. An empty string `""` is neither — it is returned as-is.

Execution on Vercel:
1. `process.env.DATABASE_URL_OWNER` = `""` → `??` does NOT fall through to DATABASE_URL
2. `cs = ""`
3. `if (!cs)` → `!""` = `true` → throws `Error('withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL')`

This throw is thrown synchronously from `getOwnerPool()` which is called from
`resolveContextFromSupabase()` (line 169 of `with-org-context.ts`), which propagates
through `annotateOrgContextError('resolve_context', err)` (re-throws, with a
`console.error('[withOrgContext] phase_failed', ...)` side-effect), then propagates out of
`withOrgContext`, then is caught at `consume-material-actions.ts` line 529:

```typescript
} catch (error) {
  console.error('[production] recordDesktopConsumption failed', error);
  return { ok: false, reason: 'error' };
}
```

Result: a JavaScript Error (not a Postgres SQLSTATE) is silently swallowed into `reason:'error'`.
The Vercel log will contain:
- `[withOrgContext] phase_failed { phase: 'resolve_context', message: 'withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL', ... }`
- `[production] recordDesktopConsumption failed Error: withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL`

No Postgres statement is ever issued — the failure occurs before any DB connection is opened.

---

## Why local dev works but Vercel does not

**File:** `apps/web/.env.local` (local dev; lines 6, 16):

```
DATABASE_URL_APP="postgresql://app_user.khjvkhzwfzuwzrusgobp:...@pooler.supabase.com:5432/postgres"
DATABASE_URL="postgresql://app_user.khjvkhzwfzuwzrusgobp:...@pooler.supabase.com:5432/postgres"
DATABASE_URL_OWNER="postgresql://app_user.khjvkhzwfzuwzrusgobp:...@pooler.supabase.com:5432/postgres"
```

Locally, `DATABASE_URL_OWNER` is set to a real (though app_user-credentialed) URL. The
`??` resolves to a non-empty string. The owner pool opens successfully.

Note: locally `DATABASE_URL_OWNER` points to `app_user` credentials, not a privileged owner —
this means even locally the `INSERT into app.session_org_contexts` will fail with
`ERROR: permission denied for table session_org_contexts` (since
`revoke all on app.session_org_contexts from app_user` is set in mig 002, line 21).
This implies the function was never verified working on desktop even locally against a real DB —
only the mocked-Vitest path was exercised.

---

## Why scanner (API route) works

**File:** `apps/web/lib/scanner/db.ts`, line 1:

```typescript
import { getOwnerConnection } from '@monopilot/db/clients.js';
```

**File:** `packages/db/src/clients.ts`, lines 48-56:

```typescript
export function getOwnerConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('...');
  }
  return new Pool({ connectionString });
}
```

The scanner route (`apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`) uses
`requireScannerSession → withScannerDb → getOwnerConnection()`.

The scanner bears the SAME `DATABASE_URL_OWNER` bug in code. However, the scanner is an API
route that verifies a bearer token — scanner sessions are established via a separate device
login flow that may use `DATABASE_URL_APP` directly (bypassing the owner pool for session
lookup). Furthermore, the scanner uses `registerTxnOrgContext` which runs the
`INSERT into app.session_org_contexts` on the SAME client that opened the transaction —
i.e., the owner pool client IS also the query client. If the scanner IS working, it means
either: (a) `DATABASE_URL_OWNER` in the scanner context is resolved differently (e.g., the
scanner route's cold start happens before the env var is checked, and Vercel isolates some
function instances), or (b) the scanner was tested under conditions where an owner URL was set.

The fundamental difference that makes the scanner MORE resilient (if the env were fixed):
- **Scanner INSERT** (`route.ts`, line ~412-439): `org_id = $10::uuid` (explicit `session.org_id` parameter)
- **Desktop INSERT** (`consume-material-actions.ts`, line 480): `org_id = app.current_org_id()` (DB function in VALUES)

The scanner never depends on `app.current_org_id()` returning a value for the `org_id` INSERT
column — it passes it explicitly as a bound parameter. The desktop does depend on it. Even if
`app.current_org_id()` returned NULL (e.g., due to a Supavisor connection pool backend_pid
mismatch), the scanner's INSERT would still succeed; the desktop's would throw a NOT NULL
violation (SQLSTATE 23502) or RLS WITH CHECK failure (SQLSTATE 42501).

---

## Failure chain (full, no-LP path)

```
recordDesktopConsumption (line 265)
  └─ withOrgContext (with-org-context.ts:216)
       └─ resolveContextFromSupabase (line 153)
            └─ getOwnerPool() (line 94)
                 ├─ process.env.DATABASE_URL_OWNER = "" (Vercel)
                 ├─ "" ?? process.env.DATABASE_URL = "" (both empty)
                 └─ throw Error('withOrgContext requires DATABASE_URL_OWNER or DATABASE_URL')
       └─ annotateOrgContextError('resolve_context', err) → console.error + rethrow
  ← throws to outer catch (consume-material-actions.ts:529)
  └─ return { ok: false, reason: 'error' }
```

No Postgres query is ever issued. No `wo_material_consumption` row is attempted. No Postgres
SQLSTATE is produced — the error is purely JavaScript.

---

## Supporting evidence: `app.session_org_contexts` is revoked from `app_user`

Even if `DATABASE_URL_OWNER` pointed to a real privileged owner, the local `.env.local` shows
it pointing to `app_user` credentials. This second problem means the
`INSERT into app.session_org_contexts` at `with-org-context.ts:230-234` would throw:

```
ERROR: permission denied for table session_org_contexts  (SQLSTATE 42501)
```

because `mig 002-rls-baseline.sql`, line 21:
```sql
revoke all on app.session_org_contexts from app_user;
```

Both issues (empty string Vercel env and wrong credentials in local env) independently prevent
the desktop consume from working.

---

## Supporting evidence: unit tests are mocked, prove nothing about live DB

**File:** `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts`,
lines 32-37:

`withOrgContext` is fully mocked in the test suite. Tests return hardcoded query results and
never open a real DB connection. All tests pass regardless of the `DATABASE_URL_OWNER` bug.

---

## Secondary risk: `app.current_org_id()` in VALUES vs explicit parameter

Even when the owner pool issue is fixed and correct owner credentials are used, the desktop
INSERT uses `app.current_org_id()` in the VALUES list (`consume-material-actions.ts:480`):

```sql
insert into public.wo_material_consumption
  (org_id, transaction_id, wo_id, ...)
values
  (app.current_org_id(), $1::uuid, $2::uuid, ...)
```

The RLS WITH CHECK policy on `wo_material_consumption` (`mig 181:204-205`) is:
```sql
with check (org_id = app.current_org_id())
```

If `app.current_org_id()` returns NULL for any reason (e.g., Supavisor pooler backend_pid
mismatch between the statement that called `set_org_context` and the statement that executes
the INSERT), then:
1. The INSERT value `org_id = NULL` violates the NOT NULL constraint (SQLSTATE 23502)
2. The RLS WITH CHECK `(NULL = NULL)` evaluates to UNKNOWN/FALSE (SQLSTATE 42501)

Either would throw and be swallowed into `reason:'error'`. The scanner avoids this by
passing `session.org_id` as an explicit bound parameter, never depending on the DB function.

Bug #5 in the same browser audit (`queryLinesForSite` returning `[]` under `withOrgContext`
while MCP direct query returns 9 rows) is consistent with `app.current_org_id()` not
resolving correctly under the Transaction pooler for certain patterns.

---

## Files and line references cited

| File | Lines | Role |
|------|-------|------|
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts` | 265-533 | `recordDesktopConsumption` — outer try/catch |
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts` | 475-502 | `wo_material_consumption` INSERT with `app.current_org_id()` in VALUES |
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts` | 529-532 | swallows all throws into `reason:'error'` |
| `apps/web/lib/auth/with-org-context.ts` | 94-102 | `getOwnerPool()` — `??` fails on empty string |
| `apps/web/lib/auth/with-org-context.ts` | 169 | `getOwnerPool()` called from `resolveContextFromSupabase` |
| `apps/web/lib/auth/with-org-context.ts` | 202-214 | `annotateOrgContextError` — logs then rethrows |
| `apps/web/lib/auth/with-org-context.ts` | 228-234 | owner pool writes `app.session_org_contexts` |
| `apps/web/lib/auth/with-org-context.ts` | 239-244 | `set_org_context` call in app pool transaction |
| `.env.local` (root, Vercel-pulled) | 6, 8 | `DATABASE_URL=""`, `DATABASE_URL_OWNER=""` |
| `apps/web/.env.local` (local dev) | 12, 16 | `DATABASE_URL` and `DATABASE_URL_OWNER` set to `app_user` (wrong role) |
| `packages/db/migrations/002-rls-baseline.sql` | 20-21 | `revoke all on app.session_org_contexts from app_user` |
| `packages/db/migrations/002-rls-baseline.sql` | 25-68 | `set_org_context` (txid_current) + `current_org_id` (txid_current_if_assigned) |
| `packages/db/migrations/181-production-wo-outputs-consumption.sql` | 196-209 | `wo_material_consumption` RLS policy + `app_user` grants |
| `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts` | 412-439 | scanner INSERT uses `$10::uuid` for org_id (explicit, not `app.current_org_id()`) |
| `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts` | 32-37 | `withOrgContext` fully mocked — proves nothing |

---

## Fix required (not implemented here — read-only audit)

1. **Vercel env:** Set `DATABASE_URL_OWNER` to a real Postgres owner-role URL (postgres/service
   role with BYPASSRLS and rights to write `app.session_org_contexts`). The current empty
   string breaks all `withOrgContext` server actions on the live deploy.

2. **`getOwnerPool()` guard:** Change `if (!cs)` to `if (!cs?.trim())` to catch empty strings
   explicitly and give a clear error message.

3. **Desktop INSERT org_id:** Pass `orgId` as an explicit bound parameter (`$N::uuid`) instead
   of relying on `app.current_org_id()` in VALUES, matching the scanner's pattern. This removes
   dependence on `txid_current_if_assigned()` matching across Supavisor pool connections.

4. **Local `.env.local`:** `DATABASE_URL_OWNER` must point to a privileged role that can write
   `app.session_org_contexts`, not `app_user`. Using `app_user` credentials locally makes
   `withOrgContext` fail at the `owner_register_session` phase with SQLSTATE 42501.
