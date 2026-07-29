-- PF-R18-01 (Fala 11 / T4): customer allergen restrictions must resolve against the
-- canonical Reference."Allergens" EU-14 master (migration 082), not the optional
-- reference_tables overlay that many orgs never populated.
--
-- customer_allergen_restrictions.allergen_id is uuid; Reference."Allergens" is keyed
-- by (org_id, allergen_code). shipping_allergen_reference_id() is the deterministic
-- bridge UUID — not a parallel dictionary.

create or replace function public.shipping_allergen_reference_id(p_org_id uuid, p_allergen_code text)
returns uuid
language sql
immutable
strict
as $$
  select (
    substring(h, 1, 8) || '-' ||
    substring(h, 9, 4) || '-4' || substring(h, 13, 3) || '-' ||
    'a' || substring(h, 17, 3) || '-' ||
    substring(h, 21, 12)
  )::uuid
  from (
    select encode(
      sha256(
        ('shipping.allergen_ref:' || p_org_id::text || ':' || lower(btrim(p_allergen_code)))::bytea
      ),
      'hex'
    ) as h
  ) s;
$$;

revoke all on function public.shipping_allergen_reference_id(uuid, text) from public;
grant execute on function public.shipping_allergen_reference_id(uuid, text) to app_user;

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_allergens_eu14_for_org(v_org.id);
  end loop;
end
$$;

-- Backfill: restrictions that stored reference_tables overlay row ids → canonical ids.
update public.customer_allergen_restrictions car
   set allergen_id = public.shipping_allergen_reference_id(
         car.org_id,
         coalesce(nullif(trim(rt.row_data->>'allergen_code'), ''), rt.row_key)
       ),
       updated_at = pg_catalog.now()
  from public.reference_tables rt
 where car.deleted_at is null
   and rt.org_id = car.org_id
   and rt.table_code = 'reference.allergens_reference'
   and rt.is_active
   and (
     rt.row_data->>'id' = car.allergen_id::text
     or rt.row_key = car.allergen_id::text
   )
   and exists (
     select 1
       from "Reference"."Allergens" ra
      where ra.org_id = car.org_id
        and ra.allergen_code = coalesce(nullif(trim(rt.row_data->>'allergen_code'), ''), rt.row_key)
   );

-- Backfill: restrictions already keyed by allergen_code text in row_key/id form.
update public.customer_allergen_restrictions car
   set allergen_id = public.shipping_allergen_reference_id(car.org_id, ra.allergen_code),
       updated_at = pg_catalog.now()
  from "Reference"."Allergens" ra
 where car.deleted_at is null
   and ra.org_id = car.org_id
   and public.shipping_allergen_reference_id(ra.org_id, ra.allergen_code) is distinct from car.allergen_id
   and (
     lower(car.allergen_id::text) = lower(ra.allergen_code)
     or car.allergen_id::text = ra.allergen_code
   );

do $$
declare
  v_orphan_count integer;
begin
  select count(*)::integer
    into v_orphan_count
    from public.customer_allergen_restrictions car
   where car.deleted_at is null
     and not exists (
       select 1
         from "Reference"."Allergens" ra
        where ra.org_id = car.org_id
          and public.shipping_allergen_reference_id(ra.org_id, ra.allergen_code) = car.allergen_id
     );

  if v_orphan_count > 0 then
    raise exception
      'customer_allergen_restrictions backfill left % restriction(s) without a canonical Reference.Allergens match',
      v_orphan_count;
  end if;
end
$$;
