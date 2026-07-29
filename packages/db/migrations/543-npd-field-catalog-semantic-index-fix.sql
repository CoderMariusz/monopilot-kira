-- Migration 543: fix NPD field-catalog semantic index normalization.
--
-- Migration 504 stripped uppercase letters before lowercasing. Rebuild both
-- active-field indexes with the documented trim → lower → strip order.

do $$
declare
  v_code_conflicts text;
  v_label_conflicts text;
begin
  select string_agg(
           format('org_id=%s normalized=%L rows=[%s]', org_id, normalized_value, conflicting_rows),
           E'\n'
           order by org_id, normalized_value
         )
    into v_code_conflicts
    from (
      select org_id,
             regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g') as normalized_value,
             string_agg(format('id=%s code=%L', id, code), ', ' order by created_at, id) as conflicting_rows
        from public.npd_field_catalog
       where active = true
       group by org_id, regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
      having count(*) > 1
    ) collisions;

  select string_agg(
           format('org_id=%s normalized=%L rows=[%s]', org_id, normalized_value, conflicting_rows),
           E'\n'
           order by org_id, normalized_value
         )
    into v_label_conflicts
    from (
      select org_id,
             regexp_replace(lower(trim(label)), '[^a-z0-9]+', '', 'g') as normalized_value,
             string_agg(format('id=%s label=%L', id, label), ', ' order by created_at, id) as conflicting_rows
        from public.npd_field_catalog
       where active = true
       group by org_id, regexp_replace(lower(trim(label)), '[^a-z0-9]+', '', 'g')
      having count(*) > 1
    ) collisions;

  if v_code_conflicts is not null or v_label_conflicts is not null then
    raise exception using
      errcode = '23505',
      message = 'migration 543 cannot rebuild NPD field-catalog semantic indexes: corrected normalization has active-row collisions',
      detail = concat_ws(
        E'\n',
        case when v_code_conflicts is not null then 'CODE COLLISIONS:' || E'\n' || v_code_conflicts end,
        case when v_label_conflicts is not null then 'LABEL COLLISIONS:' || E'\n' || v_label_conflicts end
      ),
      hint = 'Resolve or deactivate the listed rows, then rerun migration 543; no collision was changed automatically.';
  end if;
end
$$;

drop index if exists public.npd_field_catalog_active_semantic_code_uidx;
create unique index npd_field_catalog_active_semantic_code_uidx
  on public.npd_field_catalog (
    org_id,
    regexp_replace(lower(trim(code)), '[^a-z0-9]+', '', 'g')
  )
  where active = true;

drop index if exists public.npd_field_catalog_active_semantic_label_uidx;
create unique index npd_field_catalog_active_semantic_label_uidx
  on public.npd_field_catalog (
    org_id,
    regexp_replace(lower(trim(label)), '[^a-z0-9]+', '', 'g')
  )
  where active = true;

-- Behavioral post-check: each pair collided under migration 504 but is distinct
-- under the corrected expression. Delete both rows before leaving the block.
do $$
declare
  v_org_id uuid;
  v_id_a uuid := gen_random_uuid();
  v_id_b uuid := gen_random_uuid();
  v_suffix text;
  v_code_a text;
  v_code_b text;
  v_label_a text;
  v_label_b text;
  v_row_count integer;
begin
  select id
    into v_org_id
    from public.organizations
   order by id
   limit 1;

  if v_org_id is null then
    raise exception 'migration 543 post-check requires at least one organization';
  end if;

  v_suffix := 'MIG543_' || upper(replace(v_org_id::text, '-', ''));
  v_code_a := 'AB_' || v_suffix;
  v_code_b := 'CD_' || v_suffix;
  v_label_a := 'EF ' || v_suffix;
  v_label_b := 'GH ' || v_suffix;

  if lower(regexp_replace(trim(v_code_a), '[^a-z0-9]+', '', 'g'))
       is distinct from lower(regexp_replace(trim(v_code_b), '[^a-z0-9]+', '', 'g'))
     or regexp_replace(lower(trim(v_code_a)), '[^a-z0-9]+', '', 'g')
       is not distinct from regexp_replace(lower(trim(v_code_b)), '[^a-z0-9]+', '', 'g')
     or lower(regexp_replace(trim(v_label_a), '[^a-z0-9]+', '', 'g'))
       is distinct from lower(regexp_replace(trim(v_label_b), '[^a-z0-9]+', '', 'g'))
     or regexp_replace(lower(trim(v_label_a)), '[^a-z0-9]+', '', 'g')
       is not distinct from regexp_replace(lower(trim(v_label_b)), '[^a-z0-9]+', '', 'g') then
    raise exception 'migration 543 post-check fixture does not distinguish broken and corrected normalization';
  end if;

  insert into public.npd_field_catalog (id, org_id, code, label, data_type, active)
  values
    (v_id_a, v_org_id, v_code_a, v_label_a, 'text', true),
    (v_id_b, v_org_id, v_code_b, v_label_b, 'text', true);

  get diagnostics v_row_count = row_count;
  if v_row_count <> 2 then
    raise exception 'migration 543 post-check inserted % rows instead of 2', v_row_count;
  end if;

  delete from public.npd_field_catalog
   where id in (v_id_a, v_id_b);

  get diagnostics v_row_count = row_count;
  if v_row_count <> 2 then
    raise exception 'migration 543 post-check cleanup deleted % rows instead of 2', v_row_count;
  end if;
end
$$;
