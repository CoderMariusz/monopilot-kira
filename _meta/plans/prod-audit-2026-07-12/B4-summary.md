# Wave B4 — Implementation summary (2026-07-12)

## B4a (P1) — WIP manual ingredient costs show "Saved" but do not persist

**Repro:** NPD formulation → add WIP ingredient → enter manual €/kg → UI shows "Saved" and recomputes total → refresh → cost gone → `submit-for-trial` fails `MISSING_COST`.

**Root cause:** `saveDraft` in `save-draft.ts` explicitly discarded client-entered `costPerKgEur` for any row with `wipDefinitionId`, using only `masterCost` from `v_item_effective_cost`. WIP/intermediate items typically have no master cost, so the write persisted `NULL` while the optimistic UI kept the typed value until reload.

**Fix:** Cost resolution is `ingredient.costPerKgEur ?? masterCost` — manual wins when the user typed a value; master is fallback when the field is empty. UI already awaited `saveDraft` and only sets `saved` on `result.ok`.

**Diff locations:**
- `apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/save-draft.ts`
- `apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/__tests__/save-draft.ssot.test.ts` (WIP manual cost persists when master is null)

---

## B4b (P1) — `org_authorization_policies` rows missing → S22 dual-sign unconfigurable

**Repro:** Settings → Authorization shows "seed missing / misconfigured"; both required policy rows absent for org → cannot configure dual-sign.

**Root cause:** Migration 063 seeds on org INSERT + backfill, but orgs created before 063 or environments where the trigger/backfill did not run can have zero rows. The Authorization page correctly surfaced `missing_seed` but dead-ended with no recovery path.

**Fix:**
1. **Migration 487** — idempotent cross-join seed of `npd_post_release_edit` + `technical_product_spec_approval` per org (`ON CONFLICT DO NOTHING`), defaults identical to migration 063 (`min_approvers=1`, `require_dual_sign_off=true`), plus gate rule seed.
2. **`initializeAuthorizationPolicies` server action** — calls existing `public.seed_authorization_policies_for_org(org_id)` for live recovery.
3. **Authorization screen** — `missing_seed` state shows "Initialize default policies" when `settings.authorization.edit` is granted; success triggers `router.refresh()`.

**Diff locations:**
- `packages/db/migrations/487-org-authorization-policies-seed.sql` (hard-linked to `packages/db/src/migrations/487-org-authorization-policies-seed.sql`)
- `packages/db/__tests__/487-org-authorization-policies-seed.test.ts`
- `apps/web/actions/authorization/policy-actions.ts`
- `apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx`
- `apps/web/app/[locale]/(app)/(admin)/settings/authorization/authorization-screen.client.tsx`
- `apps/web/i18n/{en,pl,ro,uk}.json` (initialize copy)
- `apps/web/actions/authorization/authorization-policy.test.ts`

---

## B4c (P2) — Gate checklist item shows "Not started" after checking

**Repro:** Check a checklist item → checkbox + counter update → status text stays "Not started".

**Root cause:** `GateChecklistPanel` `ChecklistItemRow` rendered status as `item.done && item.by ? completedBy : notStarted`. Optimistic toggle sets `done=true` immediately but `by`/`at` stay null until server revalidation, so checked rows still read "Not started".

**Fix:** Derive status from `done` first; show generic `completed` when done without completer metadata; show `completedBy` only when `by` is present.

**Diff locations:**
- `apps/web/app/(npd)/pipeline/[projectId]/_components/gate-checklist-panel.tsx`
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx` (default label)
- `apps/web/i18n/{en,pl,ro,uk}.json` (`npd.gateChecklist.completed`)
- `apps/web/app/(npd)/pipeline/[projectId]/_components/__tests__/gate-checklist-panel.test.tsx`

---

## B4d (P2) — E2E seed fixture repair (`seed-e2e.sql`)

**Repro (a):** `E2E-A-S8-TIMESTAMPS` is `RELEASED` but Start fails with `wo_snapshot_missing` (no `active_bom_header_id` / `active_factory_spec_id` on the WO).

**Repro (b):** S19 project `21e26d40-…` locked version `a7b32f4e-…` fails `submit-for-trial` on `MISSING_COST` / missing nutrition cache.

**Root cause:** Seed inserted S8 WO as `RELEASED` without the factory-release snapshot columns that `releaseWorkOrder` / `startWo` require. S19 relied on pre-existing prod data without ensuring non-null `cost_per_kg_eur`, total pct in range, or `formulation_calc_cache.nutrition_json` keys.

**Fix:** Idempotent seed extensions (see verbatim SQL below).

**Diff locations:**
- `_meta/plans/prod-audit-2026-07-12/seed-e2e.sql`

---

## Migration 487 SQL (verbatim)

```sql
-- Migration 487: backfill missing org_authorization_policies rows (B4b / S22).
-- NEXT FREE after 486. Idempotent, additive, live-safe — mirrors 063 seed values and
-- the 486 cross-join organizations pattern. Orgs that already have a policy row are
-- untouched (ON CONFLICT DO NOTHING).

insert into public.org_authorization_policies
  (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
   approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
   approval_gate_rule_code, settings_json, version)
select
  o.id,
  p.policy_code,
  true,
  p.request_permissions,
  p.authorize_permissions,
  p.approver_role_codes,
  1,
  true,
  p.requires_new_version,
  p.approval_gate_rule_code,
  p.settings_json,
  1
from public.organizations o
cross join (
  values
    (
      'npd_post_release_edit',
      array['npd.released_product_edit.request']::text[],
      array['npd.released_product_edit.authorize']::text[],
      array['owner']::text[],
      true,
      null::text,
      '{}'::jsonb
    ),
    (
      'technical_product_spec_approval',
      '{}'::text[],
      array['technical.product_spec.approve']::text[],
      array['quality_lead']::text[],
      true,
      'technical_product_spec_approval_gate_v1',
      jsonb_build_object('require_dual_sign_off', true)
    )
) as p(
  policy_code,
  request_permissions,
  authorize_permissions,
  approver_role_codes,
  requires_new_version,
  approval_gate_rule_code,
  settings_json
)
on conflict on constraint org_authorization_policies_org_code_unique do nothing;

-- Gate rule referenced by technical approval preflight (idempotent).
insert into public.rule_definitions
  (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
select
  o.id,
  'technical_product_spec_approval_gate_v1',
  'gate',
  'L1',
  jsonb_build_object('min_approvers', 1, 'requires_new_version', true),
  1,
  pg_catalog.now(),
  null
from public.organizations o
where to_regclass('public.rule_definitions') is not null
on conflict (org_id, rule_code, version) do nothing;

do $$
declare
  v_npd int;
  v_technical int;
begin
  select count(*)::int into v_npd
    from public.org_authorization_policies
   where policy_code = 'npd_post_release_edit';
  select count(*)::int into v_technical
    from public.org_authorization_policies
   where policy_code = 'technical_product_spec_approval';
  raise notice '487: org_authorization_policies npd_post_release_edit row count = %', v_npd;
  raise notice '487: org_authorization_policies technical_product_spec_approval row count = %', v_technical;
end $$;
```

---

## Corrections (Codex review pass)

1. **RSC build blocker** — moved `InitializeAuthorizationPoliciesResult` to `apps/web/actions/authorization/policy-types.ts` (non-`'use server'` sibling); `policy-actions.ts` imports it with `import type`.
2. **Migration 487 / 063 parity** — `require_dual_sign_off` corrected from `false` to `true` to match `seed_authorization_policies_for_org` in migration 063.
3. **save-draft manual cost** — resolution flipped to `ingredient.costPerKgEur ?? masterCost` (manual wins); tests updated with round-trip case where both master (9.99) and typed (3.75) exist.
4. **487 migration test** — asserts canonical 063 literals (policy codes, role codes, permissions, `require_dual_sign_off=true`, gate rule JSON) instead of tautological string presence.

---

```sql
insert into public.work_orders (id, org_id, wo_number, product_id, active_bom_header_id, active_factory_spec_id, production_line_id, site_id,
  status, planned_quantity, uom, priority, source_of_demand, item_type_at_creation, disposition_policy,
  is_rework, over_production_flagged, released_to_warehouse, schema_version, created_at, updated_at)
select
  'a0000004-0000-4000-8000-000000000006',
  :'org',
  'E2E-A-S8-TIMESTAMPS',
  '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd',
  coalesce(
    (select bh.id
       from public.bom_headers bh
      where bh.org_id = :'org'
        and bh.item_id = '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd'::uuid
        and bh.status = 'active'
      order by bh.version desc
      limit 1),
    '7cfbd0f0-2ec1-4c69-a637-9363de5cdd17'::uuid
  ),
  (select fs.id
     from public.factory_specs fs
    where fs.org_id = :'org'
      and fs.fg_item_id = '5aeb13b3-ffe6-4608-bdbe-bf8ce46ad0cd'::uuid
      and fs.status in ('approved_for_factory', 'released_to_factory')
    order by fs.version desc
    limit 1),
  '948c099f-8054-49ae-99a1-dd5bb9410cd4',
  '7b72b4af-48d5-4da2-a3fe-d191d9e6ec19',
  'RELEASED',
  50,
  'kg',
  'normal',
  'manual',
  'fg',
  'to_stock',
  false,
  false,
  false,
  1,
  now(),
  now();
```

---

## New seed SQL — S19 submit-for-trial readiness (verbatim excerpt)

```sql
\set s19_project '21e26d40-8cf2-47d4-bfeb-9aad3fddc14c'
\set s19_version 'a7b32f4e-9980-433b-bcbf-f3da2b864fb3'

update public.formulation_ingredients fi
   set cost_per_kg_eur = 2.5000
  from public.formulation_versions fv
  join public.formulations f on f.id = fv.formulation_id
 where fi.version_id = fv.id
   and fv.id = :'s19_version'::uuid
   and f.project_id = :'s19_project'::uuid
   and f.org_id = :'org'
   and fi.cost_per_kg_eur is null;

with locked_lines as (
  select fi.id,
         fi.qty_kg,
         sum(fi.qty_kg) over () as total_qty
    from public.formulation_ingredients fi
    join public.formulation_versions fv on fv.id = fi.version_id
    join public.formulations f on f.id = fv.formulation_id
   where fv.id = :'s19_version'::uuid
     and f.project_id = :'s19_project'::uuid
     and f.org_id = :'org'
),
pct_check as (
  select coalesce(sum(round(ll.qty_kg::numeric / nullif(ll.total_qty, 0) * 100, 3)), 0) as total_pct
    from locked_lines ll
)
update public.formulation_ingredients fi
   set pct = round(ll.qty_kg::numeric / nullif(ll.total_qty, 0) * 100, 3)
  from locked_lines ll
 cross join pct_check pc
 where fi.id = ll.id
   and (pc.total_pct < 99.99 or pc.total_pct > 100.01);

insert into public.formulation_calc_cache
  (version_id, cost_json, nutrition_json, allergen_json, computed_at)
select
  :'s19_version'::uuid,
  '{}'::jsonb,
  jsonb_build_object(
    'energy_kj', '1800',
    'fat_g', '8',
    'saturates_g', '4',
    'carbs_g', '65',
    'sugars_g', '20',
    'protein_g', '6',
    'salt_g', '0.5'
  ),
  '{}'::jsonb,
  now()
 where exists (
   select 1
     from public.formulation_versions fv
     join public.formulations f on f.id = fv.formulation_id
    where fv.id = :'s19_version'::uuid
      and f.project_id = :'s19_project'::uuid
      and f.org_id = :'org'
      and fv.state = 'locked'
 )
on conflict (version_id) do update
  set nutrition_json = excluded.nutrition_json,
      computed_at = excluded.computed_at;
```

---

## Verification gates

| Gate | Result |
|------|--------|
| `pnpm --filter web exec tsc --noEmit` | **PASS** (exit 0) |
| `save-draft.ssot.test.ts` + `authorization-policy.test.ts` | **PASS** (22 tests) |
| `gate-checklist-panel.test.tsx` (`vitest.ui.config.ts`) | **PASS** (26 tests) |
| `487-org-authorization-policies-seed.test.ts` | **PASS** (1 test) |
| `pnpm --filter web run build` | **PASS** (new `use server` export `initializeAuthorizationPolicies`) |

**Tree proof:** `git diff --stat` — 14 modified files + 2 new (`487` migration + test). Migration 487 is next free after 486; **will auto-apply on Vercel** — idempotent `ON CONFLICT DO NOTHING` only.

**Not done:** Live DB migration dry-run (`begin; \i 487; rollback`) — requires connected Postgres; SQL reviewed against mig-063 column names and constraints.
