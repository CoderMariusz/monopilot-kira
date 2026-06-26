-- Migration 353 — product→items MERGE, Phase P0 (additive, no behaviour change).
-- Owner-approved (2026-06-26): items becomes the single FG master; public.product becomes a
-- VIEW + this NPD extension table over items. Design: _meta/plans/2026-06-26-product-items-merge-design.md.
-- THIS PHASE only creates the (empty) extension table that will hold the ~NPD-only product columns
-- (the ones with no items equivalent). Backfill = P1 (mig 354); product→view = P2 (mig 355);
-- writer/FK repoint = P3 GO-LIVE CUT (review-gated). Nothing reads/writes fg_npd_ext yet → zero risk.
-- Rollback: drop table public.fg_npd_ext.
--
-- Columns chosen = product columns that do NOT map onto an existing items column (per design §2).
-- Columns that DO map to items (product_name→name, shelf_life→shelf_life_days, tara_weight→tare_weight,
-- price→cost, bar_codes→gs1_gtin, supplier, allergens/may_contain, deleted_at→status, created_by/app_version)
-- are deliberately EXCLUDED — at P2 the product view sources those from items. The split can still be
-- adjusted before P2 (this table is empty until P1). Types mirror public.product exactly.

create table if not exists public.fg_npd_ext (
  item_id    uuid primary key references public.items(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,

  -- core / planning
  pack_size              text,
  number_of_cases        numeric,
  recipe_components      text,
  ingredient_codes       text,
  template               text,
  primary_ingredient_pct numeric,
  runs_per_week          numeric,
  date_code_per_week     text,
  launch_date            date,
  department_number      text,
  article_number         text,
  cases_per_week_w1      numeric,
  cases_per_week_w2      numeric,
  cases_per_week_w3      numeric,

  -- production process / yields
  process_1 text, yield_p1 numeric,
  process_2 text, yield_p2 numeric,
  process_3 text, yield_p3 numeric,
  process_4 text, yield_p4 numeric,
  line text, dieset text, yield_line numeric, staffing text, rate numeric,
  pr_code_p1 text, pr_code_p2 text, pr_code_p3 text, pr_code_p4 text, pr_code_final text,

  -- packaging / mrp
  box text, top_label text, bottom_label text, web text,
  mrp_box text, mrp_labels text, mrp_films text, mrp_sleeves text, mrp_cartons text,
  pallet_stacking_plan text, box_dimensions text,
  lead_time numeric, proc_shelf_life numeric,

  -- dept close + done flags
  closed_core text, closed_planning text, closed_commercial text, closed_production text,
  closed_technical text, closed_mrp text, closed_procurement text,
  done_core boolean, done_planning boolean, done_commercial boolean, done_production boolean,
  done_technical boolean, done_mrp boolean, done_procurement boolean,

  -- lifecycle / brief / commercial descriptive
  status_overall text,
  days_to_launch integer,
  built boolean,
  volume numeric(12,3),
  dev_code text,
  weight numeric(10,3),
  packs_per_case integer,
  benchmark text,
  price_brief numeric(12,2),
  comments text,

  -- allergen declaration (mig 346)
  allergens_declaration_accepted    boolean not null default false,
  allergens_declaration_accepted_by uuid,
  allergens_declaration_accepted_at timestamptz,

  -- AI / trace
  model_prediction_id uuid,
  epcis_event_id      uuid,
  external_id         text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fg_npd_ext enable row level security;
drop policy if exists fg_npd_ext_org on public.fg_npd_ext;
create policy fg_npd_ext_org on public.fg_npd_ext
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on public.fg_npd_ext to app_user;
