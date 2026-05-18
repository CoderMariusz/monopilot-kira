-- EU-14 allergen seed for Settings infrastructure/master data (T-009).
-- Idempotent by allergen code; carries English name plus Polish translation.

insert into public.allergens (code, name, name_pl, is_active)
values
  ('A01', 'Cereals containing gluten', 'Zboża zawierające gluten', true),
  ('A02', 'Crustaceans', 'Skorupiaki', true),
  ('A03', 'Eggs', 'Jaja', true),
  ('A04', 'Fish', 'Ryby', true),
  ('A05', 'Peanuts', 'Orzeszki ziemne', true),
  ('A06', 'Soybeans', 'Soja', true),
  ('A07', 'Milk', 'Mleko', true),
  ('A08', 'Nuts', 'Orzechy', true),
  ('A09', 'Celery', 'Seler', true),
  ('A10', 'Mustard', 'Gorczyca', true),
  ('A11', 'Sesame seeds', 'Nasiona sezamu', true),
  ('A12', 'Sulphur dioxide and sulphites', 'Dwutlenek siarki i siarczyny', true),
  ('A13', 'Lupin', 'Łubin', true),
  ('A14', 'Molluscs', 'Mięczaki', true)
on conflict (code) do update
set
  name = excluded.name,
  name_pl = excluded.name_pl,
  is_active = excluded.is_active;
