-- Migration 277: fix the demo transfer-order route shown as "— → —".
--
-- Live finding (/warehouse/inbound): the inbound schedule's TO rows render
-- "— → —" because the demo transfer orders seeded by migration 263
-- (TO-DEMO-%, demo org 00000000-0000-0000-0000-000000000002) carry NULL
-- from_warehouse_id / to_warehouse_id — at 263-apply time the demo org had
-- fewer than two warehouses, so the seed's route resolution collapsed to NULL.
-- The page code is correct (it joins warehouse names); only the data is bad.
--
-- Plan (idempotent, demo rows only):
--   1) Top up the demo org to TWO warehouses (a route needs distinct from/to).
--      Sequential guarded inserts, NOT EXISTS by code — mig 251/266 lesson:
--      never ON CONFLICT a multi-arbiter table; plain count guards re-runs.
--   2) UPDATE only TO-DEMO-% rows of the demo org WHERE from/to IS NULL,
--      picking warehouses from the SAME org ordered (is_default desc,
--      created_at, id) and excluding the other endpoint so the
--      transfer_orders_distinct_warehouses_check constraint can never trip.
--
-- Wave0 lock: org_id scoping throughout; RLS untouched (data-only migration).

-- 1a) WH-DEMO-01 — top up whichever demo code is missing while the org still
--     has fewer than two warehouses (review fix F9: an org whose ONLY
--     warehouse is 'WH-DEMO-02' previously got no top-up here and 1b's
--     NOT-EXISTS also skipped, leaving one route endpoint NULL in step 2).
--     is_default stays true only when the org had no warehouse at all, so an
--     org-defined default is never stolen.
insert into public.warehouses (org_id, code, name, warehouse_type, is_default)
select '00000000-0000-0000-0000-000000000002'::uuid,
       'WH-DEMO-01',
       'Demo Main Warehouse',
       'general',
       not exists (
         select 1 from public.warehouses w
          where w.org_id = '00000000-0000-0000-0000-000000000002'::uuid
       )
 where (
   select count(*) from public.warehouses w
    where w.org_id = '00000000-0000-0000-0000-000000000002'::uuid
 ) < 2
   and not exists (
     select 1 from public.warehouses w
      where w.org_id = '00000000-0000-0000-0000-000000000002'::uuid
        and w.code = 'WH-DEMO-01'
   );

-- 1b) Second demo warehouse — only while the org still has fewer than two
--     (sees 1a's row in the same migration, so a fresh org ends at exactly two).
insert into public.warehouses (org_id, code, name, warehouse_type, is_default)
select '00000000-0000-0000-0000-000000000002'::uuid,
       'WH-DEMO-02',
       'Demo Distribution Center',
       'general',
       false
 where (
   select count(*) from public.warehouses w
    where w.org_id = '00000000-0000-0000-0000-000000000002'::uuid
 ) < 2
   and not exists (
     select 1 from public.warehouses w
      where w.org_id = '00000000-0000-0000-0000-000000000002'::uuid
        and w.code = 'WH-DEMO-02'
   );

-- 2) Repair NULL route endpoints on the demo TOs only (WHERE ... IS NULL keeps
--    this idempotent and human-edited routes untouched). The destination
--    subquery re-derives the resolved source (old from_warehouse_id is what SET
--    expressions see) and excludes it, so from <> to always holds.
update public.transfer_orders t
   set from_warehouse_id = coalesce(
         t.from_warehouse_id,
         (select w.id
            from public.warehouses w
           where w.org_id = t.org_id
             and (t.to_warehouse_id is null or w.id <> t.to_warehouse_id)
           order by w.is_default desc, w.created_at, w.id
           limit 1)
       ),
       to_warehouse_id = coalesce(
         t.to_warehouse_id,
         (select w.id
            from public.warehouses w
           where w.org_id = t.org_id
             and w.id is distinct from coalesce(
               t.from_warehouse_id,
               (select w2.id
                  from public.warehouses w2
                 where w2.org_id = t.org_id
                   and (t.to_warehouse_id is null or w2.id <> t.to_warehouse_id)
                 order by w2.is_default desc, w2.created_at, w2.id
                 limit 1)
             )
           order by w.is_default desc, w.created_at, w.id
           limit 1)
       ),
       updated_at = pg_catalog.now()
 where t.org_id = '00000000-0000-0000-0000-000000000002'::uuid
   and t.to_number like 'TO-DEMO-%'
   and (t.from_warehouse_id is null or t.to_warehouse_id is null);
