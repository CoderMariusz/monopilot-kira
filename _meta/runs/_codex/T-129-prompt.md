You are implementing ONE atomic task in the monopilot-kira repo (cwd is the repo root). Wave0 lock: `org_id` (never `tenant_id`), RLS via `app.current_org_id()` (never raw `current_setting`). Connect-as-`app_user` in tests (never superuser — RLS is bypassed for superuser).

## Task
Read the full contract: `_meta/atomic-tasks/00-foundation/tasks/T-129.json` (title T-129 / SEC-RLS). Implement it EXACTLY per its acceptance_criteria + risk_red_lines.

## Pre-verified facts (already confirmed by the orchestrator — trust these)
- **Migration number = `051`** (next free; `050-settings-manage-permissions.sql` is the latest; there is a pre-existing duplicate `049-*` pair — do NOT renumber existing migrations, just use 051).
- **Live Supabase security advisors (project khjvkhzwfzuwzrusgobp, today) confirm the exact scope:**
  - ERROR `rls_disabled_in_public` (RLS OFF on PostgREST-exposed public tables): `tenant_variations`, `consumed_approval_tokens`, `tenant_migrations`, `tenant_migrations_legacy_t038`, `modules`, `allergens`, `line_machines`, `role_categories`, and audit partitions `audit_log_2026_01` … `audit_log_2026_12` (12).
  - INFO `rls_enabled_no_policy`: `tenant_idp_config`, `tenants` (RLS on, no policy — add explicit policy).
  - WARN SECURITY DEFINER executable by anon/authenticated: `audit_events_impersonation_guard`, `audit_log_create_partitions(integer)`, `audit_log_detach_old(integer)`, `prune_audit_events`, `prune_consumed_approval_tokens`, `prune_reference_csv_import_reports`, `seed_reference_data_on_org_insert`, `seed_system_roles_on_org_insert`, `seed_tenant_idp_config`, `touch_updated_at`, `set_user_pins_updated_at` — revoke EXECUTE from `anon, authenticated`.
  - WARN `function_search_path_mutable`: `set_user_pins_updated_at` — set an explicit `search_path`.
- **SAFETY (verified): the app reads `modules`/`allergens`/`line_machines`/`role_categories` via server-side raw SQL on the `app_user`/owner pg pool (e.g. `from public.modules` in `apps/web/app/[locale]/(app)/(admin)/settings/features/page.tsx` and `.../settings/users/page.tsx`), NOT via the anon PostgREST client.** Therefore revoking `anon`/`authenticated` PostgREST SELECT on these is safe — KEEP all `app_user` grants + RLS policies intact. Do NOT break the app_user read/write path (risk_red_line).
- Mirror the existing RLS pattern from prior migrations (org-scoped: `alter table … enable row level security; … force row level security;` + policy `using (org_id = app.current_org_id())` for `app_user`; revoke anon/authenticated). Read `packages/db/migrations/002-*.sql` and `packages/db/migrations/014-*.sql` (or whichever establish the `app.current_org_id()` org-policy pattern) and match their style exactly.

## Deliverables (write these files; do NOT apply the migration — the orchestrator applies it via Supabase MCP and re-runs advisors)
1. `packages/db/migrations/051-rls-public-exposure-remediation.sql` — idempotent (`if exists`/`if not exists`, `drop policy if exists`). Per the scope above: org-scoped tables (tenant_variations, consumed_approval_tokens, tenant_migrations) get RLS+force+org policy and anon/authenticated SELECT revoked; global/reference (modules, allergens, line_machines, role_categories) get RLS enabled + anon revoked (authenticated read only if a policy is genuinely needed, else app_user/service-role only); legacy (tenant_migrations_legacy_t038) + audit partitions get RLS on, no anon/authenticated; tenant_idp_config + tenants get explicit policies; revoke EXECUTE on the listed SECURITY DEFINER functions from anon/authenticated; fix `set_user_pins_updated_at` search_path.
2. Drizzle schema parity: add RLS markers/comments in `packages/db/schema/*.ts` where these tables have schema files (only where they exist).
3. `packages/db/__tests__/rls-public-exposure-remediation.test.ts` — RED-first vitest + testcontainers Postgres 16, connect as `app_user` (never superuser): for each org-scoped table assert cross-org SELECT returns 0 rows (real isolation, non-vacuous); for anon-revoked tables assert the anon/authenticated SELECT grant is gone (query `information_schema.role_table_grants`).
4. Update `_meta/atomic-tasks/00-foundation/manifest.json` + `coverage.md` only if the task contract requires (it lists them in scope_files — keep edits minimal/consistent).

## Output
When done, print: the list of files you created/modified, and the test command to run. Do NOT run `git commit`. Do NOT apply the migration to any database.
