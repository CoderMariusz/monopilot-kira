# Preview Supabase bootstrap notes

Wave 7/8 Preview recovery exposed two Supabase-specific bootstrap constraints that are easy to misclassify as UI failures.

## Role-bootstrap migrations on hosted Supabase

The role bootstrap migrations `000-app-user-role.sql` and `006-app-role.sql` create/alter database roles used by the RLS app path. On hosted Supabase Preview, the protected roles already existed, but the owner connection was not allowed to `ALTER ROLE` them.

Operational decision for the repaired Preview database:

- Confirm the expected roles existed before continuing.
- Record `000-app-user-role.sql` and `006-app-role.sql` in `schema_migrations` as operationally applied.
- Run the remaining migrations normally.

Do **not** treat this as a general fresh-environment recipe. For a fresh non-Supabase target, run the role-bootstrap migrations normally or provision equivalent roles before marking them applied.

## Onboarding runtime requirements

Onboarding Server Actions require all of the following before Preview can pass browser smoke:

- `DATABASE_URL_OWNER` points at the correct Supabase pooler tenant.
- `DATABASE_URL_APP` uses the app role with the Supabase tenant/project identifier, not a bare role name.
- `public.organizations.onboarding_state` exists.
- `public.warehouses` and `public.locations` exist.
- The test/admin user has a `public.users` row mapped to the org.
- The user's role has `settings.onboarding.complete` in `role_permissions` and `roles.permissions`.
- `public.outbox_events` accepts onboarding event types and grants `app_user` `SELECT`/`INSERT` plus sequence usage.

If SET-001 saves org profile fields but does not advance `onboarding_state.current_step`, check `settings.onboarding.complete`, outbox event CHECK constraints, and `app_user` outbox privileges first.

## Completion and middleware

The Edge middleware reads `onboarding_completed_at` from Supabase JWT metadata. Completing onboarding must therefore both:

1. Commit `organizations.onboarding_completed_at` in Postgres.
2. Refresh Supabase user metadata so the next middleware pass sees `onboarding_completed_at` in the JWT claims.

Without the JWT metadata refresh, settings pages continue redirecting to onboarding even though the database completion timestamp exists.
