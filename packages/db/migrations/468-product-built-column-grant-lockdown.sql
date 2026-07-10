-- Wave 11 / N-24: mig 359 re-granted blanket UPDATE on public.product (incl. built),
-- undoing mig 223's column-level lockdown. Re-apply UPDATE on all view columns EXCEPT built
-- so direct app_user built writes fail at the privilege layer (defense-in-depth; INSTEAD-OF
-- triggers still handle legitimate audited paths as SECURITY DEFINER owner).
-- Wave0 lock: org_id; RLS via app.current_org_id().

revoke update on public.product from app_user;

do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into v_columns
    from pg_attribute
   where attrelid = 'public.product'::regclass
     and attnum > 0
     and not attisdropped
     and attname <> 'built';

  if v_columns is null then
    raise exception 'public.product has no updateable columns after excluding built';
  end if;

  execute format('grant update (%s) on public.product to app_user', v_columns);
end
$$;

comment on view public.product is
  'product→items merge (mig 359): items ⨝ fg_npd_ext, exact 93-col legacy shape. '
  'INSTEAD-OF triggers fan writes to items/fg_npd_ext/product_legacy. Base table = product_legacy (skeleton anchor for the 16 FKs). '
  'mig 468: app_user UPDATE grant excludes built (mirrors mig 223).';
