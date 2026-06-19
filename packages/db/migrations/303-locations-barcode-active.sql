-- Migration 303: persist barcode + is_active on public.locations.
--
-- P0 data-loss fix: the Add/Edit Location dialog accepts `active` and `barcode`
-- and the Zod schema validates them (apps/web/actions/infra/location.ts), but
-- the locations table (mig 042) never had columns for them — the values were
-- silently dropped on every upsert, and scanner barcode lookups against
-- locations could never resolve.
--
-- Adds:
--   * barcode   text     — optional, scanner-printable code for the location.
--   * is_active boolean  — default true; soft enable/disable without deleting.
-- Plus a partial unique index on (org_id, barcode) so a scanned barcode resolves
-- to exactly one location per org (NULL barcodes are exempt and may repeat).
--
-- Wave0: existing RLS table — org scope already enforced via the mig-042
-- locations_org_context_* policies; no new policy or grant is required here.
-- Idempotent: add column if not exists + create index if not exists.

alter table public.locations
  add column if not exists barcode text;

alter table public.locations
  add column if not exists is_active boolean not null default true;

create unique index if not exists locations_org_barcode_uq
  on public.locations (org_id, barcode)
  where barcode is not null;

comment on column public.locations.barcode is
  'Optional scanner-printable barcode (QR / Code128). Unique per org where not null (locations_org_barcode_uq) so a scanned barcode resolves a single location.';
comment on column public.locations.is_active is
  'Soft active flag. Inactive locations stay in the hierarchy but are surfaced distinctly in the UI (mig 303).';
