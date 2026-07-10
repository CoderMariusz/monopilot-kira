-- Wave 11 fix round 2 / N-25: built physically lives on fg_npd_ext + product_legacy (and the
-- product/fa views project it). mig 468 locked down the product VIEW only; app_user still had
-- blanket UPDATE on fg_npd_ext (mig 353/421) and inherited UPDATE on product_legacy (renamed
-- from product in mig 359), so direct base-table built=false bypassed all view guards.
-- REVOKE UPDATE(built) everywhere; re-grant UPDATE on all other columns (mirrors mig 468/223).
-- The audited SECURITY DEFINER helper fa_reset_product_built_for_edit (owner) remains the sole
-- writer — grants are the real boundary; no client-forgeable GUC.
-- Wave0 lock: org_id; RLS via app.current_org_id().

-- ── public.product view (idempotent re-lockdown; mirrors mig 468) ──
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

-- ── public.fa compat view (SELECT-only today; revoke built UPDATE if ever granted) ──
do $$
begin
  if to_regclass('public.fa') is not null
     and exists (
       select 1
         from pg_attribute a
        where a.attrelid = 'public.fa'::regclass
          and a.attname = 'built'
          and a.attnum > 0
          and not a.attisdropped
     ) then
    execute 'revoke update (built) on public.fa from app_user';
  end if;
end
$$;

-- ── base tables carrying built: fg_npd_ext, product_legacy ──
do $$
declare
  v_rel regclass;
  v_columns text;
begin
  foreach v_rel in array array['public.fg_npd_ext'::regclass, 'public.product_legacy'::regclass]
  loop
    if to_regclass(v_rel::text) is null then
      continue;
    end if;

    if not exists (
      select 1
        from pg_attribute a
       where a.attrelid = v_rel
         and a.attname = 'built'
         and a.attnum > 0
         and not a.attisdropped
    ) then
      continue;
    end if;

    execute format('revoke update on %s from app_user', v_rel);

    select string_agg(quote_ident(attname), ', ' order by attnum)
      into v_columns
      from pg_attribute a
     where a.attrelid = v_rel
       and a.attnum > 0
       and not a.attisdropped
       and a.attname <> 'built';

    if v_columns is not null then
      execute format('grant update (%s) on %s to app_user', v_columns, v_rel);
    end if;
  end loop;
end
$$;

comment on view public.product is
  'product→items merge (mig 359): items ⨝ fg_npd_ext, exact 93-col legacy shape. '
  'INSTEAD-OF triggers fan writes to items/fg_npd_ext/product_legacy. Base table = product_legacy (skeleton anchor for the 16 FKs). '
  'mig 468/475: app_user UPDATE grant excludes built on view + base tables (mirrors mig 223).';
