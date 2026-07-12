# Wave A6 — Implementation summary (2026-07-12)

## C6 (P0) — user deactivation `persistence_failed`, account stays active

**Root cause:** The deactivate path ran `UPDATE public.users` then `INSERT` audit/outbox inside one `withOrgContext` transaction. Any thrown error after the update (audit partition edge, outbox constraint, or the prior `FOR UPDATE OF u` owner-guard CTE failing on some PG builds) was caught and returned as `persistence_failed` — but only thrown errors roll back, so in several failure modes the UI reported failure while `is_active` flipped, or (when the guard/update threw before commit) the user stayed active with `persistence_failed`. Deactivation also did not revoke Supabase sessions, so a deactivated user could keep using an existing JWT until expiry. `withOrgContext` did not reject `is_active = false` users.

**Fix locations:**
- `apps/web/actions/users/deactivate.ts` — simplified owner lock (`organizations … FOR UPDATE` + `active_owners` CTE), idempotent update (`and is_active = true`), outbox `dedup_key`, post-commit auth ban via `updateUserById({ ban_duration })`, structured error logging.
- `apps/web/lib/auth/with-org-context.ts` — reject deactivated users at context resolution.
- `apps/web/actions/users/deactivate.behavior.test.ts` — persistence rollback + happy path.

**Repro (before):** Settings → Users → Deactivate on a non-owner member → `persistence_failed` toast; user row stays `is_active = true` and can still browse with existing session.

---

## S21 (P1) — invited member stuck on `/onboarding/in-progress`

**Root cause:** Edge middleware gates on JWT `app_metadata.onboarding_completed_at`. Only the admin who ran `completeOnboarding` got that claim stamped; org-invited / password-created members inherited `organizations.onboarding_completed_at` in the DB but their JWT still had `null`, so `proxy.ts` sent non-admins to `/onboarding/in-progress` while the org was already live.

**Fix locations:**
- `apps/web/lib/auth/stamp-onboarding-claim.ts` — shared Supabase admin stamp.
- `apps/web/lib/auth/sync-user-onboarding-claim.ts` — reads `organizations.onboarding_completed_at` for the user's org and stamps JWT when set.
- Called from: `login/_actions/auth.ts` (password + MFA), `api/auth/invite/accept/route.ts`, `actions/users/create-user-with-password.ts`.
- `apps/web/lib/auth/sync-user-onboarding-claim.test.ts`

**Repro (before):** Complete org onboarding as admin; invite Core User; accept invite and sign in → redirected to `/onboarding/in-progress` indefinitely.

---

## S22 (P1) — production/technical approval chain single approver

**Root cause:** `technical_product_spec_approval` seeded with `min_approvers = 1` while `settings_json.require_dual_sign_off = true`. The Settings → Authorization UI rendered technical thresholds read-only; only NPD `min_approvers` was editable, so operators could not configure ≥2 approvers to exercise dual-sign.

**Fix locations:**
- `authorization-screen.client.tsx` — editable technical `min_approvers` + dual-sign toggle; save patches both policies; client guard `dualSignOff && minApprovers < 2`.
- `authorization/page.tsx` + `actions/authorization/preflight.ts` — misconfiguration blocker when dual-sign requires `< 2` approvers.
- `authorization-technical-save.test.ts`

**Config path (no migration needed):** `/{locale}/settings/authorization` → Technical product-spec approval → set Minimum approvers ≥ 2 and enable Dual sign-off → Save (audit reason required).

---

## S23 (P2) — Create project & open recipe → Brief with empty header

**Root cause:** Wizard navigated to `/pipeline/{id}` (index redirects to `current_stage = brief`) and `createProject` seeded formulation with `product_code = null` (no draft FG row), so the recipe header showed `—`.

**Fix locations:**
- `create-project.ts` — blank starts: `current_stage = 'recipe'`, bootstrap `public.product` + `npd_projects.product_code` via `fallbackFgProductCode`, formulation `product_code` set.
- `gate-helpers.ts` — export `fallbackFgProductCode`.
- `create-project-wizard.tsx` — navigate to `/pipeline/{id}/formulation`.
- `create-project-recipe-bootstrap.test.ts`

**Repro (before):** NPD → New project → Create project & open recipe → lands on Brief; formulation toolbar code empty.

---

## RLS advisor (P3) — migration **486** (next free)

**Fix:** Idempotent permissive SELECT RLS on global reference tables (no write behavior change).

**File:** `packages/db/migrations/486-global-reference-rls-select.sql`

### NEW raw SQL (exact text for PREPARE check)

```sql
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'currencies',
    'iso4217',
    'big_loss_categories',
    'dashboards_catalog',
    'operational_tables',
    'yield_gate_override_reasons'
  ]
  loop
    if to_regclass('public.' || tbl) is null then
      raise notice '486: skip missing table public.%', tbl;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists %I_global_select on public.%I', tbl, tbl);
    execute format(
      'create policy %I_global_select on public.%I for select to app_user using (true)',
      tbl,
      tbl
    );

    raise notice '486: enabled permissive SELECT RLS on public.%', tbl;
  end loop;
end
$$;
```

### Other new SQL in app code (C6 / S23)

**Deactivate owner guard + update** (`apps/web/actions/users/deactivate.ts`):

```sql
select id from public.organizations where id = $1::uuid for update
```

```sql
with active_owners as (
    select distinct u.id as user_id
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      join public.users u on u.id = ur.user_id and u.org_id = ur.org_id
     where ur.org_id = $2::uuid
       and u.is_active = true
       and (r.code = 'owner' or r.slug = 'owner')
  )
  select exists (
           select 1 from active_owners ao where ao.user_id = $1::uuid
         )
     and (
           select count(*)::int from active_owners ao where ao.user_id <> $1::uuid
         ) = 0 as last_owner_violation
```

```sql
update public.users
    set is_active = false,
        updated_at = now()
  where id = $1::uuid
    and org_id = $2::uuid
    and is_active = true
returning id
```

**Onboarding claim sync** (`apps/web/lib/auth/sync-user-onboarding-claim.ts`):

```sql
select o.onboarding_completed_at
   from public.users u
   join public.organizations o on o.id = u.org_id
  where u.id = $1::uuid
  limit 1
```

**Create-project FG bootstrap** (`apps/web/app/(npd)/pipeline/_actions/create-project.ts`):

```sql
select product_code
   from public.product
  where org_id = app.current_org_id()
    and product_code = $1
    and deleted_at is null
  limit 1
```

```sql
insert into public.product
   (org_id, product_code, product_name, created_by_user, app_version)
 values
   (app.current_org_id(), $1, $2, $3::uuid, 'npd-create-project-v1')
```

```sql
update public.npd_projects
    set product_code = $2
  where id = $1::uuid
    and org_id = app.current_org_id()
    and product_code is null
```

**withOrgContext inactive guard** (`apps/web/lib/auth/with-org-context.ts`):

```sql
select org_id, is_active from public.users where id = $1::uuid
```

---

## Verification

| Gate | Result |
|------|--------|
| Touched vitest (corrections pass) | **31 passed** (5 files) |
| `tsc --noEmit` (touched files) | **Clean** — no errors in corrected files |
| `pnpm --filter web run build` | **Blocked** in this worktree — Turbopack rejects symlinked `apps/web/node_modules` outside project root; needs native `pnpm install` in worktree. |

**Touched vitest command:**

```bash
pnpm --filter web exec vitest run \
  actions/users/deactivate.behavior.test.ts \
  lib/auth/sync-user-onboarding-claim.test.ts \
  "app/(npd)/pipeline/_actions/__tests__/create-project-recipe-bootstrap.test.ts" \
  "app/[locale]/(app)/(admin)/settings/authorization/authorization-technical-save.test.ts" \
  lib/auth/edge-middleware-policy.test.ts \
  actions/onboarding/complete-onboarding.test.ts

pnpm --filter @monopilot/db exec vitest run __tests__/486-global-reference-rls-select.test.ts
```

---

## Ambiguities resolved

- Did **not** read `user_metadata.onboarding_completed_at` in edge middleware (users can write user_metadata); S21 fix stamps trusted `app_metadata` on login/provision only.
- S22 treated as **missing UI capability**, not org-specific misconfig — dual-sign was display-only with `min_approvers = 1`.
- Migration **486** is additive/idempotent; writes on global tables remain revoked per mig 408.

## Not done

- Full `next build` / clean `tsc` in this worktree (environment/symlink constraints above).
- No git commit (per spec).

---

## Corrections pass (2026-07-12, Codex cross-review)

### C6 — auth ban error ignored
- **Verified:** `revokeAuthSessions` ignored `{ error }` from `updateUserById`; deactivation reported success while JWT stayed valid.
- **Fix:** `apps/web/actions/users/deactivate.ts` — check Supabase `{ error }`; on failure return `ok: true` with `authRevokeWarning: 'session_revoke_failed'` (DB row already committed).
- **Test:** `deactivate.behavior.test.ts` — session ban failure surfaces warning.

### S21 — user_metadata stamp + swallowed sync
- **Verified:** `stamp-onboarding-claim.ts` copied org timestamp into user-writable `user_metadata`; invite/create-user paths logged but did not surface sync failure.
- **Fix:** stamp `app_metadata` only; `create-user-with-password.ts` returns `onboardingClaimSynced`; `invite/accept` returns `onboardingClaimSynced` flag. Recovery: `syncUserOnboardingClaimFromOrg` runs on every login (`login/_actions/auth.ts`).
- **Test:** `sync-user-onboarding-claim.test.ts` — no `user_metadata` in update payload.

### S22 — mutation boundary unprotected
- **Verified:** dual-sign guard was UI/preflight-only; `approveReleaseBundle` single-signed and transitioned immediately.
- **Fix:**
  - `policy-actions.ts` — server-side reject `require_dual_sign_off` with `min_approvers < 2`.
  - `release-bundle-service.ts` — accumulate distinct `e_sign_log` approvals per bundle nonce; defer factory-usable transition until `min_approvers` (≥2 when dual-sign) distinct signers; reject same-user re-sign.
- **Tests:** `authorization-policy.test.ts` (policy mutation); `lib/technical/__tests__/release-bundle.test.ts` (dual-sign accumulation + duplicate rejection).

### S23 — product code collision
- **Verified:** `bootstrapDraftRecipeProduct` reused an existing `FG-*` row even when another project owned that code.
- **Fix:** `create-project.ts` — `resolveAvailableDraftProductCode` skips codes linked to other projects; allocates next free `FG-*`.
- **Test:** `create-project-recipe-bootstrap.test.ts` — collision allocates `FG-013` when `FG-012` is taken.

### RLS migration 486
- **Not touched** (orchestrator dropping per instruction).
