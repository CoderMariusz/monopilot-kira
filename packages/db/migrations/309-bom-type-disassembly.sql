-- Migration 309: Wave E7 — bom_headers.bom_type (forward | disassembly).
-- A disassembly BOM has 1 input line (e.g. a carcass/primal) and N co-product OUTPUTS
-- (bom_co_products, mig 159, with allocation_pct). Default forward keeps every existing BOM intact.
alter table public.bom_headers add column if not exists bom_type text not null default 'forward';
alter table public.bom_headers drop constraint if exists bom_headers_bom_type_check;
alter table public.bom_headers add constraint bom_headers_bom_type_check
  check (bom_type in ('forward','disassembly'));
