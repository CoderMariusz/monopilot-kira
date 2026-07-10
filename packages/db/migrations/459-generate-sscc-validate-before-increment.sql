-- Migration 459 (NUMBER COLLISION — see also 459-yield-gate-override-reasons.sql):
-- Both files share prefix 459; runner orders by numeric prefix then filename (lexicographic).
-- Renumbering applied migrations is unsafe (schema_migrations checksum gate). Both are
-- tracked independently by filename in schema_migrations.
-- F1 fix: refuse invalid prefix / serial-capacity exhaustion BEFORE next_sscc_serial()
-- so a failed mint does not burn sscc_counters. Pack routes through generate_sscc (canonical).

create or replace function public.generate_sscc(p_org_id uuid, p_extension integer default 0)
returns varchar(18)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prefix      text;
  v_last_serial bigint;
  v_serial      bigint;
  v_body        text;
  v_check       integer;
begin
  if p_org_id is null or p_org_id <> app.current_org_id() then
    raise exception 'generate_sscc: cross-org access denied' using errcode = '42501';
  end if;
  if p_extension is null or p_extension < 0 or p_extension > 9 then
    raise exception 'generate_sscc: extension digit must be 0-9';
  end if;

  select trim(gs1_prefix) into v_prefix from public.organizations where id = p_org_id;
  if v_prefix is null or v_prefix = '' then
    raise exception 'V-SHIP-PACK-03 missing GS1 company prefix for org %', p_org_id;
  end if;
  -- P1: exactly 7-digit company prefix (matches shipment_boxes_sscc_mod10_check callers).
  if v_prefix !~ '^[0-9]{7}$' then
    raise exception 'V-SHIP-PACK-03 GS1 company prefix must be exactly 7 digits (got %)', v_prefix;
  end if;

  -- Serial field is 9 digits (ext + prefix + serial = 17). Refuse before increment when the
  -- next value would not fit — otherwise lpad does not truncate and sscc_mod10 raises after burn.
  select c.last_serial into v_last_serial
    from public.sscc_counters c
   where c.org_id = p_org_id;
  if coalesce(v_last_serial, 0) >= 999999999 then
    raise exception 'V-SHIP-PACK-03 SSCC serial capacity exhausted for org %', p_org_id;
  end if;

  v_serial := public.next_sscc_serial(p_org_id);
  v_body := p_extension::text || v_prefix || lpad(v_serial::text, 9, '0');
  if length(v_body) <> 17 then
    raise exception 'V-SHIP-PACK-03 SSCC body length invalid for org %', p_org_id;
  end if;
  v_check := public.sscc_mod10(v_body);
  return (v_body || v_check::text)::varchar(18);
end;
$$;
