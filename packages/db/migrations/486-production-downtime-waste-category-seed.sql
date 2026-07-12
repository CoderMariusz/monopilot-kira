-- Migration 486: baseline downtime + waste category taxonomy for every org (A5 / S16).
-- NEXT FREE after 485. Idempotent, additive, live-safe — mirrors 459 yield_gate_override_reasons
-- and 274 waste_categories seed patterns. Pause (wo_pause) and waste registration require
-- at least one row in downtime_categories / waste_categories (migration 183 NOT NULL FKs).

insert into public.downtime_categories (org_id, code, name, kind, is_active)
select o.id, c.code, c.name, c.kind, true
  from public.organizations o
 cross join (
   values
     ('PEOPLE_BREAK', 'Operator break', 'planned'),
     ('PEOPLE_MISSING', 'Operator missing', 'unplanned'),
     ('PEOPLE_TRAINING', 'Operator training', 'planned'),
     ('PROCESS_MATERIAL_WAIT', 'Material wait', 'unplanned'),
     ('PROCESS_UPSTREAM', 'Upstream delay', 'unplanned'),
     ('PROCESS_QUALITY_HOLD', 'Quality hold', 'unplanned'),
     ('PLANT_BREAKDOWN', 'Equipment breakdown', 'unplanned'),
     ('PLANT_CHANGEOVER', 'Changeover', 'changeover'),
     ('PLANT_CLEANING', 'Cleaning / sanitation', 'planned')
 ) as c(code, name, kind)
on conflict on constraint downtime_categories_org_code_unique do nothing;

insert into public.waste_categories (org_id, code, name, is_active)
select o.id, c.code, c.name, true
  from public.organizations o
 cross join (
   values
     ('TRIM', 'Trim / offcut'),
     ('SPILL', 'Spill'),
     ('QUALITY', 'Quality reject'),
     ('EXPIRED', 'Expired'),
     ('CONTAMINATION', 'Contamination'),
     ('OTHER', 'Other')
 ) as c(code, name)
on conflict on constraint waste_categories_org_code_unique do nothing;

do $$
declare
  v_downtime int;
  v_waste int;
begin
  select count(*)::int into v_downtime from public.downtime_categories where is_active;
  select count(*)::int into v_waste from public.waste_categories where is_active;
  raise notice '486: downtime_categories active row count = %', v_downtime;
  raise notice '486: waste_categories active row count = %', v_waste;
end $$;
