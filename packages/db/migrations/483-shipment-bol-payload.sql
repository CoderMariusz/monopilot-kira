-- Migration 483 (W17 / N-68): proper BOL payload column on shipments.
--
-- generateBol previously stored serialized JSON in bol_pdf_url, making the BOL
-- reference unrecoverable after reload. bol_pdf_url is reserved for real URLs.

alter table public.shipments
  add column if not exists bol_payload jsonb;

-- Backfill legacy rows that stored JSON in bol_pdf_url (dry-run-safe: only when payload empty).
update public.shipments sh
   set bol_payload = sh.bol_pdf_url::jsonb
 where sh.bol_payload is null
   and sh.bol_pdf_url is not null
   and left(trim(sh.bol_pdf_url), 1) = '{';

update public.shipments sh
   set bol_pdf_url = null
 where sh.bol_payload is not null
   and sh.bol_pdf_url is not null
   and left(trim(sh.bol_pdf_url), 1) = '{';

comment on column public.shipments.bol_payload
  is 'Serialized BOL generation payload (JSON). bol_pdf_url holds a browsable PDF URL when present.';
