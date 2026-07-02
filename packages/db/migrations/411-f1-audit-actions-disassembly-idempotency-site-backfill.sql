-- 411 — wave F1 companion migration (3 parts, all idempotent, bare statements):
--   A) app.platform_audit action CHECK widened for the super-admin fast-follow
--      (add 'platform.admin.added' + 'platform.admin.revoked'; C1 lane, review R-C1: ready).
--   B) partial unique index enforcing disassembly-output replay idempotency
--      (R-E3 item 3 companion; app code also takes a FOR UPDATE lock on the WO).
--      Live dup-check 2026-07-02: 0 conflicting rows.
--   C) NULL-site backfill for rows created before write-time site stamping
--      (E8 lane draft, R-E8-reviewed: NCR block deduplicated via DISTINCT ON).

-- A) platform_audit CHECK -----------------------------------------------------

alter table app.platform_audit
  drop constraint if exists platform_audit_action_check;

alter table app.platform_audit
  add constraint platform_audit_action_check check (
    action in (
      'platform.act_as.entered',
      'platform.act_as.exited',
      'platform.act_as.ignored_cookie',
      'platform.admin.added',
      'platform.admin.revoked'
    )
  );

-- B) disassembly replay idempotency ------------------------------------------

create unique index if not exists uq_wo_outputs_disassembly_input
  on public.wo_outputs (org_id, wo_id, (ext_jsonb->>'disassembly_input_lp_id'))
  where ext_jsonb->>'disassembly_input_lp_id' is not null;

-- C) NULL-site backfill (idempotent: WHERE site_id IS NULL guards) ------------

-- C1) WO outputs inherit the source work order site.
update public.wo_outputs o
   set site_id = wo.site_id
  from public.work_orders wo
 where o.site_id is null
   and wo.org_id = o.org_id
   and wo.id = o.wo_id
   and wo.site_id is not null;

-- C2) Waste rows inherit the source work order site.
update public.wo_waste_log w
   set site_id = wo.site_id
  from public.work_orders wo
 where w.site_id is null
   and wo.org_id = w.org_id
   and wo.id = w.wo_id
   and wo.site_id is not null;

-- C3) Production-origin LPs inherit their work order site.
update public.license_plates lp
   set site_id = wo.site_id
  from public.work_orders wo
 where lp.site_id is null
   and lp.origin = 'production'
   and lp.wo_id is not null
   and wo.org_id = lp.org_id
   and wo.id = lp.wo_id
   and wo.site_id is not null;

-- C4) Quality inspections inherit site from referenced LP / GRN / WO output.
update public.quality_inspections qi
   set site_id = src.site_id
  from (
    select qi0.id,
           qi0.org_id,
           coalesce(lp.site_id, grn.site_id, woo.site_id, wo.site_id) as site_id
      from public.quality_inspections qi0
      left join public.license_plates lp
        on qi0.reference_type = 'lp'
       and lp.org_id = qi0.org_id
       and lp.id = qi0.reference_id
      left join public.grns grn
        on qi0.reference_type = 'grn'
       and grn.org_id = qi0.org_id
       and grn.id = qi0.reference_id
      left join public.wo_outputs woo
        on qi0.reference_type = 'wo_output'
       and woo.org_id = qi0.org_id
       and woo.id = qi0.reference_id
      left join public.work_orders wo
        on wo.org_id = woo.org_id
       and wo.id = woo.wo_id
     where qi0.site_id is null
  ) src
 where qi.site_id is null
   and qi.org_id = src.org_id
   and qi.id = src.id
   and src.site_id is not null;

-- C5) NCRs inherit site from direct references or the CCP-breach WO.
--     DISTINCT ON collapses potential haccp_monitoring_log fan-out (R-E8 fix #1).
update public.ncr_reports n
   set site_id = src.site_id
  from (
    select distinct on (n0.id)
           n0.id,
           n0.org_id,
           coalesce(lp.site_id, grn.site_id, wo.site_id, qi.site_id, breach_wo.site_id) as site_id
      from public.ncr_reports n0
      left join public.license_plates lp
        on n0.reference_type = 'lp'
       and lp.org_id = n0.org_id
       and lp.id = n0.reference_id
      left join public.grns grn
        on n0.reference_type = 'grn'
       and grn.org_id = n0.org_id
       and grn.id = n0.reference_id
      left join public.work_orders wo
        on n0.reference_type = 'wo'
       and wo.org_id = n0.org_id
       and wo.id = n0.reference_id
      left join public.quality_inspections qi
        on n0.reference_type = 'inspection'
       and qi.org_id = n0.org_id
       and qi.id = n0.reference_id
      left join public.haccp_monitoring_log hml
        on hml.org_id = n0.org_id
       and hml.breach_ncr_id = n0.id
      left join public.work_orders breach_wo
        on breach_wo.org_id = hml.org_id
       and breach_wo.id = hml.wo_id
     where n0.site_id is null
     order by n0.id,
              coalesce(lp.site_id, grn.site_id, wo.site_id, qi.site_id, breach_wo.site_id) nulls last
  ) src
 where n.site_id is null
   and n.org_id = src.org_id
   and n.id = src.id
   and src.site_id is not null;
