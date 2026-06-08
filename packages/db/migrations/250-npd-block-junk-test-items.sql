-- 250-npd-block-junk-test-items.sql
--
-- Remove the leftover placeholder/test items from the recipe ingredient picker.
--
-- The Lane-B ItemPicker (searchItems) lists component items WHERE status <> 'blocked'.
-- Four hand-entered test rows for the demo org (Apex 22 = …0002) cluttered it with
-- no real cost data: RM-TEST-01, RM-TEST-02 (rm), ING0002 "salt" (intermediate) and
-- FG-test-1 "Bread" (fg — never in the picker, blocked here only for tidiness).
--
-- We BLOCK rather than DELETE because two of them (ING0002, RM-TEST-01) are still
-- referenced by formulation_ingredients.item_id — deleting would break those FKs and
-- rewrite history. status='blocked' hides them from the picker while leaving every
-- existing recipe row intact, and is fully reversible.
--
-- Idempotent: a plain status UPDATE scoped by org + item_code.

update public.items
   set status = 'blocked'
 where org_id = '00000000-0000-0000-0000-000000000002'::uuid
   and item_code in ('RM-TEST-01', 'RM-TEST-02', 'ING0002', 'FG-test-1')
   and status <> 'blocked';
