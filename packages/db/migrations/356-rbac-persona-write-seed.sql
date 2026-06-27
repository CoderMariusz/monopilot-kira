-- Migration 356: RBAC persona + phased WRITE/APPROVE permission seed.
-- Spec: _meta/plans/2026-06-26-rbac-write-matrix-proposal.md (owner-approved 11-persona
--   write matrix + SoD red-lines R1-R8 + phased seed P0/P1/P2).
-- PRD: 08-PRODUCTION §3.1-3.2, 09-QUALITY §2.3/§6.3/§8, 03-TECHNICAL §3, 05-WAREHOUSE
--   §6/§8/§9, 07-PLANNING-EXT §9, 13-MAINTENANCE §4, 10-FINANCE §3/§5/§7, 11-SHIPPING §3/§6.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- WHY THIS EXISTS (the "only admin can transact" live-bug, root-caused in the matrix
-- proposal §1/§3): the system has only 6 canonical org roles
-- (admin/npd_manager/core_user/dept_manager/dept_user/viewer) plus the admin family.
-- Every per-module write seed (185-production / 192-warehouse / 198-quality / 199-finance /
-- 202-maintenance / 205-scheduler / 212-shipping) granted its write subset to DEFENSIVE
-- role-code arrays such as array['operator','production_operator','line_operator'] /
-- array['quality_lead','qa_lead','hygiene_lead'] — but NONE of those role codes exist as
-- rows. So every non-NPD write seed is a NO-OP; only `admin` (matched by the same arrays)
-- actually received any operational write/approve permission. Mig 341 gave the 6 canonical
-- roles READS only and deliberately deferred WRITES to this owner-signed matrix.
--
-- THIS MIGRATION:
--   (P0) creates the 11 MES persona roles per org (idempotent) and grants each the READ
--        catalogue via the same mig-341 tier logic (derived from the org's own admin role).
--   (P1) grants the safe per-module EXECUTE writes (no approvals / no SoD red-line) to the
--        operational personas.
--   (P2) grants the gated APPROVE / SIGN permissions to the manager / lead personas only,
--        keeping every SoD pair (R1-R8) on DISTINCT personas.
-- Finance and shipping permission families deferred per owner decision — not in scope of this migration
--
-- DUAL STORE (the admin-superuser invariant; mig 341:74-80 / mig 236): every grant is
-- written to BOTH public.role_permissions (normalized) AND public.roles.permissions
-- (legacy jsonb cache), kept byte-identical. An AFTER INSERT trigger + existing-org
-- backfill make new orgs inherit it.
--
-- SoD RED-LINES honoured (matrix §4), execute/first ≠ approve/second on different personas:
--   R1 NCR critical close (dual-sign): quality_lead = close_critical (signer A);
--      prod_manager = co-sign (signer B). Never both on one persona.
--   R2 Allergen changeover gate (dual-sign): first = shift_lead/hygiene_lead;
--      second = quality_lead. The two sign perms are NOT both placed on one single persona
--      (hygiene_lead holds only sign_first here; runtime allow_same_user=false is the gate).
--   R3 Spec/BOM approval (e-sign): technical_lead authors BOM changes via
--      technical.bom.create; quality_lead approves/publishes so author≠approver is
--      separated by persona before the runtime different-user signoff policy.
--   R4 LOTO (dual e-sign): maintenance_tech = loto.apply (actor 1);
--      maintenance_lead (= prod_manager here, Q3 default) = loto.clear (actor 2). Separable.
--   R5 Scheduler: planner holds dispatch+matrix.edit (draft) and assignment approval
--      controls; prod_manager publishes matrices so editor≠publisher is separated.
--   R6 Finance: fin.standard_cost.edit (author) and fin.standard_cost.approve (e-sign) are
--      placed on SEPARATE personas — finance_clerk (edit) vs finance_manager (approve/close).
--   R7 Warehouse over-threshold: stock.adjust / fefo.override / lp.force_unlock / transfer.correct
--      go to the warehouse supervisor tier (= prod_manager, Q3 default), NOT warehouse_operator.
--   R8 Production over-X approvals: consumption.override_approve / waste.overthreshold_approve /
--      output.catch_weight_override / wo.close / wo.cancel / corrections.closed_wo / d365_dlq.replay
--      to shift_lead (line overrides) + prod_manager (close/cancel/dlq), NOT line_operator.
--
-- NEVER granted to a wide/low role (BRCGS / 21 CFR Part 11 e-sign controls): only the dedicated
-- approver persona receives quality.ncr.close_critical, production.allergen_gate.sign_second,
-- fin.standard_cost.approve, mnt.loto.clear, technical.bom.approve, ship.bol.sign,
-- quality.batch.release.
--
-- Idempotent + additive only (insert-where-not-exists). NEVER drops an existing grant or role.
-- Page-CHECK perm strings byte-match the GRANT strings (verified against
-- packages/rbac/src/permissions.enum.ts at authoring time).

-- ============================================================================
-- Seed function: create personas + grant P0 reads + P1 writes + P2 approvals.
-- ============================================================================
create or replace function public.seed_rbac_persona_writes_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- ----- Persona role catalog (Phase 0). code = name lower-snake; matches the PRD persona
  -- codes the module seeds (185/198/202/...) already SPELL in their defensive arrays, so
  -- adopting these makes those seeds finally take effect. system=false / is_system=true
  -- (operational org roles, same convention as mig 080's 6 canonical roles).
  v_personas constant text[][] := array[
    array['technical_lead',     'Technical Lead',      '200'],
    array['quality_lead',       'Quality Lead',        '210'],
    array['qa_inspector',       'QA Inspector',        '220'],
    array['hygiene_lead',       'Hygiene Lead',        '230'],
    array['prod_manager',       'Production Manager',  '240'],
    array['shift_lead',         'Shift Lead',          '250'],
    array['line_operator',      'Line Operator',       '260'],
    array['warehouse_operator', 'Warehouse Operator',  '270'],
    array['planner',            'Planner',             '280'],
    array['buyer',              'Buyer',               '290'],
    array['maintenance_tech',   'Maintenance Technician', '300']
  ];

  -- ----- Phase 1 EXECUTE writes (no approval, no SoD red-line) -----
  v_technical_lead_p1 text[] := array[
    'technical.items.create','technical.items.edit','technical.items.deactivate',
    'technical.bom.create','technical.bom.generate_batch',
    'technical.allergens.edit','technical.cost.edit',
    'technical.eco.write','technical.sensory.read','technical.d365.sync_trigger'
  ];
  v_quality_lead_p1 text[] := array[
    'quality.hold.create','quality.inspection.assign','quality.inspection.execute',
    'quality.ncr.create','quality.haccp.plan_edit','quality.ccp.deviation_override',
    'quality.coldchain.record','quality.coldchain.manage',
    'quality.settings.edit','quality.audit.export'
  ];
  v_qa_inspector_p1 text[] := array[
    'quality.inspection.execute','quality.hold.create','quality.ncr.create',
    'quality.coldchain.record'
  ];
  v_hygiene_lead_p1 text[] := array[
    'quality.hold.create','quality.coldchain.record','quality.ccp.deviation_override'
  ];
  v_prod_manager_p1 text[] := array[
    'production.downtime.taxonomy_edit','production.changeover.write'
  ];
  v_shift_lead_p1 text[] := array[
    'production.wo.start','production.wo.pause','production.wo.resume','production.wo.complete',
    'production.consumption.write','production.output.write','production.waste.write',
    'production.downtime.write','production.changeover.write',
    'production.consumption.correct','production.output.correct','production.waste.correct'
  ];
  v_line_operator_p1 text[] := array[
    'production.wo.start','production.wo.pause','production.wo.resume','production.wo.complete',
    'production.consumption.write','production.output.write','production.waste.write',
    'production.downtime.write','warehouse.lp.consume'
  ];
  v_warehouse_operator_p1 text[] := array[
    'warehouse.lp.create','warehouse.lp.split','warehouse.lp.merge','warehouse.lp.reserve',
    'warehouse.lp.consume','warehouse.lp.block','warehouse.lp.ship',
    'warehouse.grn.receive','warehouse.stock.move',
    'warehouse.spare_parts.adjust','warehouse.receipt.correct'
  ];
  v_planner_p1 text[] := array[
    'planning.mrp.run','planning.mrp.convert','planning.forecast.manage',
    'scheduler.run.dispatch','scheduler.matrix.edit','scheduler.config.edit',
    'scheduler.forecast.write'
  ];
  v_maintenance_tech_p1 text[] := array[
    'mnt.asset.edit','mnt.mwo.request','mnt.mwo.assign','mnt.mwo.execute',
    'mnt.pm.create','mnt.pm.skip','mnt.calib.record','mnt.calib.upload_cert',
    'mnt.spare.consume','mnt.spare.adjust','mnt.spare.reorder','mnt.loto.apply'
  ];

  -- ----- Phase 2 APPROVE / SIGN perms (gated; SoD-separated) -----
  -- npd_manager (existing role) gate/approve already held via mig 341 full-npd grant;
  -- explicitly (re)asserted here so the released-product-edit REQUEST side sits with NPD.
  v_npd_manager_p2 text[] := array[
    'npd.gate.advance','npd.gate.approve','npd.released_product_edit.request'
  ];
  -- technical_lead = ECO/spec approver + released-product-edit AUTHORIZE side.
  -- (SoD R3: author technical.bom.create lives in P1; BOM approve/publish are on
  -- quality_lead so author≠approver across personas; NPD request side remains separate).
  v_technical_lead_p2 text[] := array[
    'technical.eco.approve','technical.product_spec.approve',
    'technical.factory_spec.recall','npd.released_product_edit.authorize'
  ];
  -- quality_lead = release/approve authority + BOM approver/publisher + NCR critical
  -- close signer A + allergen second-signer (R1 signer A, R2 second). Does NOT hold sign_first.
  v_quality_lead_p2 text[] := array[
    'quality.hold.release','quality.spec.approve','quality.batch.release',
    'technical.bom.approve','technical.bom.version_publish',
    'quality.ncr.close_critical','production.allergen_gate.sign_second'
  ];
  -- hygiene_lead = allergen FIRST signer only (R2 first). Never holds sign_second.
  v_hygiene_lead_p2 text[] := array[
    'production.allergen_gate.sign_first'
  ];
  -- shift_lead = line over-X approvals + allergen FIRST signer (R8 line overrides; R2 first).
  -- Never holds sign_second / wo.close / wo.cancel.
  v_shift_lead_p2 text[] := array[
    'production.consumption.override_approve','production.waste.overthreshold_approve',
    'production.output.catch_weight_override','production.allergen_gate.sign_first'
  ];
  -- prod_manager = production supervisor approvals (R8 close/cancel/dlq) + scheduler
  -- matrix publisher (R5) + NCR critical
  -- co-signer B (R1) + quality.hold.release (co-authority) + warehouse supervisor elevations
  -- (R7) + maintenance lead approvals incl. loto.clear actor 2 (R4) — per Q3 default (fold
  -- warehouse-supervisor + maintenance-lead into prod_manager). Holds NEITHER allergen sign
  -- perm (kept on shift_lead/hygiene_lead + quality_lead) to preserve the changeover SoD.
  v_prod_manager_p2 text[] := array[
    'production.wo.close','production.wo.cancel',
    'production.consumption.override_approve','production.waste.overthreshold_approve',
    'production.output.catch_weight_override','production.corrections.closed_wo',
    'production.d365_dlq.replay',
    'quality.ncr.close_critical','quality.hold.release',
    'warehouse.stock.adjust','warehouse.fefo.override','warehouse.lp.force_unlock',
    'warehouse.transfer.correct',
    'mnt.mwo.approve','mnt.mwo.sign','mnt.loto.clear','scheduler.matrix.publish'
  ];
  -- maintenance_tech P2 = only the request-side cancel (matrix: maintenance_tech "mnt.mwo.cancel").
  -- approve/sign/loto.clear stay on prod_manager (R4).
  v_maintenance_tech_p2 text[] := array[
    'mnt.mwo.cancel'
  ];
  -- planner = scheduler approve/override/reject/bulk + matrix edit in P1.
  -- scheduler.matrix.publish stays on prod_manager (R5 editor≠publisher).
  v_planner_p2 text[] := array[
    'scheduler.assignment.approve','scheduler.assignment.override','scheduler.assignment.reject',
    'scheduler.assignment.bulk_approve'
  ];

  v_role_id uuid;
  i int;
begin
  -- --------------------------------------------------------------------------
  -- Phase 0 — create the persona roles (idempotent on (org_id, code)).
  -- --------------------------------------------------------------------------
  for i in 1 .. array_length(v_personas, 1) loop
    insert into public.roles (org_id, slug, system, code, name, permissions, is_system, display_order)
    values (
      p_org_id,
      v_personas[i][1],          -- slug = code
      false,                     -- system (platform-infra) = false; operational org role
      v_personas[i][1],          -- code
      v_personas[i][2],          -- display name
      '[]'::jsonb,
      true,                      -- is_system (built-in, not user-authored)
      v_personas[i][3]::int      -- display_order
    )
    on conflict (org_id, code) do nothing;
  end loop;

  -- --------------------------------------------------------------------------
  -- Phase 0 — READ catalogue per persona (mirror mig-341 tier logic, derived
  -- from THIS org's own admin role). Two tiers:
  --   Tier A "see the business" (lead/manager personas) — every read/view/dashboard
  --     the admin holds, EXCLUDING platform-security settings, + rpt.export.csv +
  --     oee.tv.kiosk_view.
  --   Tier B "see the floor" (operator/inspector personas) — read/view/dashboard scoped
  --     to shop-floor modules only.
  -- --------------------------------------------------------------------------
  -- Tier A reads.
  insert into public.role_permissions (role_id, permission)
  select tgt.id, ap.permission
    from public.roles tgt
    join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
    join public.role_permissions ap on ap.role_id = adm.id
   where tgt.org_id = p_org_id
     and tgt.code in ('technical_lead','quality_lead','hygiene_lead','prod_manager',
                      'shift_lead','planner','buyer','maintenance_tech')
     and (ap.permission ~ '\.(read|view)$' or ap.permission like '%.dashboard'
          or ap.permission = 'rpt.export.csv' or ap.permission = 'oee.tv.kiosk_view')
     and ap.permission !~ '^settings\.(security|schema|sso|scim|ip_allowlist|d365)'
     and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

  -- Tier B reads (shop-floor modules only).
  insert into public.role_permissions (role_id, permission)
  select tgt.id, ap.permission
    from public.roles tgt
    join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
    join public.role_permissions ap on ap.role_id = adm.id
   where tgt.org_id = p_org_id
     and tgt.code in ('qa_inspector','line_operator','warehouse_operator')
     and (ap.permission ~ '\.(read|view)$' or ap.permission like '%.dashboard' or ap.permission = 'oee.tv.kiosk_view')
     and split_part(ap.permission, '.', 1) in
         ('production','warehouse','quality','technical','oee','scheduler','ship','mnt','planning','npd')
     and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

  -- --------------------------------------------------------------------------
  -- Phase 1 — safe EXECUTE writes (no approval / no SoD red-line).
  -- One additive cross-join-unnest insert per persona, on conflict do nothing.
  -- --------------------------------------------------------------------------
  perform public._grant_persona_perms(p_org_id, 'technical_lead',     v_technical_lead_p1);
  perform public._grant_persona_perms(p_org_id, 'quality_lead',       v_quality_lead_p1);
  perform public._grant_persona_perms(p_org_id, 'qa_inspector',       v_qa_inspector_p1);
  perform public._grant_persona_perms(p_org_id, 'hygiene_lead',       v_hygiene_lead_p1);
  perform public._grant_persona_perms(p_org_id, 'prod_manager',       v_prod_manager_p1);
  perform public._grant_persona_perms(p_org_id, 'shift_lead',         v_shift_lead_p1);
  perform public._grant_persona_perms(p_org_id, 'line_operator',      v_line_operator_p1);
  perform public._grant_persona_perms(p_org_id, 'warehouse_operator', v_warehouse_operator_p1);
  perform public._grant_persona_perms(p_org_id, 'planner',            v_planner_p1);
  perform public._grant_persona_perms(p_org_id, 'maintenance_tech',   v_maintenance_tech_p1);

  -- --------------------------------------------------------------------------
  -- Phase 2 — gated APPROVE / SIGN perms (manager/lead personas; SoD-separated).
  -- --------------------------------------------------------------------------
  perform public._grant_persona_perms(p_org_id, 'npd_manager',      v_npd_manager_p2);
  perform public._grant_persona_perms(p_org_id, 'technical_lead',   v_technical_lead_p2);
  perform public._grant_persona_perms(p_org_id, 'quality_lead',     v_quality_lead_p2);
  perform public._grant_persona_perms(p_org_id, 'hygiene_lead',     v_hygiene_lead_p2);
  perform public._grant_persona_perms(p_org_id, 'shift_lead',       v_shift_lead_p2);
  perform public._grant_persona_perms(p_org_id, 'prod_manager',     v_prod_manager_p2);
  perform public._grant_persona_perms(p_org_id, 'maintenance_tech', v_maintenance_tech_p2);
  perform public._grant_persona_perms(p_org_id, 'planner',          v_planner_p2);

  -- --------------------------------------------------------------------------
  -- Dual-store sync — re-derive the legacy roles.permissions jsonb cache from the
  -- normalized role_permissions for every persona + npd_manager (the dual-store
  -- invariant; mig 341:74-80). Byte-identical to the normalized store.
  -- --------------------------------------------------------------------------
  update public.roles r
     set permissions = coalesce(
           (select jsonb_agg(distinct rp.permission order by rp.permission)
              from public.role_permissions rp where rp.role_id = r.id),
           '[]'::jsonb)
   where r.org_id = p_org_id
     and r.code in ('technical_lead','quality_lead','qa_inspector','hygiene_lead',
                    'prod_manager','shift_lead','line_operator','warehouse_operator',
                    'planner','buyer','maintenance_tech','npd_manager');
end;
$$;

revoke all on function public.seed_rbac_persona_writes_for_org(uuid) from public;
revoke all on function public.seed_rbac_persona_writes_for_org(uuid) from app_user;

-- ----------------------------------------------------------------------------
-- Helper: grant a perm array to one persona role in the normalized store (idempotent).
-- jsonb cache is re-synced once at the end of the parent fn, so this only touches
-- role_permissions. SECURITY DEFINER so the seed runs above RLS.
-- ----------------------------------------------------------------------------
create or replace function public._grant_persona_perms(p_org_id uuid, p_code text, p_perms text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
    from public.roles r
    cross join unnest(p_perms) as p(permission)
   where r.org_id = p_org_id
     and r.code = p_code
  on conflict (role_id, permission) do nothing;
end;
$$;

revoke all on function public._grant_persona_perms(uuid, text, text[]) from public;
revoke all on function public._grant_persona_perms(uuid, text, text[]) from app_user;

-- ============================================================================
-- Org-insert trigger fn + trigger. zzzz prefix so it fires AFTER the role-creating
-- triggers (seed_system_roles_on_org_insert / trg_seed_npd_role_permissions) and after
-- the per-module permission seeds — the persona rows must exist and the admin read
-- catalogue (derived from for the Tier-A/B reads) must already be populated.
-- ============================================================================
create or replace function public.seed_rbac_persona_writes_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_rbac_persona_writes_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_rbac_persona_writes_on_org_insert() from public;
revoke all on function public.seed_rbac_persona_writes_on_org_insert() from app_user;

drop trigger if exists trg_zzzz_seed_rbac_persona_writes on public.organizations;
create trigger trg_zzzz_seed_rbac_persona_writes
  after insert on public.organizations
  for each row
  execute function public.seed_rbac_persona_writes_on_org_insert();

-- ============================================================================
-- Backfill every existing org (incl. the live test org Apex 22) so already-provisioned
-- tenants get the personas + grants immediately. Skips the GDPR sentinel org implicitly
-- (it has no admin role to derive reads from; the persona role rows are still created but
-- harmless). Idempotent.
-- ============================================================================
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_rbac_persona_writes_for_org(v_org_id);
  end loop;
end
$$;
