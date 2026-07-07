-- Migration 453: R4 fix — factory_specs clone-on-write guard must allow the RECALL
-- transition (R2.2 owner decision: "Recall in Technical re-gates factory use").
--
-- recallFactorySpec (recall-spec.ts) sets status released_to_factory -> 'draft' and
-- clears approval/release stamps. Mig 165's trigger rejected BOTH the backward status
-- move and the approved_by/approved_at change (found live 2026-07-07, runtime error
-- "factory_specs version 3 (status released_to_factory) is immutable").
--
-- Allowed now: released_to_factory -> draft where ONLY the approval/release stamps are
-- cleared to NULL and every other business field is unchanged. Everything else keeps
-- the mig-165 behavior.

create or replace function public.factory_specs_enforce_clone_on_write()
returns trigger
language plpgsql
as $$
declare
  business_changed boolean;
  is_recall boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only guard rows that are already in a factory-usable (immutable) state.
  if old.status not in ('approved_for_factory', 'released_to_factory') then
    return new;
  end if;

  -- RECALL (mig 453): released -> draft, stamps cleared, nothing else touched.
  is_recall := (
    old.status = 'released_to_factory'
    and new.status = 'draft'
    and new.approved_by is null
    and new.approved_at is null
    and new.released_by is null
    and new.released_at is null
    and new.org_id is not distinct from old.org_id
    and new.fg_item_id is not distinct from old.fg_item_id
    and new.spec_code is not distinct from old.spec_code
    and new.version is not distinct from old.version
    and new.source is not distinct from old.source
    and new.bom_header_id is not distinct from old.bom_header_id
    and new.bom_version is not distinct from old.bom_version
    and new.supersedes_factory_spec_id is not distinct from old.supersedes_factory_spec_id
    and new.notes is not distinct from old.notes
    and new.site_id is not distinct from old.site_id
    and new.d365_item_id is not distinct from old.d365_item_id
    and new.schema_version is not distinct from old.schema_version
  );
  if is_recall then
    return new;
  end if;

  -- Did any immutable business field change?
  business_changed := (
    new.org_id is distinct from old.org_id
    or new.fg_item_id is distinct from old.fg_item_id
    or new.spec_code is distinct from old.spec_code
    or new.version is distinct from old.version
    or new.source is distinct from old.source
    or new.bom_header_id is distinct from old.bom_header_id
    or new.bom_version is distinct from old.bom_version
    or new.supersedes_factory_spec_id is distinct from old.supersedes_factory_spec_id
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.notes is distinct from old.notes
    or new.site_id is distinct from old.site_id
    or new.d365_item_id is distinct from old.d365_item_id
    or new.schema_version is distinct from old.schema_version
  );

  if business_changed then
    raise exception
      'factory_specs version % (status %) is immutable; edits must create a new version (clone-on-write)',
      old.version, old.status
      using errcode = '23514';
  end if;

  -- Status may only move forward to a terminal/release state — never back to a draft/working state.
  if new.status is distinct from old.status
     and new.status not in ('released_to_factory', 'superseded', 'archived') then
    raise exception
      'factory_specs approved version cannot transition from % to % in place (clone-on-write)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;
