-- mig-337: reversibility/feature enablers + HACCP quality_event grant (owner-approved 2026-06-25)
-- Applied live to project khjvkhzwfzuwzrusgobp on 2026-06-25 and verified (all checks ok).
-- All changes are widenings (safe vs existing data) + a nullable column + a grant + a perm seed.
-- DO NOT EDIT after apply (checksum gate) — superseding changes go in a new migration.

-- 1. lp_state_history: allow 'destroyed' (license_plates.status gained it in mig-294 but the
--    state-history CHECK never did → any destroy-state-history insert 23514s) + 'split'.
alter table public.lp_state_history drop constraint lp_state_history_from_state_check;
alter table public.lp_state_history add constraint lp_state_history_from_state_check
  check (from_state is null or from_state = any (array[
    'received','available','reserved','allocated','consumed','blocked','merged',
    'shipped','returned','quarantine','destroyed','split']));
alter table public.lp_state_history drop constraint lp_state_history_to_state_check;
alter table public.lp_state_history add constraint lp_state_history_to_state_check
  check (to_state = any (array[
    'received','available','reserved','allocated','consumed','blocked','merged',
    'shipped','returned','quarantine','destroyed','split']));

-- 2. stock_moves: allow 'split' + 'merge' ledger moves (LP split/merge, #12).
alter table public.stock_moves drop constraint stock_moves_move_type_check;
alter table public.stock_moves add constraint stock_moves_move_type_check
  check (move_type = any (array[
    'transfer','putaway','issue','receipt','adjustment','return','quarantine',
    'consume_to_wo','split','merge']));

-- 3. transfer_orders: allow 'partially_received' (TO forward partial-receive #14; also fixes the
--    pre-existing reverse-receive.ts latent 23514 that already writes it).
alter table public.transfer_orders drop constraint transfer_orders_status_check;
alter table public.transfer_orders add constraint transfer_orders_status_check
  check (status = any (array['draft','in_transit','partially_received','received','cancelled']));

-- 4. production_lines: per-line default OUTPUT location (#11). Nullable, FK→locations, SET NULL on delete.
alter table public.production_lines
  add column if not exists default_output_location_id uuid references public.locations(id) on delete set null;

-- 5. HACCP blocker: app_user was never granted DML on public.quality_event → HACCP plan detail 500s
--    "permission denied for table quality_event". RLS is enabled+forced with a policy (identical to
--    quality_holds), so DML is tenant-isolated. Match the working tables.
grant select, insert, update, delete on public.quality_event to app_user;

-- 6. Seed warehouse.lp.destroy onto the org super-user 'Admin' + 'Department Manager' roles (#12 destroy
--    RBAC), in BOTH stores (role_permissions has columns (role_id, permission); roles.permissions jsonb).
insert into public.role_permissions (role_id, permission)
select r.id, 'warehouse.lp.destroy'
  from public.roles r
 where r.name in ('Admin','Department Manager')
   and not exists (
     select 1 from public.role_permissions rp
      where rp.role_id = r.id and rp.permission = 'warehouse.lp.destroy');

update public.roles r
   set permissions = (coalesce(r.permissions, '[]'::jsonb) || '["warehouse.lp.destroy"]'::jsonb)
 where r.name in ('Admin','Department Manager')
   and not (coalesce(r.permissions, '[]'::jsonb) ? 'warehouse.lp.destroy');
