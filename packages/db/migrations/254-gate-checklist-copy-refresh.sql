-- Migration 254: refresh stale gate-checklist copy (advisory items, mig 101 seed).
--
-- Modal-audit findings (2026-06-10): three template texts carry claims the
-- system never enforces or leak internal task IDs to end users:
--   - "Lab trial batches executed (min 3)"      — no min-3 rule exists anywhere
--   - "Cost estimate within ±5% of target"      — costing-v2 has no tolerance gate
--   - "FG candidate created or mapped in system (T-095)" — internal task ID in UI
-- Checklists are advisory (2026-06-06 pivot), so this is copy-only. Updates BOTH
-- the per-org templates (future projects) and the already-copied project items
-- (existing projects' modals). Idempotent: matches the exact old text.
-- NOTE: the seed function from mig 101 still emits the old copy for brand-new
-- orgs — acceptable for now (single-org TEST env); tracked in the backlog.

update "Reference"."GateChecklistTemplates"
   set item_text = 'Lab trial batches executed'
 where item_text = 'Lab trial batches executed (min 3)';

update "Reference"."GateChecklistTemplates"
   set item_text = 'Recipe costing computed'
 where item_text = 'Cost estimate within ±5% of target';

update "Reference"."GateChecklistTemplates"
   set item_text = 'FG candidate created or mapped in system'
 where item_text = 'FG candidate created or mapped in system (T-095)';

update public.gate_checklist_items
   set item_text = 'Lab trial batches executed'
 where item_text = 'Lab trial batches executed (min 3)';

update public.gate_checklist_items
   set item_text = 'Recipe costing computed'
 where item_text = 'Cost estimate within ±5% of target';

update public.gate_checklist_items
   set item_text = 'FG candidate created or mapped in system'
 where item_text = 'FG candidate created or mapped in system (T-095)';
