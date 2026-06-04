/**
 * SET-101 My Profile — canonical settings route.
 *
 * Audit gap fixed: this route was a 10-line redirect stub. It now renders the
 * REAL My Profile screen (T-074) — the same Server Component that backs
 * `/account/profile`, resolving the signed-in user via `withOrgContext` and
 * reading real `public.users` data (RLS-scoped), with the Supabase-Auth
 * password/logout flows and all five UI states. No redirect, no duplicate
 * implementation: the canonical screen is re-exported so both this settings
 * "My account" route and the `/account/profile` path render the same real,
 * prototype-faithful page (no route collision — distinct URLs).
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/settings/account-screens.jsx:3-75
 */
// `dynamic` must be a statically-analyzable literal per route (Next.js route
// segment config cannot be re-exported); the screen itself is re-exported.
export const dynamic = 'force-dynamic';
export { default } from '../../account/profile/page';
