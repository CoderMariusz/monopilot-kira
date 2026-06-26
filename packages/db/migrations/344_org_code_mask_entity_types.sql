-- 344: extend org_document_settings into an org code-MASK engine for the NPD /
-- warehouse entity types (FG/WIP/LP/RM/ING/GRN), beside the existing
-- PO/TO/WO/INSP/SO document-number settings. Owner P0-D.
--
-- Tokens (rendered in app code by lib/documents/code-mask.ts):
--   xxxx   = next_seq zero-padded to the count of x's
--   [DATE] = yyyymmdd, [YY] = 2-digit year, [SITE] = site code
--   anything else passes through literally (e.g. "FG", "WIP-", "-").
--
-- Additive + idempotent: adds a nullable code_mask column, widens the doc_type
-- CHECK, teaches the per-org seed function the new mask-based types, and
-- backfills existing orgs (NOT EXISTS guard inside the function). PO/TO/WO/INSP/SO
-- keep code_mask = NULL and continue to use lib/documents/numbering.ts.
alter table public.org_document_settings add column if not exists code_mask text;

alter table public.org_document_settings drop constraint if exists org_document_settings_doc_type_check;
alter table public.org_document_settings add constraint org_document_settings_doc_type_check
  check (doc_type in ('po','to','wo','insp','so','fg','wip','lp','rm','ing','grn'));

create or replace function public.seed_org_document_settings_for_org(p_org_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $function$
begin
  insert into public.org_document_settings
    (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days, code_mask)
  select p_org_id, d.doc_type, d.number_prefix, d.number_date_part, d.number_seq_padding, 30, d.code_mask
  from (values
    ('po','PO','YYYYMM',4, null::text),
    ('to','TO','YYYYMM',4, null),
    ('wo','WO','YYYYMM',4, null),
    ('insp','INSP','none',8, null),
    ('so','SO','YYYYMM',5, null),
    ('fg','FG','none',4, 'FGxxxx'),
    ('wip','WIP','none',4, 'WIP-[DATE]-xxxx'),
    ('lp','LP','none',4, 'LP-[DATE]-xxxx'),
    ('rm','RM','none',4, 'RMxxxx'),
    ('ing','ING','none',4, 'INGxxxx'),
    ('grn','GRN','none',4, 'GRN-[DATE]-xxxx')
  ) as d(doc_type, number_prefix, number_date_part, number_seq_padding, code_mask)
  where not exists (select 1 from public.org_document_settings e where e.org_id=p_org_id and e.doc_type=d.doc_type);
end; $function$;

-- backfill existing orgs (idempotent via the function's NOT EXISTS guard)
select public.seed_org_document_settings_for_org(o.id) from public.organizations o;
