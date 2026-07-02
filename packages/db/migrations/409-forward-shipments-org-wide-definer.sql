-- 409-forward-shipments-org-wide-definer.sql
-- Org-wide forward-shipment reader for recall / mock-recall forward traces.
-- A recall MUST surface every customer a lot reached, regardless of the
-- operator's site visibility. public.shipments and public.license_plates carry
-- a RESTRICTIVE site policy (app.user_can_see_site(site_id)) that would prune
-- cross-site shipments for a site-restricted operator -> BRCGS 3.9.2 forward-
-- trace gap. This function runs as the migration owner (bypassing site RLS) but
-- every join is hard-filtered by the trusted p_org_id the caller passes from
-- app.current_org_id(). Mirrors 407-genealogy-org-wide-definer.sql.

create or replace function public.get_forward_shipments_org_wide(
  p_org_id uuid,
  p_lp_ids uuid[]
)
returns table (
  shipment_id text,
  shipment_number text,
  sales_order_id text,
  sales_order_number text,
  customer_id text,
  customer_name text,
  customer_code text,
  lp_id text,
  lp_ref text,
  shipped_qty text,
  uom text
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select sh.id::text as shipment_id,
         sh.shipment_number,
         sh.sales_order_id::text,
         so.order_number as sales_order_number,
         c.id::text as customer_id,
         c.name as customer_name,
         c.customer_code,
         sbc.license_plate_id::text as lp_id,
         coalesce(lp.lp_code, lp.lp_number) as lp_ref,
         sum(sbc.quantity)::text as shipped_qty,
         lp.uom
    from public.shipment_box_contents sbc
    join public.shipment_boxes sb
      on sb.org_id = p_org_id
     and sb.id = sbc.shipment_box_id
     and sb.deleted_at is null
    join public.shipments sh
      on sh.org_id = p_org_id
     and sh.id = sb.shipment_id
     and sh.deleted_at is null
    left join public.sales_orders so
      on so.org_id = p_org_id
     and so.id = sh.sales_order_id
     and so.deleted_at is null
    left join public.customers c
      on c.org_id = p_org_id
     and c.id = coalesce(sh.customer_id, so.customer_id)
    left join public.license_plates lp
      on lp.org_id = p_org_id
     and lp.id = sbc.license_plate_id
   where sbc.org_id = p_org_id
     and sbc.deleted_at is null
     and sbc.license_plate_id = any(p_lp_ids)
     and sbc.quantity is not null
     and sbc.quantity > 0
   group by sh.id, sh.shipment_number, sh.sales_order_id, so.order_number,
            c.id, c.name, c.customer_code, sbc.license_plate_id, lp.lp_code, lp.lp_number, lp.uom
   order by c.name asc nulls last, so.order_number asc nulls last, sh.shipment_number asc nulls last, lp_ref asc
$$;

revoke all on function public.get_forward_shipments_org_wide(uuid, uuid[]) from public;
grant execute on function public.get_forward_shipments_org_wide(uuid, uuid[]) to app_user;
-- Supabase default-grants EXECUTE to anon + authenticated on new public functions, and
-- `revoke ... from public` does NOT cover them. Both org-wide definers TRUST their p_org_id
-- argument (they do not derive org from app.current_org_id() internally), so REST/RPC access
-- by anon/authenticated with an arbitrary p_org_id is a cross-org read leak. Lock to app_user only.
revoke execute on function public.get_forward_shipments_org_wide(uuid, uuid[]) from anon, authenticated;
-- Hardening: 407-genealogy-org-wide-definer.sql shipped get_lp_genealogy_org_wide with the same
-- exposure (that migration is already applied/checksum-locked, so the fix lives here). 407 runs
-- before 409, so the function exists when this revoke executes.
revoke execute on function public.get_lp_genealogy_org_wide(uuid, uuid, text) from anon, authenticated;
