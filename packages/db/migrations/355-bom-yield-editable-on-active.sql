-- Migration 355 — allow yield_pct edits on approved/active BOM headers.
--
-- Root cause (live test, 2026-06-26): the NPD handoff "actual yield %" prompt edits the freshly-promoted
-- production BOM, which `promoteToProduction` creates with status='active' (approved). The guard
-- bom_headers_reject_approved_content_update() listed yield_pct among the immutable approved-content fields,
-- so the yield UPDATE raised "approved or active BOM versions are immutable" -> updateBomYield returned
-- persistence_failed -> the UI showed a misleading "Enter a value between 0.001 and 100". (96 is a valid value;
-- grant + CHECK + zod all pass — the trigger was the blocker.)
--
-- yield_pct is a planning/operational factor, NOT recipe/formulation content; editing it does not alter the BOM
-- lines or the regulatory recipe integrity, and updateBomYield already RBAC-gates (npd.handoff.promote) and writes
-- an append-only audit_events row. So carve yield_pct OUT of the immutability guard; every other approved-content
-- field stays immutable (clone-on-write preserved).
--
-- Rollback: restore the `or new.yield_pct is distinct from old.yield_pct` line in the function body.

create or replace function public.bom_headers_reject_approved_content_update()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('technical_approved', 'active')
     and (
       new.org_id is distinct from old.org_id
       or new.product_id is distinct from old.product_id
       or new.npd_project_id is distinct from old.npd_project_id
       or new.fa_code is distinct from old.fa_code
       or new.origin_module is distinct from old.origin_module
       or new.version is distinct from old.version
       or new.supersedes_bom_header_id is distinct from old.supersedes_bom_header_id
       -- yield_pct intentionally NOT guarded (mig 355): operational planning factor, editable post-activation,
       -- audited + RBAC-gated at the updateBomYield action layer.
       or new.effective_from is distinct from old.effective_from
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.technical_review_requested_by is distinct from old.technical_review_requested_by
       or new.technical_review_requested_at is distinct from old.technical_review_requested_at
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at
       or new.created_by_user is distinct from old.created_by_user
       or new.created_by_device is distinct from old.created_by_device
       or new.app_version is distinct from old.app_version
       or new.schema_version is distinct from old.schema_version
     ) then
    raise exception 'approved or active BOM versions are immutable; create a superseding bom_headers version instead';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;
