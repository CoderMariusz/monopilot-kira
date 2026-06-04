/**
 * settings/profile — canonical Company profile alias route.
 *
 * Audit gap fixed: this route was a 10-line redirect stub to
 * `/settings/company`. It now renders the REAL Company profile screen — the
 * same Server Component that backs `/settings/company`, reading/writing real
 * org data via the company-profile Server Actions. The settings sub-nav points
 * "Company profile" at `/settings/company`; this legacy `/settings/profile`
 * URL now resolves to the same real page instead of bouncing through a
 * redirect (distinct URL — no route collision).
 */
// `dynamic` must be a statically-analyzable literal per route (Next.js route
// segment config cannot be re-exported); the screen itself is re-exported.
export const dynamic = 'force-dynamic';
export { default } from '../company/page';
