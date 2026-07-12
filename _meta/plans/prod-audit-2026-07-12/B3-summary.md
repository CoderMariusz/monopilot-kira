# Wave B3 — Implementation summary (2026-07-12)

## Gates

```text
$ pnpm --filter web exec tsc --noEmit
(clean — exit 0)

$ pnpm exec vitest run \
    actions/users/reactivate.behavior.test.ts \
    lib/onboarding/derive-onboarding-display.test.ts \
    app/[locale]/(app)/(modules)/technical/items/_actions/update-item.unit.test.ts \
    app/[locale]/(app)/(modules)/technical/items/_actions/items-revalidate.unit.test.ts \
    app/[locale]/(app)/(admin)/settings/onboarding/page.test.tsx \
    app/[locale]/(app)/(modules)/technical/items/_components/__tests__/item-create-wizard.test.tsx \
    app/[locale]/(app)/(modules)/technical/items/_components/__tests__/item-wizard-labels.test.ts
PASS (22) FAIL (0)
```

No `'use server'` export shape changes → full `pnpm build` not required.

No new SQL migrations (next free migration remains **487**).

---

## B3a (P1) — user reactivation does not lift Supabase Auth ban

**Root cause:** `deactivateUser` bans via `supabase.auth.admin.updateUserById(..., { ban_duration: '876000h' })` after flipping `public.users.is_active = false`, but `reactivateUser` only flipped `is_active = true` and never cleared the ban. Users stayed banned until ~2126.

**Fix:** Shared `liftAuthBan()` in `apps/web/actions/users/supabase-admin.ts` calls `updateUserById` with `{ ban_duration: 'none' }` and checks `{ error }`. `reactivateUser` invokes it after a successful DB reactivation (symmetric with deactivate’s post-DB ban). Failed unban returns `{ ok: false, error: 'auth_unban_failed' }` (no false success). **Repair path:** re-running reactivate on an already-`is_active` user (pre-B3a broken state) now only lifts the auth ban.

**Diff locations:**
- `apps/web/actions/users/supabase-admin.ts` — `liftAuthBan`
- `apps/web/actions/users/reactivate.ts` — post-DB unban + repair path
- `apps/web/actions/users/user-lifecycle.types.ts` — `auth_unban_failed`
- `apps/web/actions/users/reactivate.behavior.test.ts`

**One-off repair for existing banned-but-active users (orchestrator / service role):**

```javascript
// Node / Supabase service role — per affected user id
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await supabase.auth.admin.updateUserById('<USER_UUID>', { ban_duration: 'none' });
if (error) throw error;
```

Example prod user: `e2e-r08-signer-20260711@monopilot.test` — resolve id from `auth.users` / `public.users`, then run the call above **or** invoke `reactivateUser` from the app (repair path).

**Repro (before):** Deactivate user → `is_active=false` + auth banned → Reactivate → `is_active=true` but login still blocked.

---

## B3b (P1) — blocked product cannot be reactivated

**Root cause:** `ALLOWED_STATUS_TRANSITIONS` in `shared.ts` omitted `blocked → active`. The edit wizard allows picking Active for a blocked item and calls `updateItem`, which rejected the transition with `invalid_input` / `invalid_transition` before UPDATE — DB stayed `blocked` while other fields could appear to save in some flows.

**Fix:** Added `['blocked', 'active']` to `ALLOWED_STATUS_TRANSITIONS` so `updateItem` persists `status = 'active'`.

**Diff locations:**
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts`
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/update-item.unit.test.ts`

**Repro (before):** Deactivate product → edit wizard → Status Active → save → row still `blocked`.

---

## B3c (P2) — onboarding contradictory state

**Root cause:** UI derived “Onboarding complete” from `organizations.onboarding_completed_at` but step counters (`3/6`, `50%`) from stale `onboarding_state.completed_steps` when the two were out of sync.

**Fix:** Choke points:
1. `deriveOnboardingDisplay()` — if `onboarding_completed_at` is set → `6/6`, `100%`, complete.
2. `loadOnboardingContext()` — normalizes completed steps to all 6 when `onboarding_completed_at` is set.
3. `/settings/onboarding` page uses `deriveOnboardingDisplay` for the progress KPI.

**Diff locations:**
- `apps/web/lib/onboarding/derive-onboarding-display.ts` (+ test)
- `apps/web/actions/onboarding/load.ts`
- `apps/web/app/[locale]/(app)/(admin)/settings/onboarding/page.tsx` (+ test)

**Repro (before):** Org with `onboarding_completed_at` set but only 3 steps in JSON → “Onboarding complete” + “3/6” + “50% complete”.

---

## B3d (P2) — product edit labels + wizard validation UX

**Root cause:** (a) Wizard always used create labels (`title` / `create` button). (b) `basicValid` only required code length ≥ 1, so invalid codes reached review with “Ready to create”; server zod rejection surfaced as generic `invalid_input`.

**Fix:** Edit-mode labels (`editTitle`, `saveChanges`, `review.readyEdit`). Client `ITEM_CODE_PATTERN` guard on Next/submit. Review “ready” banner only when code valid. `formatItemActionError` forwards `result.message` for `invalid_input` (maps item_code regex to `codeInvalid`).

**Diff locations:**
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-wizard-labels.ts`
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_components/item-create-wizard.tsx`
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/shared.ts` — `ITEM_CODE_PATTERN`
- `apps/web/i18n/en.json` — `edit.*`, `create.errors.codeInvalid`
- Tests: `item-create-wizard.test.tsx`, `item-wizard-labels.test.ts`

---

## B3e (P2) — products list stale after mutations

**Root cause:** Revalidation was already wired (`safeRevalidatePath('/technical/items')` in create/update/deactivate); missing regression test (A3 S4 class).

**Fix:** Added `items-revalidate.unit.test.ts` asserting `revalidateLocalized('/technical/items')` fires via `safeRevalidatePath`.

**Diff locations:**
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/items-revalidate.unit.test.ts`
- (existing) `create-item.ts`, `update-item.ts`, `deactivate-item.ts`, `revalidate.ts`

---

## NEW raw SQL

None.

## NEW admin API (auth, not SQL)

```javascript
await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' });
```
