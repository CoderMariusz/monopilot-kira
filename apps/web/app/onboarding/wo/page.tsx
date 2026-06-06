/**
 * SET-005 First work order — canonical `/onboarding/wo` route.
 *
 * The onboarding flow (product step link + step-mismatch redirect) addresses
 * the first-work-order step at `/onboarding/wo`. The implementation lives in
 * the `../workorder` folder (kept as the canonical RSC island so the
 * architecture / wiring guards continue to assert one `workorder` page). This
 * thin re-export makes the `/onboarding/wo` URL resolve instead of 404ing.
 */
export { default } from '../workorder/page';
