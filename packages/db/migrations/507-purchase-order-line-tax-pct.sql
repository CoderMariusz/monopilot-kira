-- C056 / W4-PO-2: per-line VAT rate on purchase order lines (mirrors sales_order_lines.tax_pct).
alter table public.purchase_order_lines
  add column if not exists tax_pct numeric(7, 4) default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.purchase_order_lines'::regclass
       and conname = 'purchase_order_lines_tax_pct_check'
  ) then
    alter table public.purchase_order_lines
      add constraint purchase_order_lines_tax_pct_check
      check (tax_pct is null or tax_pct between 0 and 100);
  end if;
end
$$;

comment on column public.purchase_order_lines.tax_pct is
  'Line VAT rate (0–100). Net = qty × unit_price; tax = net × tax_pct/100; gross = net + tax.';
