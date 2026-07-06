-- W2-T3 (M-C): industry-appropriate NPD/product category vocabulary.
-- Migration 437 seeded the same meat/fish set for every org regardless of
-- organizations.industry_code, so e.g. a Bakery org only sees meat/fish
-- categories in the NPD create wizard + brief dropdown. This migration:
--   1. defines the canonical per-industry vocab in one SQL function,
--   2. rewrites the org-insert seed trigger to use the org's industry_code,
--   3. backfills industry-appropriate categories for existing orgs (additive only).
-- Idempotent: create or replace + on conflict do nothing.
-- Wave0 lock: org_id scope; RLS on "Reference"."ProductCategories" already
-- enforced via app.current_org_id() (migration 437) — unchanged here.

-- 1. Canonical vocab per industry (single source for trigger + backfill).
create or replace function public.product_category_vocab(p_industry text)
returns table (code text, label text, display_order int)
language sql
immutable
set search_path = pg_catalog, public
as $$
  select v.code, v.label, v.display_order
    from (
      values
        -- bakery
        ('bakery', 'bread_loaf',          'Bread · Loaf',            10),
        ('bakery', 'bread_rolls',         'Bread · Rolls & buns',    20),
        ('bakery', 'pastry_viennoiserie', 'Pastry · Viennoiserie',   30),
        ('bakery', 'cake_confectionery',  'Cakes · Confectionery',   40),
        ('bakery', 'biscuit_cookie',      'Biscuits · Cookies',      50),
        -- pharma
        ('pharma', 'pharma_tablet',       'Solid dose · Tablet',     10),
        ('pharma', 'pharma_capsule',      'Solid dose · Capsule',    20),
        ('pharma', 'pharma_liquid',       'Liquid · Oral',           30),
        ('pharma', 'pharma_topical',      'Topical · Cream & ointment', 40),
        ('pharma', 'pharma_powder',       'Powder · Sachet',         50),
        -- fmcg
        ('fmcg',   'fmcg_beverage',       'Beverage',                10),
        ('fmcg',   'fmcg_snack',          'Snack',                   20),
        ('fmcg',   'fmcg_sauce',          'Sauce & condiment',       30),
        ('fmcg',   'fmcg_dairy',          'Dairy',                   40),
        ('fmcg',   'fmcg_frozen',         'Frozen',                  50),
        -- generic keeps the pre-442 default set (existing orgs' data).
        ('generic', 'meat_cold_cut',      'Meat · Cold cut',         10),
        ('generic', 'meat_smoked',        'Meat · Smoked',           20),
        ('generic', 'meat_cured',         'Meat · Cured',            30),
        ('generic', 'meat_pate',          'Meat · Pâté',             40),
        ('generic', 'fish_smoked',        'Fish · Smoked',           50)
    ) as v(industry_code, code, label, display_order)
   where v.industry_code = coalesce(p_industry, 'generic');
$$;

-- 2. Industry-aware org-insert seed (replaces the meat/fish-only body
--    installed by migration 437; trigger name/wiring unchanged).
create or replace function public.seed_product_categories_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into "Reference"."ProductCategories"
    (id, org_id, code, label, is_active, display_order)
  select gen_random_uuid(), new.id, vocab.code, vocab.label, true, vocab.display_order
    from public.product_category_vocab(new.industry_code) as vocab
  on conflict (org_id, code) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_product_categories on public.organizations;
create trigger trg_seed_product_categories
  after insert on public.organizations
  for each row
  execute function public.seed_product_categories_on_org_insert();

-- 3. Backfill: every existing org gets its industry's vocab.
insert into "Reference"."ProductCategories"
  (id, org_id, code, label, is_active, display_order)
select gen_random_uuid(), org.id, vocab.code, vocab.label, true, vocab.display_order
  from public.organizations org
 cross join lateral public.product_category_vocab(org.industry_code) as vocab
on conflict (org_id, code) do nothing;
