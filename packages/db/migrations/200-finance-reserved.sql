-- Migration 200: 10-Finance — RESERVED.
-- Reserved slot for the 10-finance schema foundation wave (paired with 199). Intentionally a
-- no-op so the migration runner records it and the slot is consumed (prevents a later module
-- from claiming 200 and colliding with the finance wave numbering). Future finance schema
-- follow-ups (e.g., GIST EXCLUDE no-overlap on approved standard_costs, immutability trigger,
-- monthly-close freeze table) land in NEW forward migrations >= 201 — NEVER by editing 199/200.
--
-- Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id(). NUMERIC-exact money/qty.
select 1 where false;
