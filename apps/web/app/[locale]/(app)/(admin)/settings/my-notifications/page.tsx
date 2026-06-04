/**
 * My Notifications — canonical settings route.
 *
 * Audit gap fixed: this route was a 10-line redirect stub. It now renders the
 * REAL My Notifications screen (T-075) — the same Server Component that backs
 * `/account/notifications`, reading/writing real `notification_preferences`
 * (migration 049) for the signed-in user via `withOrgContext` + outbox on
 * change, with all five UI states. No redirect, no duplicate implementation:
 * the canonical screen is re-exported so both this settings "My account" route
 * and the `/account/notifications` path render the same real page (distinct
 * URLs — no route collision).
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/settings/account-screens.jsx:77-125
 */
// `dynamic` must be a statically-analyzable literal per route (Next.js route
// segment config cannot be re-exported); the screen itself is re-exported.
export const dynamic = 'force-dynamic';
export { default } from '../../account/notifications/page';
