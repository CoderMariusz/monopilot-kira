-- 279-npd-storage.sql
-- NPD storage backends: brief "+ Upload" attachments + packaging artwork.
--
-- Creates ONE private Supabase Storage bucket `npd-attachments` shared by both
-- features, with an org-scoped path convention enforced by the Server Actions
-- (service-role uploads) and defended in depth by storage.objects RLS policies:
--
--   <org_id>/briefs/<projectId>/<uuid>-<filename>          (brief attachments)
--   <org_id>/artwork/<projectId>/v<N>-<uuid>-<filename>    (packaging artwork versions)
--
-- ── Org-scoping decision (verified against live khjvkhzwfzuwzrusgobp, 2026-06-11) ──
-- app.current_org_id() is NOT usable in storage.objects policies:
--   * EXECUTE on it is granted ONLY to app_user (002-rls-baseline.sql), not to
--     `authenticated` — the role storage-api/PostgREST requests run as.
--   * Even with a grant it would always return NULL there: it reads
--     app.active_org_contexts keyed by backend_pid + txid, populated only by
--     app.set_org_context() on the app's pg connections (withOrgContext).
--     Supabase-auth requests never pass through that path.
-- The canonical user→org membership is public.users (id = auth.users.id,
-- org_id) — the SAME source withOrgContext resolves orgId from. Policies below
-- scope (storage.foldername(name))[1] to that org_id. A self-row SELECT policy
-- on public.users is added so the membership subquery is resolvable under the
-- `authenticated` role (public.users has FORCE RLS with app_user-only policies;
-- `authenticated` already holds a table-level SELECT grant but had no policy).
--
-- NOTE: the app's primary data path uses the service-role client inside
-- withOrgContext-wrapped Server Actions (mirrors compliance-docs); service_role
-- has BYPASSRLS, so these policies are defense-in-depth for any direct
-- client-side storage access, not the main gate.
--
-- Verified live (read-only): `postgres` (the migration role) can INSERT into
-- storage.buckets and CAN create policies on storage.objects (probed in a
-- rolled-back transaction), so this migration is self-sufficient.

-- ── Bucket ────────────────────────────────────────────────────────────────────
-- MIME allowlist = union of brief attachments (pdf/png/jpg/docx/xlsx) and
-- artwork (pdf/png/jpg). Per-feature narrowing happens in the Server Actions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'npd-attachments',
  'npd-attachments',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- ── Membership lookup enabler: self-row read on public.users ─────────────────
-- Lets the storage policies' subquery resolve the caller's org under the
-- `authenticated` role. Exposes ONLY the caller's own row (id = auth.uid()).
drop policy if exists users_self_read_authenticated on public.users;
create policy users_self_read_authenticated
  on public.users
  for select
  to authenticated
  using (id = auth.uid());

-- ── storage.objects policies (defense-in-depth org scoping) ───────────────────
drop policy if exists npd_attachments_select on storage.objects;
create policy npd_attachments_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'npd-attachments'
    and (storage.foldername(name))[1] =
        (select u.org_id::text from public.users u where u.id = auth.uid())
  );

drop policy if exists npd_attachments_insert on storage.objects;
create policy npd_attachments_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'npd-attachments'
    and (storage.foldername(name))[1] =
        (select u.org_id::text from public.users u where u.id = auth.uid())
  );

drop policy if exists npd_attachments_delete on storage.objects;
create policy npd_attachments_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'npd-attachments'
    and (storage.foldername(name))[1] =
        (select u.org_id::text from public.users u where u.id = auth.uid())
  );
