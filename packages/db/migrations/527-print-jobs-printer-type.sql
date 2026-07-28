-- Migration 527: persist print_jobs.printer_type so reprint survives printer deletion.
-- Wave0: org_id business scope; RLS via app.current_org_id().
--
-- BUG (R08-06): reprintFromHistory joined printers for printer_type. print_jobs.printer_id
-- is ON DELETE SET NULL, so a deleted Direct PDF printer made reprint default to 'zpl' and
-- queue forever with no download output.
--
-- CANONICAL: print_jobs.printer_type mirrors printers.printer_type at insert time.

-- 1. Column + constraint (idempotent). NULLable — no guessed default; trigger + backfill
--    derive the value from real row signals (same deploy-window pattern as migration 526).
alter table public.print_jobs
  add column if not exists printer_type text;

alter table public.print_jobs
  alter column printer_type drop default;

alter table public.print_jobs
  alter column printer_type drop not null;

alter table public.print_jobs
  alter column printer_type drop not null;

alter table public.print_jobs
  drop constraint if exists print_jobs_printer_type_check;

alter table public.print_jobs
  add constraint print_jobs_printer_type_check
  check (printer_type is null or printer_type in ('zpl', 'pdf'));

comment on column public.print_jobs.printer_type is
  'Output mode frozen at job creation: pdf = Direct PDF download (status sent + result_url), '
  'zpl = hardware queue. Survives printer row deletion (printer_id ON DELETE SET NULL). '
  'NULL = legacy row with insufficient signals — never guessed to pdf. Kept in sync by '
  'trigger print_jobs_sync_printer_type (step 4) for writes from an app version that '
  'predates this column; drop the trigger once the column is NOT NULL everywhere.';

-- 2. Backfill from live printer rows only (known truth).
update public.print_jobs pj
   set printer_type = p.printer_type
  from public.printers p
 where pj.printer_id = p.id
   and pj.printer_type is distinct from p.printer_type;

-- 3. Orphaned / historical rows (printer_id null or printer gone): do NOT rewrite history.
--    Completed ZPL jobs (sent, no result_url) stay NULL — reprint resolves via app-layer
--    inference or operator re-select; never bulk-guess pdf.

-- 4. Close the DEPLOY WINDOW. Between migration apply and the new app serving, the
--    PREVIOUS bundle still inserts print_jobs WITHOUT printer_type. A NOT NULL default
--    of pdf would mis-label ZPL hardware jobs for the entire rollout window.
--
--    Chosen fix: BEFORE INSERT/UPDATE trigger derives printer_type from the row itself
--    (printer FK, result_url, status) — same class of fix as migration 526.
create or replace function public.print_jobs_sync_printer_type()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_from_printer text;
begin
  if new.printer_type is not null then
    return new;
  end if;

  if new.printer_id is not null then
    select p.printer_type
      into v_from_printer
      from public.printers p
     where p.id = new.printer_id;

    if v_from_printer is not null then
      new.printer_type := v_from_printer;
      return new;
    end if;
  end if;

  -- Row-signal inference (matches pre-527 app behaviour; never default to pdf blindly).
  if new.result_url is not null then
    new.printer_type := 'pdf';
  elsif new.status = 'queued' then
    new.printer_type := 'zpl';
  end if;

  return new;
end
$$;

drop trigger if exists print_jobs_sync_printer_type on public.print_jobs;
create trigger print_jobs_sync_printer_type
  before insert or update on public.print_jobs
  for each row
  execute function public.print_jobs_sync_printer_type();

-- 5. Post-check: self-built rows in a nested block, then unwound (no SAVEPOINT in PL/pgSQL).
do $$
declare
  v_org      uuid;
  v_printer  uuid;
  v_zpl      uuid;
  v_pdf_job  uuid;
  v_zpl_job  uuid;
  v_type     text;
begin
  select o.id
    into v_org
    from public.organizations o
   order by o.id
   limit 1;

  if v_org is null then
    raise notice 'mig527 post-check skipped: no organizations row';
    return;
  end if;

  begin
    insert into public.printers (org_id, name, printer_type, is_active)
    values (v_org, 'ZZ-MIG527-PDF-' || replace(gen_random_uuid()::text, '-', ''), 'pdf', true)
    returning id into v_printer;

    insert into public.printers (org_id, name, printer_type, is_active)
    values (v_org, 'ZZ-MIG527-ZPL-' || replace(gen_random_uuid()::text, '-', ''), 'zpl', true)
    returning id into v_zpl;

    -- (a) New-app path: explicit printer_type survives orphaning.
    insert into public.print_jobs (
      org_id, printer_id, entity_type, copies, payload, status, result_url, printer_type
    )
    values (
      v_org,
      v_printer,
      'lp',
      1,
      '{"mig527": "pdf"}'::jsonb,
      'sent',
      'data:text/plain;charset=utf-8,probe',
      'pdf'
    )
    returning id into v_pdf_job;

    select printer_type into v_type from public.print_jobs where id = v_pdf_job;
    if v_type is distinct from 'pdf' then
      raise exception 'mig527 post-check FAILED: explicit pdf insert stored %', v_type;
    end if;

    update public.print_jobs set printer_id = null where id = v_pdf_job;
    select printer_type into v_type from public.print_jobs where id = v_pdf_job;
    if v_type is distinct from 'pdf' then
      raise exception 'mig527 post-check FAILED: pdf printer_type changed to % after orphan', v_type;
    end if;

    -- (b) Old-app deploy-window write: no printer_type column value — trigger must infer zpl.
    insert into public.print_jobs (
      org_id, printer_id, entity_type, copies, payload, status, result_url
    )
    values (
      v_org,
      v_zpl,
      'lp',
      1,
      '{"mig527": "zpl"}'::jsonb,
      'queued',
      null
    )
    returning id into v_zpl_job;

    select printer_type into v_type from public.print_jobs where id = v_zpl_job;
    if v_type is distinct from 'zpl' then
      raise exception
        'mig527 trigger post-check FAILED: old-app queued ZPL insert stored % (expected zpl)',
        v_type;
    end if;

    raise exception 'mig527_unwind';
  exception
    when others then
      if sqlerrm <> 'mig527_unwind' then
        raise;
      end if;
  end;

  raise notice 'mig527 post-check OK: pdf persists + old-app ZPL infer (unwound)';
end
$$;
