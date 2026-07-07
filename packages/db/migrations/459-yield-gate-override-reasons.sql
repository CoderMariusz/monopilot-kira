-- Migration 459: 08-Production yield-gate override reason taxonomy (NN-PROD-6).
-- Global read-only reference list for supervisor yield-gate bypass reasons.
-- App validation mirrors this seed in apps/web/lib/production/yield-gate-override.ts.
-- Skipped 455 (parallel buffer). Idempotent, additive, live-safe.

create table if not exists public.yield_gate_override_reasons (
  code          text primary key,
  label_key     text not null,
  display_order integer not null,
  is_active     boolean not null default true,
  constraint yield_gate_override_reasons_code_nonblank
    check (length(btrim(code)) > 0),
  constraint yield_gate_override_reasons_label_key_nonblank
    check (length(btrim(label_key)) > 0)
);

revoke all on public.yield_gate_override_reasons from public;
grant select on public.yield_gate_override_reasons to app_user;

insert into public.yield_gate_override_reasons (code, label_key, display_order)
values
  ('scrap_quality',      'production.yield_gate_override.scrap_quality',      1),
  ('equipment_failure',  'production.yield_gate_override.equipment_failure',  2),
  ('material_shortage',  'production.yield_gate_override.material_shortage',  3),
  ('other',              'production.yield_gate_override.other',              4)
on conflict (code) do update
  set label_key = excluded.label_key,
      display_order = excluded.display_order,
      is_active = excluded.is_active;

do $$
declare
  v_count int;
begin
  select count(*)::int into v_count from public.yield_gate_override_reasons where is_active;
  raise notice '459: yield_gate_override_reasons active row count = %', v_count;
end $$;
