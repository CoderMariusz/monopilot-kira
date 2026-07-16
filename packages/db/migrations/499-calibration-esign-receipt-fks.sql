-- Migration 499: C115 — dedicated e-sign receipt FKs on calibration_records.
-- certificate_file_url / certificate_sha256 remain for real certificate artifacts only.
-- Idempotent: safe when columns already exist without FK (prod pre-499 state).

-- primary_signature_id: ensure uuid column, then named FK
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'calibration_records'
       and column_name = 'primary_signature_id'
  ) then
    alter table public.calibration_records
      add column primary_signature_id uuid;
  elsif exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'calibration_records'
       and column_name = 'primary_signature_id'
       and udt_name <> 'uuid'
  ) then
    raise exception 'calibration_records.primary_signature_id must be uuid, got %',
      (select udt_name from information_schema.columns
        where table_schema = 'public' and table_name = 'calibration_records'
          and column_name = 'primary_signature_id');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calibration_records_primary_signature_id_fkey'
  ) then
    alter table public.calibration_records
      add constraint calibration_records_primary_signature_id_fkey
      foreign key (primary_signature_id)
      references public.e_sign_log (signature_id) on delete restrict;
  end if;
end
$$;

-- reviewer_signature_id: ensure uuid column, then named FK
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'calibration_records'
       and column_name = 'reviewer_signature_id'
  ) then
    alter table public.calibration_records
      add column reviewer_signature_id uuid;
  elsif exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'calibration_records'
       and column_name = 'reviewer_signature_id'
       and udt_name <> 'uuid'
  ) then
    raise exception 'calibration_records.reviewer_signature_id must be uuid, got %',
      (select udt_name from information_schema.columns
        where table_schema = 'public' and table_name = 'calibration_records'
          and column_name = 'reviewer_signature_id');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calibration_records_reviewer_signature_id_fkey'
  ) then
    alter table public.calibration_records
      add constraint calibration_records_reviewer_signature_id_fkey
      foreign key (reviewer_signature_id)
      references public.e_sign_log (signature_id) on delete restrict;
  end if;
end
$$;

create index if not exists idx_cal_rec_primary_sig
  on public.calibration_records (primary_signature_id)
  where primary_signature_id is not null;

create index if not exists idx_cal_rec_reviewer_sig
  on public.calibration_records (reviewer_signature_id)
  where reviewer_signature_id is not null;

comment on column public.calibration_records.primary_signature_id is
  'CFR-21 Part 11 calibrator receipt FK to e_sign_log';

comment on column public.calibration_records.reviewer_signature_id is
  'CFR-21 Part 11 reviewer receipt FK to e_sign_log';
