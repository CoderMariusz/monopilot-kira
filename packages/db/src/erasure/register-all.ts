/**
 * T-089 — Canonical production registration entrypoint for every GDPR erasure
 * domain handler owned by @monopilot/db.
 *
 * The foundation `@monopilot/gdpr` dispatcher (`runErasure`) only invokes
 * handlers that are present in its in-process registry. Registration is a side
 * effect that MUST run at production boot — otherwise a domain (e.g. `npd`) is
 * silently skipped and its PII is never erased. The worker/cron entrypoint
 * imports `registerErasureHandlers()` and calls it before scheduling the GDPR
 * erasure cron, so the dispatcher path drives NPD erasure in production exactly
 * as the integration tests prove.
 *
 * Keep this list as the single source of truth: any new db-owned erasure domain
 * registers here, and is therefore wired into production by construction.
 */
import { registerNpdErasure } from './npd.js';

/**
 * Registers all @monopilot/db-owned GDPR erasure domain handlers with the
 * foundation registry. Idempotent: pass `{ force: true }` to replace existing
 * registrations (used by tests that reload modules); the default path is safe
 * to call once at process boot.
 */
export function registerErasureHandlers(opts: { force?: boolean } = {}): void {
  registerNpdErasure(opts);
}
