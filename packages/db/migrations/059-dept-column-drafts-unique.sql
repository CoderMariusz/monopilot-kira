-- Migration 059: T-085 dept_column_drafts active draft uniqueness
-- Allow many historical/non-draft rows, but only one draft per org/dept/column.

create unique index if not exists dept_column_drafts_active_draft_uq
  on public.dept_column_drafts (org_id, dept_id, column_key)
  where status = 'draft';
