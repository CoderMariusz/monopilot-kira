-- Migration 077: Extend canonical Reference.DeptColumns for NPD §4.2 metadata.
--
-- ADR-030 already creates the runtime table as "Reference"."DeptColumns".
-- Do not create public."Reference.DeptColumns"; schema-runtime and
-- schema-driven actions read the schema-qualified Reference table.

alter table "Reference"."DeptColumns"
  add column if not exists dropdown_source text,
  add column if not exists blocking_rule text,
  add column if not exists required_for_done boolean not null default false,
  add column if not exists display_order integer,
  add column if not exists marker text;
