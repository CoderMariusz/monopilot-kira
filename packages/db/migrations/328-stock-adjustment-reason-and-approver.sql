-- Migration 328: direct stock-adjustment — reason enum CHECK + supervisor approver column.
--
-- Supports the direct stock-adjustment feature (warehouse/_actions/direct-adjust-actions.ts),
-- the non-cycle-count "add/remove stock on an LP" flow. Owner policy: a destructive
-- DECREASE is countersigned by a DISTINCT supervisor (separation of duties) who also
-- holds warehouse.stock.adjust + their PIN; a positive ADD mints a new LP at
-- qa_status='pending'.
--
-- 1. approved_by: first-class, queryable column for the countersigning supervisor
--    (the action currently also mirrors it in stock_moves.ext_jsonb; wiring it into
--    the stock_adjustments INSERT is a small follow-up once the UI captures the
--    supervisor).
-- 2. reason CHECK: constrain stock_adjustments.reason to the 6 direct-adjust reason
--    codes (the zod enum). NOT VALID so it guards new inserts without failing on any
--    legacy cycle-count rows.
-- 3. SoD CHECK: when a supervisor signed off, they must differ from applied_by.
--    NOT VALID for the same legacy-safety reason; new rows (increase => approved_by
--    null; decrease => distinct supervisor) pass.
--
-- Applied live via Supabase MCP 2026-06-24; idempotent (add column if not exists +
-- DO-block constraint guards). Reviewed (kira-codex-review FAIL→rework→pass).
alter table public.stock_adjustments
  add column if not exists approved_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stock_adjustments'::regclass
       and conname = 'stock_adjustments_reason_direct_adjust_check'
  ) then
    alter table public.stock_adjustments
      add constraint stock_adjustments_reason_direct_adjust_check
      check (
        reason is null or reason in (
          'found_stock','spillage_damage','expiry_write_off',
          'data_entry_error','system_sync','other'
        )
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.stock_adjustments'::regclass
       and conname = 'stock_adjustments_approver_distinct_check'
  ) then
    alter table public.stock_adjustments
      add constraint stock_adjustments_approver_distinct_check
      check (approved_by is null or applied_by is null or approved_by <> applied_by) not valid;
  end if;
end $$;
