-- 340 — bom_co_products.expected_yield_pct
--
-- The disassembly-BOM create path (createDisassemblyBomDraft,
-- apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/disassembly.ts:216-221)
-- writes an `expected_yield_pct` per co-product, and getDisassemblyBom
-- (same file :304-319) reads it back. The column was never migrated onto
-- bom_co_products, so BOTH statements fail with 42703:
--   - createDisassemblyBomDraft → persistence_failed (no disassembly BOM can be created)
--   - getDisassemblyBom → throws; the detail page swallows it via try/catch and
--     falls through to the forward 7-tab view, so it is latent (0 disassembly
--     BOMs exist today) but disassembly BOMs can never be created or viewed.
--
-- Fix is additive: add the nullable column to match the code's intent (an
-- optional per-co-product expected yield %, sitting alongside allocation_pct).
-- Non-destructive, idempotent.
alter table public.bom_co_products
  add column if not exists expected_yield_pct numeric;
