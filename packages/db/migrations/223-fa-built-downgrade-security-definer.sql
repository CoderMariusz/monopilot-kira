-- P0-2: remove the bypassable app.fa_built_reset_allowed session-GUC gate from
-- the V18 built downgrade invariant. Legitimate resets run through privileged
-- SECURITY DEFINER paths that perform the downgrade and emit fa.built_reset
-- atomically. Direct app_user UPDATE of public.product.built is revoked.
-- Source mirrored from migration 141-update-fa-cell-reset-built.sql.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create or replace function public.fa_built_v18_check_fn()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.built is false and old.built is true then
    if current_user = 'app_user' then
      raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT'
        using errcode = '23514';
    end if;
  end if;

  if new.built is true and old.built is false then
    if exists (
      select 1
      from public.risks risk
      where risk.org_id = new.org_id
        and risk.product_code = new.product_code
        and risk.bucket = 'High'
        and risk.state = 'Open'
    ) then
      raise exception 'V18_HIGH_RISK_OPEN'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.fa_built_v18_check_fn() from public;

drop trigger if exists fa_built_v18_check on public.product;
create trigger fa_built_v18_check
  before update of built on public.product
  for each row
  when (old.built is distinct from new.built)
  execute function public.fa_built_v18_check_fn();

create or replace function public.fa_reset_product_built_for_edit(
  p_org_id uuid,
  p_product_code text,
  p_actor_user_id uuid,
  p_source text,
  p_diff jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_context_org_id uuid := app.current_org_id();
  v_reset boolean := false;
  v_row_count integer := 0;
begin
  if v_context_org_id is null then
    raise exception 'fa_reset_product_built_for_edit requires an org context (app.current_org_id())'
      using errcode = '23514';
  end if;

  if p_org_id is distinct from v_context_org_id then
    raise exception 'fa_reset_product_built_for_edit org mismatch'
      using errcode = '23514';
  end if;

  update public.product
     set built = false
   where org_id = p_org_id
     and product_code = p_product_code
     and built = true;

  get diagnostics v_row_count = row_count;
  v_reset := v_row_count > 0;

  if v_reset then
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        p_org_id,
        'fa.built_reset',
        'fa',
        p_product_code,
        jsonb_build_object(
          'org_id', p_org_id,
          'product_code', p_product_code,
          'actor_user_id', p_actor_user_id,
          'source', p_source,
          'diff', coalesce(p_diff, '{}'::jsonb)
        ),
        'update-fa-cell-reset-built-v2'
      );
  end if;

  return v_reset;
end;
$$;

revoke all on function public.fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb) from public;
grant execute on function public.fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb) to app_user;

create or replace function public.fa_reset_built_on_product_edit_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_diff jsonb := '{}'::jsonb;
begin
  v_old := to_jsonb(old) - 'built';
  v_new := to_jsonb(new) - 'built';

  if old.built is true and v_old is distinct from v_new then
    new.built := false;
    v_actor := public.fa_actor_from_local_context();

    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        new.org_id,
        'fa.built_reset',
        'fa',
        new.product_code,
        jsonb_build_object(
          'org_id', new.org_id,
          'product_code', new.product_code,
          'actor_user_id', v_actor,
          'source', 'product',
          'diff', v_diff
        ),
        'update-fa-cell-reset-built-v2'
      );
  end if;

  return new;
end;
$$;

revoke all on function public.fa_reset_built_on_product_edit_fn() from public;

drop trigger if exists fa_reset_built_on_product_edit on public.product;
create trigger fa_reset_built_on_product_edit
  before update on public.product
  for each row
  when (old.built is true)
  execute function public.fa_reset_built_on_product_edit_fn();

create or replace function public.fa_reset_built_on_prod_detail_edit_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  v_old := to_jsonb(old) - 'created_at';
  v_new := to_jsonb(new) - 'created_at';

  if v_old is distinct from v_new then
    perform public.fa_reset_product_built_for_edit(
      new.org_id,
      new.product_code,
      public.fa_actor_from_local_context(),
      'prod_detail',
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function public.fa_reset_built_on_prod_detail_edit_fn() from public;

drop trigger if exists fa_reset_built_on_prod_detail_edit on public.prod_detail;
create trigger fa_reset_built_on_prod_detail_edit
  after update on public.prod_detail
  for each row
  execute function public.fa_reset_built_on_prod_detail_edit_fn();

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

comment on function public.fa_built_v18_check_fn() is
  'P0-2: V18 built true->false downgrade is rejected for direct app_user updates; legitimate resets must run through SECURITY DEFINER reset/audit paths.';
comment on function public.fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb) is
  'P0-2: SECURITY DEFINER built reset helper; validates app.current_org_id(), clears built, and emits canonical fa.built_reset atomically.';
