-- Migration 542: equipment withdrawal audit trail (PF-R20-01).
--
-- Withdrawal is corrective, not DELETE: the row stays visible with who / when / why.
-- Mirrors migration 518 trial-batch void columns.

alter table public.equipment
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.users(id) on delete set null,
  add column if not exists deactivation_reason text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'equipment_deactivation_reason_present'
       and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment
      add constraint equipment_deactivation_reason_present
      check (deactivated_at is null or coalesce(btrim(deactivation_reason), '') <> '')
      not valid;
  end if;
end
$$;

comment on column public.equipment.deactivated_at is
  'When the asset was withdrawn from active service. Row remains for audit; selectors filter active = true.';

comment on column public.equipment.deactivated_by is
  'User who withdrew the asset from active service.';

comment on column public.equipment.deactivation_reason is
  'Mandatory free-text reason when deactivated_at is set.';
