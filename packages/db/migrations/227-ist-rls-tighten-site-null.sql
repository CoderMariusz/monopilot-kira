-- QG-09: Tighten inter_site_transfer_orders site RLS for NULL site_id rows.
-- Source: 215-multi-site-sites-registry-context.sql created policy
-- inter_site_transfer_orders_site_scope with:
--   org_id = app.current_org_id()
--   and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
-- The site_id IS NULL escape made pre-backfill rows visible to every specific-site caller in
-- the same org. Keep org isolation and allow NULL-site rows only in ALL-sites mode
-- (app.current_site_id() IS NULL).

drop policy if exists inter_site_transfer_orders_site_scope on public.inter_site_transfer_orders;

create policy inter_site_transfer_orders_site_scope
  on public.inter_site_transfer_orders
  for all
  to app_user
  using (
    org_id = app.current_org_id()
    and (app.current_site_id() is null or site_id = app.current_site_id())
  )
  with check (
    org_id = app.current_org_id()
    and (app.current_site_id() is null or site_id = app.current_site_id())
  );
