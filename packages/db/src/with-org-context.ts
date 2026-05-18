/**
 * Compatibility probe for app-level org context wiring.
 *
 * The web app owns the real `withOrgContext` implementation because it depends
 * on Next/Supabase request context and two app-specific Postgres pools. Some
 * Vitest suites mock `@monopilot/db/with-org-context` to inject an in-memory
 * org context; this module keeps that subpath resolvable without moving the
 * runtime implementation into the DB package.
 *
 * Production callers should see no exported `withOrgContext` here and fall back
 * to `apps/web/lib/auth/with-org-context`.
 */
export {};
