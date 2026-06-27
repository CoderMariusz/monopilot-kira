-- Migration 360: RBAC finance + shipping personas (the deferred Q5/R6 split).
-- Spec: _meta/plans/2026-06-26-rbac-write-matrix-proposal.md §5 (finance + shipping rows) +
--   §4 R6 (finance edit ≠ approve) + §4 broad-grant compliance breakers (ship.bol.sign,
--   fin.standard_cost.approve = BRCGS / 21 CFR Part 11 e-sign — approver persona only).
-- PRD: 10-FINANCE §3/§5/§7 (standard cost / valuation / variance / D365), 11-SHIPPING §3/§6/
--   §9.2/§10.2/§13.1/§14.4 (SO / hold / allocation / pick / pack / ship / BOL / RMA / DLQ).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- WHY THIS EXISTS: mig 356 created the 11 MES operational personas + their P1/P2 writes but
-- DEFERRED the finance + shipping families per owner decision (matrix §8 open-Q5: "Finance +
-- shipping personas — Phase 1 or Phase 2? … recommend Phase 2"). Owner has now signed that
-- split, so this migration adds the four deferred personas with the SAME structure as mig 356
-- (seed_* function + the shared public._grant_persona_perms helper + org-insert trigger +
-- existing-org backfill + dual store: role_permissions AND roles.permissions jsonb).
-- Finance and shipping write/approve perms had ZERO non-admin grants before this (matrix §3:
-- fin 7-of-7 + ship 13-of-13 admin-only), so every finance/shipping action required an admin
-- super-user. This unblocks it without collapsing any SoD red-line.
--
-- THE 4 PERSONAS (display_order 310-340; Tier-A "see the business" reads derived from the org
-- admin exactly like mig 356):
--   finance_clerk        (Finance Clerk)        310 — P1 finance EXECUTE writes (record/edit side).
--   finance_manager      (Finance Manager)      320 — P2 finance APPROVE / SIGN / period-close.
--   shipping_coordinator (Shipping Coordinator) 330 — P1 shipping EXECUTE (SO draft / pick / pack
--                                                      / ship-confirm / RMA disposition).
--   shipping_manager     (Shipping Manager)     340 — P2 shipping APPROVE / SIGN / override.
--
-- SoD RED-LINES honoured (matrix §4), execute/first ≠ approve/second on different personas:
--   R6 Finance (the headline split): finance_clerk holds fin.standard_cost.EDIT (author) +
--      fin.settings.edit + fin.costs.manage; finance_manager holds fin.standard_cost.APPROVE
--      (21 CFR Part 11 SHA-256 e-sign) + fin.valuation.close + fin.variance.finalize +
--      fin.d365_dlq.replay (period-freeze / DLQ). EDIT and APPROVE are on DISTINCT personas —
--      never both on one. (matrix §4 R6: "fin.standard_cost.edit (author) ≠
--      fin.standard_cost.approve (e-sign)".)
--   Shipping SoD: the pack/pick COORDINATOR (ship.pick.execute / ship.pack.close /
--      ship.so.create / ship.ship.confirm / ship.rma.disposition) is NOT the BOL-SIGN /
--      SO-confirm / SO-cancel / hold / allocation-override MANAGER. ship.bol.sign (BRCGS 7y
--      e-sign), ship.so.confirm, ship.so.cancel, ship.hold.*, ship.alloc.override,
--      ship.allergen.override, ship.dlq.replay live ONLY on shipping_manager. pack ≠ sign.
--
-- NEVER granted to the execute persona (BRCGS / 21 CFR Part 11 e-sign controls, matrix §4
-- "broad-grant compliance breakers"): fin.standard_cost.approve, ship.bol.sign — approver
-- persona only.
--
-- DUAL STORE (the admin-superuser invariant; mig 356:28-31 / mig 341:74-80): every grant is
-- written to BOTH public.role_permissions (normalized) AND public.roles.permissions (legacy
-- jsonb cache), kept byte-identical. The shared public._grant_persona_perms helper (created in
-- mig 356) only touches role_permissions; the parent fn re-derives the jsonb cache once at the
-- end. An AFTER INSERT trigger + existing-org backfill make new orgs inherit it.
--
-- Idempotent + additive only (on conflict do nothing / insert-where-not-exists). NEVER drops an
-- existing grant or role. Every granted perm string byte-matches
-- packages/rbac/src/permissions.enum.ts (verified at authoring time, lines 314-348 fin / 421-447
-- ship). Matrix strings that DO NOT exist in the enum were dropped (see migration return notes):
-- ship.so.release (no such perm — the ship-confirm execute is ship.ship.confirm),
-- fin.valuation.close_monthly (real = fin.valuation.close), fin.consumption.value /
-- fin.variance.compute (no such perms — variance approve = fin.variance.finalize).

-- ============================================================================
-- Seed function: create the 4 finance/shipping personas + P0 Tier-A reads +
-- P1 execute writes + P2 approve/sign perms. Reuses public._grant_persona_perms
-- (mig 356) for grants; re-syncs the legacy jsonb cache at the end.
-- ============================================================================
create or replace function public.seed_rbac_fin_ship_personas_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- ----- Persona role catalog. code = name lower-snake. system=false (operational org role),
  -- is_system=true (built-in, not user-authored) — same convention as mig 356's 11 personas.
  -- display_order 310-340 (mig 356 used 200-300; 310-340 is the next free band, verified live).
  v_personas constant text[][] := array[
    array['finance_clerk',        'Finance Clerk',        '310'],
    array['finance_manager',      'Finance Manager',      '320'],
    array['shipping_coordinator', 'Shipping Coordinator', '330'],
    array['shipping_manager',     'Shipping Manager',     '340']
  ];

  -- ----- Phase 1 EXECUTE writes (no approval / no SoD red-line) -----
  -- finance_clerk = record/edit side of cost & valuation (R6 author tier). Holds NO approve/
  -- close/finalize/dlq perm — those are finance_manager's (R6 edit ≠ approve).
  v_finance_clerk_p1 text[] := array[
    'fin.settings.edit','fin.standard_cost.edit','fin.costs.manage'
  ];
  -- shipping_coordinator = the floor execute set: draft SO, pick, pack-close (SSCC finalize),
  -- ship-confirm (atomic outbox enqueue), RMA disposition. Holds NO sign/confirm/override/hold/
  -- dlq perm — those are shipping_manager's (pack ≠ sign).
  v_shipping_coordinator_p1 text[] := array[
    'ship.so.create','ship.pick.execute','ship.pack.close','ship.ship.confirm',
    'ship.rma.disposition'
  ];

  -- ----- Phase 2 APPROVE / SIGN perms (gated; SoD-separated) -----
  -- finance_manager = approve/sign/period-close authority (R6 approver tier). Holds the
  -- standard-cost e-sign + monthly valuation close + variance finalize + D365 DLQ replay.
  -- Does NOT hold fin.standard_cost.edit (kept on finance_clerk so author ≠ approver).
  v_finance_manager_p2 text[] := array[
    'fin.standard_cost.approve','fin.valuation.close','fin.variance.finalize',
    'fin.d365_dlq.replay'
  ];
  -- shipping_manager = approve/sign/override authority. Holds the BOL e-sign (BRCGS 7y) +
  -- SO confirm/cancel + hold place/release + allocation override + allergen override + DLQ
  -- replay. Does NOT hold pick/pack/ship-confirm execute (kept on shipping_coordinator so
  -- packer ≠ BOL-signer).
  v_shipping_manager_p2 text[] := array[
    'ship.so.confirm','ship.so.cancel','ship.hold.place','ship.hold.release',
    'ship.alloc.override','ship.allergen.override','ship.bol.sign','ship.dlq.replay'
  ];

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
  -- Phase 0 — Tier-A "see the business" READ catalogue per persona (mirror mig
  -- 356's Tier-A logic, derived from THIS org's own admin role): every read/view/
  -- dashboard the admin holds, EXCLUDING platform-security settings, + rpt.export.csv +
  -- oee.tv.kiosk_view. All four (clerk + both managers + coordinator) are office/manager
  -- personas, so all four take Tier A (not the shop-floor Tier B).
  -- --------------------------------------------------------------------------
  insert into public.role_permissions (role_id, permission)
  select tgt.id, ap.permission
    from public.roles tgt
    join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
    join public.role_permissions ap on ap.role_id = adm.id
   where tgt.org_id = p_org_id
     and tgt.code in ('finance_clerk','finance_manager','shipping_coordinator','shipping_manager')
     and (ap.permission ~ '\.(read|view)$' or ap.permission like '%.dashboard'
          or ap.permission = 'rpt.export.csv' or ap.permission = 'oee.tv.kiosk_view')
     and ap.permission !~ '^settings\.(security|schema|sso|scim|ip_allowlist|d365)'
     and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

  -- --------------------------------------------------------------------------
  -- Phase 1 — safe EXECUTE writes (no approval / no SoD red-line).
  -- Reuse the shared mig-356 helper (idempotent on conflict do nothing).
  -- --------------------------------------------------------------------------
  perform public._grant_persona_perms(p_org_id, 'finance_clerk',        v_finance_clerk_p1);
  perform public._grant_persona_perms(p_org_id, 'shipping_coordinator', v_shipping_coordinator_p1);

  -- --------------------------------------------------------------------------
  -- Phase 2 — gated APPROVE / SIGN perms (manager personas only; SoD-separated).
  -- --------------------------------------------------------------------------
  perform public._grant_persona_perms(p_org_id, 'finance_manager',  v_finance_manager_p2);
  perform public._grant_persona_perms(p_org_id, 'shipping_manager', v_shipping_manager_p2);

  -- --------------------------------------------------------------------------
  -- Dual-store sync — re-derive the legacy roles.permissions jsonb cache from the
  -- normalized role_permissions for the four personas (the dual-store invariant;
  -- mig 356:289-297 / mig 341:74-80). Byte-identical to the normalized store.
  -- --------------------------------------------------------------------------
  update public.roles r
     set permissions = coalesce(
           (select jsonb_agg(distinct rp.permission order by rp.permission)
              from public.role_permissions rp where rp.role_id = r.id),
           '[]'::jsonb)
   where r.org_id = p_org_id
     and r.code in ('finance_clerk','finance_manager','shipping_coordinator','shipping_manager');
end;
$$;

revoke all on function public.seed_rbac_fin_ship_personas_for_org(uuid) from public;
revoke all on function public.seed_rbac_fin_ship_personas_for_org(uuid) from app_user;

-- ============================================================================
-- Org-insert trigger fn + trigger. zzzz prefix + a name that sorts AFTER
-- trg_zzzz_seed_rbac_persona_writes (mig 356) so it fires after the persona +
-- admin read catalogue exist (the Tier-A reads derive from the admin grants).
-- ============================================================================
create or replace function public.seed_rbac_fin_ship_personas_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_rbac_fin_ship_personas_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_rbac_fin_ship_personas_on_org_insert() from public;
revoke all on function public.seed_rbac_fin_ship_personas_on_org_insert() from app_user;

drop trigger if exists trg_zzzz_seed_rbac_persona_writes_finship on public.organizations;
create trigger trg_zzzz_seed_rbac_persona_writes_finship
  after insert on public.organizations
  for each row
  execute function public.seed_rbac_fin_ship_personas_on_org_insert();

-- ============================================================================
-- Backfill every existing org (incl. the live test org) so already-provisioned
-- tenants get the finance/shipping personas + grants immediately. The GDPR
-- sentinel org has no admin role to derive Tier-A reads from; the persona rows
-- are still created but harmless (empty perms). Idempotent.
-- ============================================================================
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_rbac_fin_ship_personas_for_org(v_org_id);
  end loop;
end
$$;
