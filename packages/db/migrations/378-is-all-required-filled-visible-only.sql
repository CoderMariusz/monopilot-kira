-- Migration 378 — A3 follow-up: the dept-close gate counts only VISIBLE required fields.
-- is_all_required_filled(product_code, dept) (rewritten in mig 377 to read npd_field_catalog)
-- joined npd_department_field on (required = true) but NOT (visible = true). The FA/FG render
-- query (page.tsx readDeptColumns) DOES filter `df.visible = true`, so a field that Settings NPD
-- field-config marks required+hidden would be DEMANDED by the close gate yet never SHOWN to the
-- user — making the department impossible to close (a latent gate-lock; no seeded field is hidden
-- today, but updateAssignment can set visible=false). Add `and df.visible = true` so the gate is
-- consistent with the render: only fields that are BOTH required AND visible block the close.
-- The companion TS read paths get the same filter in this commit:
--   apps/web/app/(npd)/fa/actions/close-dept-section.ts (listMissingRequiredColumns)
--   apps/web/app/(npd)/fa/actions/get-required-fields-for-dept.ts
-- ONLY the required-column SOURCE join changes; the product-row load + per-field value check are byte-identical to mig 377.

create or replace function public.is_all_required_filled(product_code text, dept text)
 returns boolean
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'public', 'Reference'
as $function$
declare
  product_row public.product%rowtype;
  product_json jsonb;
  required_column record;
  physical_column text;
  field_value text;
begin
  select *
    into product_row
    from public.product
   where product.product_code = is_all_required_filled.product_code;

  if not found then
    return false;
  end if;

  product_json := to_jsonb(product_row);

  for required_column in
    select f.code as column_key
      from public.npd_departments d
      join public.npd_department_field df
        on df.department_id = d.id and df.org_id = d.org_id and df.required = true and df.visible = true
      join public.npd_field_catalog f
        on f.id = df.field_id and f.org_id = df.org_id and f.active = true
     where d.org_id = product_row.org_id
       and lower(d.code) = lower(is_all_required_filled.dept)
       and d.active = true
     order by df.display_order nulls last, f.code
  loop
    physical_column := lower(required_column.column_key);

    if not product_json ? physical_column then
      return false;
    end if;

    field_value := product_json ->> physical_column;
    if field_value is null or nullif(btrim(field_value), '') is null then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;
