-- 402-drop-dead-public-allergens.sql
-- DB cleanup audit P5 (owner: "Reference"."Allergens" is the sole allergen vocabulary).
-- public.allergens (numeric A01-A14) is dead: 0 rows live, ZERO production SQL reads it
-- (the only remaining mentions are comments noting the old join was already repointed to
-- "Reference"."Allergens"), and NO foreign key references it (verified). Its RLS policy
-- drops with the table. Reference.Allergens is enforced everywhere; this removes the shadow.
drop table if exists public.allergens;
