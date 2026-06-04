-- Migration 168: 02-settings — company profile fields on public.organizations.
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.1 (Company profile / org-screens.jsx:4-100).
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id() — already
--         enforced by the `organizations_org_context` policy (037-settings-core.sql:349-355).
--
-- ROOT CAUSE this closes: the Settings → Company screen edits Legal name, VAT/NIP, REGON,
-- Industry, Country, Street, City, ZIP, Email, Phone, Website — but public.organizations
-- had NO columns for any of them. saveCompanyProfile() therefore only persisted name/
-- timezone/currency and silently dropped the rest; on reload the read filled them from a
-- hard-coded fallback, so the user's edits looked like they never saved. This adds the
-- backing columns so the save action can actually UPDATE them.
--
-- All columns are nullable text (free-form profile data) — additive, no backfill needed.
-- app_user already holds SELECT/INSERT/UPDATE/DELETE on public.organizations
-- (037-settings-core.sql:388), so no new grants are required.

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists vat        text,
  add column if not exists regon      text,
  add column if not exists industry   text,
  add column if not exists street     text,
  add column if not exists city       text,
  add column if not exists zip        text,
  add column if not exists country    text,
  add column if not exists email      text,
  add column if not exists phone      text,
  add column if not exists website    text;

comment on column public.organizations.legal_name is 'Full registered company name (Settings -> Company profile).';
comment on column public.organizations.vat        is 'VAT / NIP tax identification number.';
comment on column public.organizations.regon      is 'REGON registry number (PL).';
comment on column public.organizations.industry   is 'Industry label shown on the company profile.';
comment on column public.organizations.street     is 'Registered address -- street line.';
comment on column public.organizations.city       is 'Registered address -- city.';
comment on column public.organizations.zip        is 'Registered address -- postal/ZIP code.';
comment on column public.organizations.country    is 'Registered address -- country.';
comment on column public.organizations.email      is 'Primary company contact email.';
comment on column public.organizations.phone      is 'Primary company contact phone.';
comment on column public.organizations.website    is 'Company website URL.';
