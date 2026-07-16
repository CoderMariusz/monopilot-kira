-- Migration 504 — C020: deterministic semantic dedup + DB backstop for active NPD catalog fields.
--
-- Application guard (assertNpdFieldCatalogUnique) is race-prone (SELECT then INSERT).
-- This migration (a) deactivates older active semantic duplicates per org, then
-- (b) adds partial unique indexes on normalized code/label for active rows.
-- Normalization matches apps/web/.../npd-field-catalog-uniqueness.ts:
--   trim → lower → strip non [a-z0-9]
-- Wave0 lock: org_id scope; RLS unchanged. Idempotent.

-- ── (a) Resolve active semantic code duplicates (keep earliest created_at, then id) ─
with ranked as (
  select id,
         row_number() over (
           partition by org_id,
                        lower(regexp_replace(trim(code), '[^a-z0-9]+', '', 'g'))
           order by created_at asc, id asc
         ) as rn
    from public.npd_field_catalog
   where active = true
)
update public.npd_field_catalog c
   set active = false,
       help_text = coalesce(c.help_text, '')
         || case
              when coalesce(c.help_text, '') = '' then 'Legacy semantic code duplicate — deactivated (W2 C020).'
              else ' [Legacy semantic code duplicate — deactivated (W2 C020).]'
            end
  from ranked r
 where c.id = r.id
   and r.rn > 1;

-- ── (a) Resolve active semantic label duplicates (keep earliest created_at, then id) ─
with ranked as (
  select id,
         row_number() over (
           partition by org_id,
                        lower(regexp_replace(trim(label), '[^a-z0-9]+', '', 'g'))
           order by created_at asc, id asc
         ) as rn
    from public.npd_field_catalog
   where active = true
)
update public.npd_field_catalog c
   set active = false,
       help_text = coalesce(c.help_text, '')
         || case
              when coalesce(c.help_text, '') = '' then 'Legacy semantic label duplicate — deactivated (W2 C020).'
              else ' [Legacy semantic label duplicate — deactivated (W2 C020).]'
            end
  from ranked r
 where c.id = r.id
   and r.rn > 1;

-- ── (b) Partial unique indexes — active catalog semantic code + label per org ───────
create unique index if not exists npd_field_catalog_active_semantic_code_uidx
  on public.npd_field_catalog (
    org_id,
    lower(regexp_replace(trim(code), '[^a-z0-9]+', '', 'g'))
  )
  where active = true;

create unique index if not exists npd_field_catalog_active_semantic_label_uidx
  on public.npd_field_catalog (
    org_id,
    lower(regexp_replace(trim(label), '[^a-z0-9]+', '', 'g'))
  )
  where active = true;
