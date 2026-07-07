-- Migration 452: R4 fix — locked formulation versions must still accept
-- npd_wip_process_id assignment (production-planning metadata, not recipe content).
--
-- Mig 104's formulation_ingredients_reject_locked_version_mutation rejected EVERY
-- mutation on ingredients of a locked version, including the mig-450 assignment
-- column — so consumption assignment on any real (locked) project 500s (found
-- live on NPD-001 during R4.5 E2E, digest 2722524123).
--
-- The immutability contract protects RECIPE CONTENT. An UPDATE that changes ONLY
-- npd_wip_process_id (every other column identical) is now permitted on locked
-- versions; INSERT/DELETE and any content change stay rejected.

create or replace function public.formulation_ingredients_reject_locked_version_mutation()
returns trigger
language plpgsql
as $$
declare
  v_version_id uuid;
  v_state text;
begin
  v_version_id := case when tg_op = 'DELETE' then old.version_id else new.version_id end;

  select version.state into v_state
  from public.formulation_versions version
  where version.id = v_version_id;

  if v_state = 'locked' then
    -- Allow process-assignment-only updates (production metadata, mig 450/452).
    if tg_op = 'UPDATE'
       and new.npd_wip_process_id is distinct from old.npd_wip_process_id
       and row(new.id, new.version_id, new.rm_code, new.qty_kg, new.pct,
               new.cost_per_kg_eur, new.allergens_inherited, new.sequence,
               new.created_at, new.schema_version, new.item_id, new.cost_currency,
               new.substitute_item_id, new.wip_definition_id)
           is not distinct from
           row(old.id, old.version_id, old.rm_code, old.qty_kg, old.pct,
               old.cost_per_kg_eur, old.allergens_inherited, old.sequence,
               old.created_at, old.schema_version, old.item_id, old.cost_currency,
               old.substitute_item_id, old.wip_definition_id) then
      return new;
    end if;
    raise exception 'locked formulation versions cannot mutate ingredient rows';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
