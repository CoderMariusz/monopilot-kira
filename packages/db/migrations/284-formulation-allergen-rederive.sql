-- Migration 284: data fix — re-derive formulation_ingredients.allergens_inherited
-- from the allergen SSOT (W9-L4, audit F-A06 BLOCKER / F-A07 / F-A08).
--
-- OWNER DECISION (ADR-level, 2026-06-11): the single source of truth for item
-- allergens is public.item_allergen_profiles. formulation_ingredients.
-- allergens_inherited is a DERIVED CACHE written only server-side. Until this
-- wave, save-draft.ts persisted whatever the browser sent, and the editor
-- truncated multi-allergen items to ONE entry ([0]) — live-proven false
-- negative: AUDIT2-RM1 has mustard in item_allergen_profiles while its
-- formulation line stored '{}' ("Absent").
--
-- This migration heals the rows at rest:
--   * Every ingredient line LINKED to a real items-master row (item_id NOT
--     NULL) gets its full, sorted, distinct allergen array re-derived from
--     item_allergen_profiles (all intensities — contains / may_contain /
--     trace — a false "Absent" is the food-safety failure mode; the cascade
--     engine unions the same way).
--   * A truly-empty profile re-derives to '{}' — client-written junk is
--     dropped, never preserved.
--   * Legacy free-text lines (item_id IS NULL) are NOT touched: they have no
--     SSOT source, so their stored value (server-carryover from now on) stays.
--   * LOCKED versions are SKIPPED: the DB guard trigger
--     formulation_ingredients_reject_locked_version_mutation (deliberate
--     snapshot-immutability invariant) raises on ANY ingredient mutation of a
--     locked version — validated on scratch. That is safe here because locked
--     versions are healed at READ time instead: get-formulation.ts resolves
--     allergens for item-linked lines LIVE from item_allergen_profiles, and
--     recomputeAndCache only ever runs against the draft being saved, so the
--     stale stored value on a locked row has no remaining consumer.
--
-- Idempotent: the UPDATE is guarded by IS DISTINCT FROM — a second run touches
-- zero rows. Wave0 lock: org scope comes from the owning formulation's org_id
-- joined to item_allergen_profiles.org_id; no hardcoded org uuid.

with derived as (
  select fi.id,
         coalesce(
           (select array_agg(distinct iap.allergen_code order by iap.allergen_code)
              from public.item_allergen_profiles iap
             where iap.org_id = f.org_id
               and iap.item_id = fi.item_id),
           '{}'::text[]
         ) as codes
    from public.formulation_ingredients fi
    join public.formulation_versions fv on fv.id = fi.version_id
    join public.formulations f on f.id = fv.formulation_id
   where fv.state <> 'locked'
     and fi.item_id is not null
)
update public.formulation_ingredients fi
   set allergens_inherited = d.codes
  from derived d
 where d.id = fi.id
   and fi.allergens_inherited is distinct from d.codes;
