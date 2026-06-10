-- Migration 256: link NPD packaging components to item master packaging rows.
--
-- Nullable by design: existing free-text packaging components remain valid and
-- can be linked later. Wave0 lock: org_id/RLS policies are unchanged.

alter table public.packaging_components
  add column if not exists item_id uuid references public.items(id);
