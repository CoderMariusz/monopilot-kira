-- RF5 follow-up #1: defense-in-depth consistency guard for factory release bundles.
-- Mirrors release-bundle-service.ts specFgMatchesBomProduct:
-- legacy Technical BOMs with bom_headers.product_id IS NULL are exempt; otherwise
-- factory_specs.fg_item_id -> items.item_code must match bom_headers.product_id.

drop trigger if exists trg_factory_release_consistency on public.factory_release_status;
drop function if exists public.check_factory_release_consistency();

create function public.check_factory_release_consistency()
returns trigger
language plpgsql
as $$
declare
  v_fg_item_code text;
  v_bom_product_id text;
  v_spec_bom_header_id uuid;
begin
  select i.item_code, bh.product_id, fs.bom_header_id
    into v_fg_item_code, v_bom_product_id, v_spec_bom_header_id
    from public.factory_specs fs
    join public.bom_headers bh
      on bh.id = new.active_bom_header_id
     and bh.org_id = new.org_id
    join public.items i
      on i.id = fs.fg_item_id
     and i.org_id = new.org_id
   where fs.id = new.active_factory_spec_id
     and fs.org_id = new.org_id;

  -- Spec must exist in-org; when the spec is PAIRED to a BOM it must be THIS
  -- bom header; when the BOM carries a product_id the spec's FG must match it.
  -- (The pre-existing factory_release_status_validate() trigger covers the
  -- BOM<->product_code/project side but never inspects the spec — this guard
  -- is the spec-side complement, mirroring release-bundle-service.ts.)
  if not found
     or (v_spec_bom_header_id is not null and v_spec_bom_header_id <> new.active_bom_header_id)
     or (v_bom_product_id is not null and v_fg_item_code is distinct from v_bom_product_id) then
    raise exception 'factory_release_spec_bom_mismatch: spec fg_item % does not match bom product_id %',
      v_fg_item_code,
      v_bom_product_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_factory_release_consistency
  before insert or update on public.factory_release_status
  for each row
  when (
    new.active_factory_spec_id is not null
    and new.active_bom_header_id is not null
  )
  execute function public.check_factory_release_consistency();
