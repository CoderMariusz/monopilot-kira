-- Migration 274: 08-Production scanner waste category seed.
-- Wave0 lock: org_id business scope. Inserts the handheld scanner category codes for every org.

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
