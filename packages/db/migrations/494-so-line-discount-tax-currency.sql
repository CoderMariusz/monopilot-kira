-- Sales-order line commercial terms. Additive and safe for existing rows.
alter table public.sales_order_lines
  add column if not exists discount_pct numeric(7, 4) default 0,
  add column if not exists tax_pct numeric(7, 4) default 0,
  add column if not exists currency text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sales_order_lines'::regclass
       and conname = 'sales_order_lines_discount_pct_check'
  ) then
    alter table public.sales_order_lines
      add constraint sales_order_lines_discount_pct_check
      check (discount_pct is null or discount_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.sales_order_lines'::regclass
       and conname = 'sales_order_lines_tax_pct_check'
  ) then
    alter table public.sales_order_lines
      add constraint sales_order_lines_tax_pct_check
      check (tax_pct is null or tax_pct between 0 and 100);
  end if;
end
$$;
