# Wave C1 — Round-3 P1 regression fixes (2026-07-12)

Worktree: `fix/C1`. No commit performed per task instructions.

## Gates

| Gate | Result |
|------|--------|
| `pnpm exec tsc --noEmit` (repo root) | **PASS** — no errors |
| Server vitest (touched) | **PASS** — 26 tests (see below) |
| UI vitest (touched `.tsx`) | **BLOCKED** — `@testing-library/jest-dom` not resolvable in worktree `node_modules` (empty; setup import fails). Tests exist and are structurally correct; run in a fully installed checkout with `pnpm exec vitest run --config vitest.ui.config.ts` + zsh array quoting for bracket paths. |
| Full `pnpm build` | **Skipped** — no `'use server'` export shape changes |

### Vitest evidence (server)

```text
pnpm exec vitest run \
  createWorkOrderFromPlanning.scheduled-date.test.ts \
  update-work-order.test.ts \
  deactivate.behavior.test.ts \
  recompute-preserve-nutrition.test.ts
→ PASS (26) FAIL (0)
```

---

## C1a — WO scheduled date not persisted

### Root cause

Traced create path: `create-wo-modal.tsx` → `civilDateToUtcIso` → `createWorkOrderFromPlanning` → chain/core → `create-work-order-core.ts` INSERT `$6::timestamptz` with `params[5] = input.scheduledStartTime ?? null`.

- **INSERT binding is correct** — column order and `$6` bind verified against `packages/db/migrations/176-planning-work-orders.sql` (`scheduled_start_time timestamptz`).
- **Zod accepts civil-date UTC midnight** — `z.string().datetime({ offset: true })` accepts `2026-07-20T00:00:00.000Z`.
- **Edit path already wired** — `update-work-order.ts` sets `$14 = input.scheduledStartTime !== undefined` and `CASE WHEN $14 THEN $4::timestamptz …`.
- **Hygiene fix:** `createWorkOrder` passed raw client `params` into core/chain after outer `safeParse`; now passes **`parsed.data`** so only zod-validated fields reach persistence (prevents any unvalidated/extra client keys from diverging from the contract).

Prod NULL-with-success was not reproduced live here; the new chain integration-style test proves the full FG+WIP stack binds and returns the scheduled timestamp when the action succeeds.

### Changes

| File | Change |
|------|--------|
| `apps/web/.../createWorkOrder.ts` | `createWorkOrderCore(ctx, parsed.data)` / `createWorkOrderChainFromPlanning(ctx, parsed.data)` |
| `apps/web/.../createWorkOrderFromPlanning.scheduled-date.test.ts` | **NEW** — drives real chain+core (no core mock); captures both WO INSERTs; asserts `$6::timestamptz` + `params[5] === '2026-07-20T00:00:00.000Z'` for FG and WIP; invalid datetime → `invalid_input` |
| `apps/web/.../update-work-order.test.ts` | **NEW case** — civil-date edit sets `$14=true`, `$4` ISO, returned `scheduledStartTime` |

### SQL verified (existing — no migration)

```sql
-- packages/db/migrations/176-planning-work-orders.sql
scheduled_start_time timestamptz,
```

```sql
-- create-work-order-core.ts INSERT fragment (unchanged)
..., $6::timestamptz, ...
-- $6 ← input.scheduledStartTime ?? null
```

---

## C1b — Second deactivation hits `outbox_events_org_dedup_key_unique`

### Root cause

`deactivate.ts` used a **static** dedup key `settings.user.deactivated:${targetUserId}`. Deactivate → reactivate → deactivate reused the same key; plain INSERT violated `outbox_events_org_dedup_key_unique` (`packages/db/migrations/102-outbox-fa-event-emitter.sql`), rolled back the txn, surfaced `persistence_failed`, user stayed active.

### Changes

| File | Change |
|------|--------|
| `apps/web/actions/users/deactivate.ts` | `UPDATE … RETURNING updated_at`; dedup key includes timestamp; payload adds `deactivated_at` |
| `apps/web/actions/users/deactivate.behavior.test.ts` | Expect per-event key; **NEW** double-deactivate distinct-key test |

### New SQL pattern (application — not a migration)

```sql
update public.users
   set is_active = false,
       updated_at = now()
 where id = $1::uuid
   and org_id = $2::uuid
   and is_active = true
returning id, updated_at::text as updated_at;
```

```sql
insert into public.outbox_events
  (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
values
  ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-deactivate-user-v1', $5);
-- $5 = 'settings.user.deactivated:' || targetUserId || ':' || updated_at_iso
-- payload includes deactivated_at
```

---

## C1c — `saveDraft` / recompute wipes `nutrition_json`

### Root cause

`recomputeAndCache` upserted `nutrition_json = excluded.nutrition_json`. When `Reference.RawMaterials` is missing (migration 103 not applied / 42P01), compute yields `{}` and **clobbered** previously good cache nutrition — blocking trial submit.

### Changes

| File | Change |
|------|--------|
| `apps/web/.../formulation/_actions/recompute.ts` | ON CONFLICT preserves existing `nutrition_json` when excluded is `'{}'`; same guard for empty `allergen_json` (`'{"allergens":[]}'`); `cost_json` still updates |
| `apps/web/.../__tests__/recompute-preserve-nutrition.test.ts` | **NEW** — asserts CASE guards in upsert SQL when RM table missing |

### New SQL (application upsert fragment)

```sql
insert into formulation_calc_cache (version_id, cost_json, nutrition_json, allergen_json, computed_at)
values ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, now())
on conflict (version_id) do update
  set cost_json = excluded.cost_json,
      nutrition_json = case
        when excluded.nutrition_json = '{}'::jsonb
          then formulation_calc_cache.nutrition_json
        else excluded.nutrition_json
      end,
      allergen_json = case
        when excluded.allergen_json = '{"allergens":[]}'::jsonb
          then formulation_calc_cache.allergen_json
        else excluded.allergen_json
      end,
      computed_at = excluded.computed_at;
```

Column verified: `packages/db/migrations/093-formulations.sql` — `nutrition_json jsonb`, `allergen_json jsonb`, unique on `version_id`.

---

## C1d — Allergen Override button silent no-op

### Root cause

`AllergenCascadeWidget.handleOpenOverride` returned silently when `setAllergenOverrideAction` was undefined. On the FG Technical tab, `AllergenCascadeSection` **did** wire `submitAllergenOverride`, but the slot was passed as `allergenSlot` **prop** through client `FaTechnicalTab` — Server Action references do not survive that RSC→client prop boundary, so the widget received `undefined` and rendered a clickable Override that did nothing.

### Changes

| File | Change |
|------|--------|
| `apps/web/.../fg/[productCode]/page.tsx` | `<FaTechnicalTab>{allergenSlot}</FaTechnicalTab>` (children, not `allergenSlot` prop) |
| `apps/web/.../fa-technical-tab.tsx` | Prefer `children` over legacy `allergenSlot` |
| `apps/web/.../allergen-cascade-widget.tsx` | When `canWrite` but no action: render `allergen-override-unavailable-*` label (not dead button) |
| `apps/web/.../_lib/allergen-cascade.tsx` | Default `overrideUnavailable` label |
| `allergen-cascade-widget.test.tsx` | **NEW** unavailable-state test |
| `fa-technical-allergen-wiring.test.tsx` | Wired vs unavailable override cases |

`AllergenCascadeSection` continues to pass `setAllergenOverrideAction={submitAllergenOverride}`; children composition keeps the action reference intact.

---

## Files touched (git diff --stat)

```
apps/web/actions/users/deactivate.behavior.test.ts              | 47 +++++-
apps/web/actions/users/deactivate.ts                             | 10 +-
apps/web/.../allergen-cascade-widget.test.tsx                   | 16 ++-
apps/web/.../allergen-cascade-widget.tsx                         | 10 ++
apps/web/.../formulation/_actions/recompute.ts                   | 12 +-
apps/web/.../createWorkOrder.ts                                  |  4 +-
apps/web/.../update-work-order.test.ts                           | 12 ++
apps/web/.../fa-technical-allergen-wiring.test.tsx               | 18 ++-
apps/web/.../fa-technical-tab.tsx                                 | 12 +-
apps/web/.../_lib/allergen-cascade.tsx                           |  1 +
apps/web/.../fg/[productCode]/page.tsx                           |  5 +-
```

**Untracked new tests:**

- `createWorkOrderFromPlanning.scheduled-date.test.ts`
- `recompute-preserve-nutrition.test.ts`
