-- Migration 367 — A13: remove the redundant "Number of cases *" field from the NPD FG Core tab.
-- Owner decision (2026-06-27): "Number of cases" is redundant double-entry and not needed; the
-- separate "Packs per case" field (column_key Packs_Per_Case) stays.
--
-- The FG Core tab is schema-driven from "Reference"."DeptColumns" (dept_code='Core'); there is no
-- hardcoded UI field. Removing the seed row is therefore the whole fix: the dynamic renderer simply
-- stops emitting the input, and — because required_for_done was TRUE — also drops it as a gate on
-- "Close Core". The backing column public.fg_npd_ext.number_of_cases is left in place (harmless,
-- stays NULL); nothing reads it once the DeptColumns row is gone.
--
-- Scope: both seeded orgs (00000000-…-0002 apex demo + …-00ee template). Idempotent (DELETE).

delete from "Reference"."DeptColumns"
 where dept_code = 'Core'
   and column_key = 'Number_of_Cases';
