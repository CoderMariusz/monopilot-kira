-- 394-reference-suppliers-view.sql
-- Phantom-table fix (DB cleanup audit, Phase 1).
-- The NPD Procurement FA-cell dropdown uses dropdown_source='Suppliers', which resolved
-- to a non-existent "Reference"."Suppliers" table -> 42P01 at runtime (update-fa-cell.ts
-- validation + fg/[productCode]/page.tsx loader). Expose the active operational suppliers
-- (public.suppliers, the Planning master) through a thin view in the "Reference" schema so
-- the existing  select value from "Reference".<source> where org_id = app.current_org_id()
-- dropdown pattern resolves. SECURITY INVOKER so public.suppliers RLS (org scoping) applies
-- to the caller, not the view owner.
create or replace view "Reference"."Suppliers"
  with (security_invoker = true)
as
select s.org_id,
       s.name as value
  from public.suppliers s
 where s.status = 'active';

grant select on "Reference"."Suppliers" to app_user;
