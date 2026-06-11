import { randomUUID } from 'node:crypto';

/**
 * Transaction-scoped `app.current_org_id()` registration for scanner routes.
 *
 * WHY THIS EXISTS (wave-8a review fix F1, generalized):
 * `app.current_org_id()` (migration 002) does NOT read any GUC. It resolves the
 * org by joining `app.active_org_contexts` (keyed on backend_pid + the CURRENT
 * txid via `txid_current_if_assigned()`) to `app.session_org_contexts`. The
 * `set_config('app.current_org_id', …, true)` issued by the 3-arg
 * `withScannerOrg` overload is therefore invisible to `app.current_org_id()`
 * (and, being `local=true` in autocommit, expires with its own statement
 * anyway). Any SQL on the scanner's owner-pool client that depends on
 * `app.current_org_id()` — org-guarded functions like
 * `public.next_quality_inspection_number(org)` (migration 272 raises 28000 on a
 * mismatch) or plain `where org_id = app.current_org_id()` filters — sees NULL
 * unless the context is registered for real, INSIDE the transaction that runs
 * the dependent statements.
 *
 * `registerTxnOrgContext` must be called immediately after `begin`:
 *   1. INSERT a fresh session token into `app.session_org_contexts`
 *      (the scanner client is the owner pool, so it may write that table);
 *   2. SELECT `app.set_org_context(token, org)` — stamps
 *      `app.active_org_contexts` with the transaction's txid, which is exactly
 *      the lifetime `app.current_org_id()` checks.
 *
 * Lifecycle: ROLLBACK removes both rows with the transaction. After COMMIT the
 * token row persists, so callers MUST `cleanupTxnOrgContext` once the
 * transaction is finished (safe after rollback too — it is a no-op then). A
 * missed cleanup is reaped by `app.gc_session_org_contexts` (migration 031).
 */
export type TxnOrgContextClient = {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
};

export async function registerTxnOrgContext(client: TxnOrgContextClient, orgId: string): Promise<string> {
  const token = randomUUID();
  await client.query(
    `insert into app.session_org_contexts (session_token, org_id) values ($1::uuid, $2::uuid)`,
    [token, orgId],
  );
  await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [token, orgId]);
  return token;
}

export async function cleanupTxnOrgContext(client: TxnOrgContextClient, token: string | null): Promise<void> {
  if (!token) return;
  try {
    await client.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [token]);
  } catch {
    /* best effort — the janitor (migration 031) reaps leaked rows */
  }
}

/**
 * Read-path wrapper: runs `fn` inside a short transaction with the org context
 * registered, so autocommit SELECTs that filter on `app.current_org_id()`
 * actually resolve the org (in autocommit a read never assigns a txid, so the
 * active_org_contexts join can never match outside a transaction).
 */
export async function withTxnOrgContext<T>(
  client: TxnOrgContextClient,
  orgId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  let token: string | null = null;
  try {
    token = await registerTxnOrgContext(client, orgId);
    const result = await fn();
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* noop */
    }
    throw error;
  } finally {
    await cleanupTxnOrgContext(client, token);
  }
}
