/**
 * T-089 — NPD GDPR erasure handler.
 *
 * Registers the `npd` domain handler with the foundation `@monopilot/gdpr`
 * registry (foundation T-113) per `_foundation/contracts/gdpr.md`. The handler
 * delegates to the SECURITY DEFINER SQL function
 * `public.gdpr_redact_user_pii(target_user_id)` (migration 115), which is the
 * single source of truth for WHAT gets pseudonymised and WHAT audit row is
 * written. This module is purely the registry wire-up so the centralized
 * `runErasure(ownerPool, appPool, orgId, subjectId)` dispatcher invokes NPD's
 * erasure inside the shared, org-context-set transaction.
 *
 * Contract notes (see _foundation/contracts/gdpr.md):
 *  - The handler MUST NOT call app.set_org_context, open its own transaction, or
 *    run in parallel — it runs on the dispatcher-provided, already-context-set
 *    `ctx.tx`.
 *  - dryRun is handled by the dispatcher (SAVEPOINT + ROLLBACK); the handler runs
 *    the same SQL either way so dry-run previews real counts without persisting.
 */
import {
  registerErasureHandler,
  type ErasureContext,
  type ErasureHandler,
  type ErasureResult,
  type RegisterErasureHandlerOptions,
} from '@monopilot/gdpr';

export const NPD_ERASURE_DOMAIN = 'npd' as const;

/**
 * The `fa` key in the SQL function's counts jsonb is a presentation mirror of
 * `product` (the table backing the `fa` compatibility view). It must not be
 * counted toward rowsAffected (it would double-count the product rows).
 */
const COUNT_ALIAS_KEYS = new Set<string>(['fa']);

interface RedactCountsRow {
  counts: Record<string, number> | null;
}

/**
 * Foundation ErasureHandler for the NPD domain. Runs `gdpr_redact_user_pii` on
 * the dispatcher-provided transaction and maps its per-table counts onto the
 * registry's ErasureResult shape.
 */
export const runNpdErasure: ErasureHandler = async (
  ctx: ErasureContext,
): Promise<ErasureResult> => {
  const { rows } = await ctx.tx.query<RedactCountsRow>(
    'select public.gdpr_redact_user_pii($1::uuid) as counts',
    [ctx.subjectId],
  );

  const counts = rows[0]?.counts ?? {};

  let rowsAffected = 0;
  const tablesTouched: string[] = [];
  for (const [table, count] of Object.entries(counts)) {
    if (COUNT_ALIAS_KEYS.has(table)) {
      continue;
    }
    const n = Number(count) || 0;
    rowsAffected += n;
    if (n > 0) {
      tablesTouched.push(`public.${table}`);
    }
  }

  return {
    domain: NPD_ERASURE_DOMAIN,
    rowsAffected,
    tablesTouched,
    warnings: [],
  };
};

/**
 * Registers the NPD erasure handler with the foundation registry. Safe to call
 * at module import time (wire-up tasks T-114/T-115) or explicitly from tests.
 * Pass `{ force: true }` to replace an existing registration (test reloads).
 */
export function registerNpdErasure(opts: RegisterErasureHandlerOptions = {}): void {
  registerErasureHandler(NPD_ERASURE_DOMAIN, runNpdErasure, opts);
}
