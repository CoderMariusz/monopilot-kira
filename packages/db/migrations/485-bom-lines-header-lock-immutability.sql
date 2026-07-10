-- Migration 485 (W17 / N-48): serialize all bom_lines mutations against parent header lock.
--
-- bom_lines_reject_approved_header_update previously read bom_headers with a plain
-- SELECT, so concurrent line UPDATE/DELETE could commit after an approval txn had
-- taken its RM-usability snapshot under FOR UPDATE on the header. Lock the parent
-- header inside the trigger so every line writer serializes with header lockers.

create or replace function public.bom_lines_reject_approved_header_update()
returns trigger
language plpgsql
as $$
declare
  v_header_id uuid;
  v_header_status text;
begin
  v_header_id := coalesce(new.bom_header_id, old.bom_header_id);

  select h.status
    into v_header_status
    from public.bom_headers h
   where h.id = v_header_id
   for update;

  if v_header_status in ('technical_approved', 'active') then
    raise exception 'approved or active BOM line content is immutable; create a superseding bom_headers version instead';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
    return new;
  elsif tg_op = 'INSERT' then
    return new;
  elsif tg_op = 'DELETE' then
    return old;
  end if;

  raise exception 'unsupported bom_lines immutability trigger operation: %', tg_op;
end;
$$;

comment on function public.bom_lines_reject_approved_header_update() is
  'Rejects line mutations when the parent BOM is approved/active; locks bom_headers FOR UPDATE so all writers serialize with approval.';
