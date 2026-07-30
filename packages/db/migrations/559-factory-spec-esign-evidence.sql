-- Migration 559: bind factory-usable specs to Technical bundle e-signatures.
--
-- Order is intentional:
--   1. permit the canonical unsigned NPD seed state (in_review);
--   2. repair release read models and forged/legacy factory-usable specs;
--   3. install the evidence constraint trigger;
--   4. repair and constrain sign-off types whose actions are single-signature only.

create or replace function public.factory_spec_approval_subject_hash(
  p_factory_spec_id uuid,
  p_bom_header_id uuid,
  p_fg_item_id uuid,
  p_bom_version integer
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, public, pg_temp
as $function$
  select encode(
    sha256(
      convert_to(
        format(
          '{"bomHeaderId":%s,"bomVersion":%s,"factorySpecId":%s,"fgItemId":%s}',
          to_json(p_bom_header_id::text),
          to_json(p_bom_version),
          to_json(p_factory_spec_id::text),
          to_json(p_fg_item_id::text)
        ),
        'UTF8'
      )
    ),
    'hex'
  );
$function$;

create or replace function public.factory_spec_has_approval_evidence(
  p_org_id uuid,
  p_factory_spec_id uuid,
  p_bom_header_id uuid,
  p_fg_item_id uuid,
  p_bom_version integer,
  p_approved_by uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_subject_hash text;
  v_nonce text;
  v_required integer;
  v_signer_count integer;
  v_approved_by_signed boolean;
begin
  if p_org_id is null
     or p_factory_spec_id is null
     or p_bom_header_id is null
     or p_fg_item_id is null
     or p_bom_version is null
     or p_approved_by is null then
    return false;
  end if;

  v_subject_hash := public.factory_spec_approval_subject_hash(
    p_factory_spec_id,
    p_bom_header_id,
    p_fg_item_id,
    p_bom_version
  );
  v_nonce := p_factory_spec_id::text || ':' || p_bom_header_id::text || ':approve';

  select greatest(2, coalesce(max(policy.min_approvers), 2))
    into v_required
    from public.org_authorization_policies policy
   where policy.org_id = p_org_id
     and policy.policy_code = 'technical_product_spec_approval'
     and policy.is_enabled = true;

  select count(distinct signer_user_id)::integer,
         coalesce(bool_or(signer_user_id = p_approved_by), false)
    into v_signer_count, v_approved_by_signed
    from public.e_sign_log
   where org_id = p_org_id
     and intent = 'tech.fa.release'
     and subject_hash = v_subject_hash
     and nonce = v_nonce;

  return v_signer_count >= v_required and v_approved_by_signed;
end;
$function$;

revoke all on function public.factory_spec_approval_subject_hash(uuid, uuid, uuid, integer) from public;
grant execute on function public.factory_spec_approval_subject_hash(uuid, uuid, uuid, integer) to app_user;
revoke all on function public.factory_spec_has_approval_evidence(uuid, uuid, uuid, uuid, integer, uuid) from public;
grant execute on function public.factory_spec_has_approval_evidence(uuid, uuid, uuid, uuid, integer, uuid) to app_user;

-- T-081 canonical state: NPD may seed an unsigned in_review record. A later
-- approved/released state is permitted only because the evidence trigger below
-- proves that Technical's bundle gate ran. Keep the historical constraint name.
alter table public.factory_specs
  drop constraint factory_specs_npd_builder_draft_check;

alter table public.factory_specs
  add constraint factory_specs_npd_builder_draft_check
  check (
    source <> 'npd_builder'
    or status not in ('draft', 'in_review')
    or (
      approved_by is null
      and approved_at is null
      and released_by is null
      and released_at is null
    )
  );

-- Repair the consumer read model first, while the referenced spec still carries
-- its old status. This immediately removes factory availability.
do $block$
declare
  v_release_rows integer;
begin
  update public.factory_release_status release
     set release_status = 'pending_technical_approval',
         factory_available_at = null,
         factory_approved_by = null,
         release_event_id = null,
         release_blockers = '[]'::jsonb,
         updated_at = pg_catalog.now()
   where release.release_status in ('approved_for_factory', 'released_to_factory')
     and exists (
       select 1
         from public.factory_specs spec
        where spec.id = release.active_factory_spec_id
          and spec.org_id = release.org_id
          and spec.status in ('approved_for_factory', 'released_to_factory')
          and not public.factory_spec_has_approval_evidence(
            spec.org_id,
            spec.id,
            spec.bom_header_id,
            spec.fg_item_id,
            spec.bom_version,
            spec.approved_by
          )
     );

  get diagnostics v_release_rows = row_count;
  raise notice '559: factory release rows re-gated = %', v_release_rows;
end
$block$;

-- The clone-on-write trigger correctly rejects ordinary backward transitions.
-- Disable only for this migration's targeted evidence repair and restore it in
-- the same transaction before installing the new gate.
drop trigger factory_specs_enforce_clone_on_write on public.factory_specs;

do $block$
declare
  v_spec_rows integer;
begin
  update public.factory_specs spec
     set status = 'in_review',
         approved_by = null,
         approved_at = null,
         released_by = null,
         released_at = null,
         updated_at = pg_catalog.now()
   where spec.status in ('approved_for_factory', 'released_to_factory')
     and not public.factory_spec_has_approval_evidence(
       spec.org_id,
       spec.id,
       spec.bom_header_id,
       spec.fg_item_id,
       spec.bom_version,
       spec.approved_by
     );

  get diagnostics v_spec_rows = row_count;
  raise notice '559: factory specs returned to Technical review = %', v_spec_rows;
end
$block$;

create trigger factory_specs_enforce_clone_on_write
  before update on public.factory_specs
  for each row execute function public.factory_specs_enforce_clone_on_write();

create or replace function public.factory_specs_require_approval_evidence()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if new.status in ('approved_for_factory', 'released_to_factory')
     and not public.factory_spec_has_approval_evidence(
       new.org_id,
       new.id,
       new.bom_header_id,
       new.fg_item_id,
       new.bom_version,
       new.approved_by
     ) then
    raise exception
      'factory_specs % status % requires Technical bundle e-sign evidence',
      new.id, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.factory_specs_require_approval_evidence() from public;
grant execute on function public.factory_specs_require_approval_evidence() to app_user;

create constraint trigger factory_specs_approved_esign_evidence
  after insert or update on public.factory_specs
  deferrable initially immediate
  for each row execute function public.factory_specs_require_approval_evidence();

-- These actions call signEvent once and expose no second-signer input. Remove
-- historical impossible configurations before making that capability limit durable.
do $block$
declare
  v_policy_rows integer;
begin
  update public.signoff_policies
     set required_signatures = 1,
         second_signer_role_id = null,
         allow_same_user = true,
         updated_at = pg_catalog.now()
   where signoff_type in (
     'qa.hold.release',
     'qa.ncr.close',
     'qa.haccp.ccp.deviation'
   )
     and (
       required_signatures <> 1
       or second_signer_role_id is not null
       or allow_same_user is distinct from true
     );

  get diagnostics v_policy_rows = row_count;
  raise notice '559: unsupported two-signature policies repaired = %', v_policy_rows;
end
$block$;

alter table public.signoff_policies
  add constraint signoff_policies_supported_signature_count_check
  check (
    signoff_type not in (
      'qa.hold.release',
      'qa.ncr.close',
      'qa.haccp.ccp.deviation'
    )
    or (
      required_signatures = 1
      and second_signer_role_id is null
      and allow_same_user = true
    )
  );

-- Executable migration post-checks. They deliberately inspect SQL state only;
-- the application closeout still needs a real DB migration run in a DB-capable lane.
do $block$
declare
  v_invalid_specs integer;
  v_invalid_policies integer;
begin
  select count(*)::integer
    into v_invalid_specs
    from public.factory_specs spec
   where spec.status in ('approved_for_factory', 'released_to_factory')
     and not public.factory_spec_has_approval_evidence(
       spec.org_id,
       spec.id,
       spec.bom_header_id,
       spec.fg_item_id,
       spec.bom_version,
       spec.approved_by
     );

  select count(*)::integer
    into v_invalid_policies
    from public.signoff_policies
   where signoff_type in (
     'qa.hold.release',
     'qa.ncr.close',
     'qa.haccp.ccp.deviation'
   )
     and (
       required_signatures <> 1
       or second_signer_role_id is not null
       or allow_same_user is distinct from true
     );

  if v_invalid_specs > 0 or v_invalid_policies > 0 then
    raise exception
      '559: post-check failed (invalid specs %, invalid policies %)',
      v_invalid_specs, v_invalid_policies
      using errcode = '23514';
  end if;

  raise notice
    '559: post-check passed (invalid specs %, invalid policies %)',
    v_invalid_specs, v_invalid_policies;
end
$block$;
