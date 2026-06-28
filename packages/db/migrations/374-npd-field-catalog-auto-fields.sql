-- Migration 374 — A2: auto-derived field support on npd_field_catalog (owner decision 2).
-- A field can be marked is_auto: its FA value is READ-TIME derived from auto_source_field (the code of
-- ANOTHER catalog field, in ANY department) and rendered read-only — never independently stored/edited.
-- Placed on npd_field_catalog (the field is intrinsically auto across every dept placement; the owner's
-- "any department" requirement confirms a field-level, cross-dept relationship). Idempotent.

alter table public.npd_field_catalog
  add column if not exists is_auto boolean not null default false,
  add column if not exists auto_source_field text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname='npd_field_catalog_auto_not_self'
                    and conrelid='public.npd_field_catalog'::regclass) then
    alter table public.npd_field_catalog
      add constraint npd_field_catalog_auto_not_self
      check (auto_source_field is null or auto_source_field <> code);
  end if;

  if not exists (select 1 from pg_constraint
                  where conname='npd_field_catalog_auto_coherence'
                    and conrelid='public.npd_field_catalog'::regclass) then
    alter table public.npd_field_catalog
      add constraint npd_field_catalog_auto_coherence
      check ((is_auto = false and auto_source_field is null)
          or (is_auto = true  and auto_source_field is not null));
  end if;
end $$;

-- Cycle guard (depth-2: source must exist + must not point straight back). Deeper chains are a
-- separate low-priority concern (the owner requirement is direct auto-from-one-field).
create or replace function public.npd_field_catalog_auto_cycle_check()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_source_is_auto boolean;
  v_source_source  text;
begin
  if new.is_auto = false or new.auto_source_field is null then
    return new;
  end if;
  select is_auto, auto_source_field
    into v_source_is_auto, v_source_source
    from public.npd_field_catalog
   where org_id = new.org_id and code = new.auto_source_field and active = true
   limit 1;
  if not found then
    raise exception 'auto_source_field "%" does not exist or is inactive in this org', new.auto_source_field;
  end if;
  if v_source_is_auto and v_source_source = new.code then
    raise exception 'auto_source_field "%" creates a cycle with "%"', new.auto_source_field, new.code;
  end if;
  return new;
end;
$$;

drop trigger if exists npd_field_catalog_auto_cycle_check_trg on public.npd_field_catalog;
create trigger npd_field_catalog_auto_cycle_check_trg
  before insert or update of is_auto, auto_source_field on public.npd_field_catalog
  for each row execute function public.npd_field_catalog_auto_cycle_check();
