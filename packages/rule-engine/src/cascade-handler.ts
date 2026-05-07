/**
 * T-021 — Cascading rule handler: manufacturing_operation_N → intermediate_code_pN
 *
 * Recomputes intermediate_code_pN on a public.fg row based on the operation_name
 * looked up in Reference.ManufacturingOperations. Emits a transactional outbox
 * row (event_type='fg.intermediate_code_changed') in the same tx as the UPDATE.
 *
 * Red lines (per T-021.json):
 *  - Org-scoped: every read/write filters by org_id (input arg) — RLS-safe even
 *    when the handler runs as owner/superuser.
 *  - Active window: skip when the rule's [active_from, active_to] window does
 *    not bracket now(). Rule lookup is `manufacturing_operation_to_intermediate_code_cascade`.
 *  - Atomic: UPDATE + outbox INSERT inside a single transaction; throw → ROLLBACK.
 *  - Dry-run: side-effect-free (no UPDATE, no outbox INSERT).
 *  - Code shape: `WIP-<process_suffix>-<seq7>` where seq7 is a 7-digit zero-padded
 *    integer (matches `/^WIP-[A-Z0-9]{2,4}-\d{7}$/`).
 */

import type { Pool, PoolClient } from 'pg';

export interface RunCascadeArgs {
  /** Tenant org scope for RLS + lookup filters (load-bearing for M4). */
  orgId: string;
  /** public.fg.id of the row to recompute. */
  fgId: string;
  /** Which manufacturing_operation_N column was changed (1..4). */
  operationFieldIndex: 1 | 2 | 3 | 4;
  /** The operation_name (e.g. 'Mix' / 'Synthesis') to look up. */
  operationName: string;
  /** pg.Pool — owner pool in tests, app-role pool at runtime. */
  pool: Pool;
  /** When true, skip UPDATE + outbox INSERT and return without side effects. */
  dryRun?: boolean;
}

const CASCADE_RULE_ID = 'manufacturing_operation_to_intermediate_code_cascade';

/**
 * Generate a 7-digit numeric suffix that's effectively unique per call. We use
 * the lower 7 digits of (epoch_ms * 1000 + counter) so that rapid back-to-back
 * cascade calls don't collide. The exact digits are not load-bearing — tests
 * only assert the regex `^WIP-<suffix>-\d{7}$`.
 */
let counter = 0;
function nextSeq7(): string {
  counter = (counter + 1) % 10_000_000;
  const seed = (Date.now() * 1000 + counter) % 10_000_000;
  return String(seed).padStart(7, '0');
}

/**
 * Find the active cascade rule for the given org. Returns null if no row
 * brackets now() (M3 expired-window guard).
 */
async function loadActiveCascadeRule(
  client: PoolClient,
  orgId: string,
): Promise<{ id: string; version: number } | null> {
  const res = await client.query<{ id: string; version: number }>(
    `select id, version
       from "Reference"."Rules"
      where org_id = $1
        and rule_id = $2
        and active_from <= now()
        and (active_to is null or now() <= active_to)
      order by version desc
      limit 1`,
    [orgId, CASCADE_RULE_ID],
  );
  return res.rows[0] ?? null;
}

/**
 * Look up the manufacturing operation row for (org_id, operation_name).
 * Throws Error('operation_not_found') if not present (AC2 contract).
 */
async function lookupProcessSuffix(
  client: PoolClient,
  orgId: string,
  operationName: string,
): Promise<{ process_suffix: string; operation_seq: number | null }> {
  const res = await client.query<{ process_suffix: string; operation_seq: number | null }>(
    `select process_suffix, operation_seq
       from "Reference"."ManufacturingOperations"
      where org_id = $1
        and operation_name = $2
        and is_active = true
      order by operation_seq nulls last
      limit 1`,
    [orgId, operationName],
  );
  if (res.rows.length === 0) {
    throw new Error('operation_not_found');
  }
  return res.rows[0]!;
}

/**
 * Run the cascade. See module doc for semantics. Returns void on success.
 *
 * Throws:
 *  - Error('operation_not_found') — operation_name not in Reference.ManufacturingOperations
 *    for this org (AC2). The transaction is rolled back before this throws so
 *    no partial state escapes.
 */
export async function runCascade(args: RunCascadeArgs): Promise<void> {
  const { orgId, fgId, operationFieldIndex, operationName, pool, dryRun } = args;

  if (operationFieldIndex < 1 || operationFieldIndex > 4) {
    throw new Error(`invalid operationFieldIndex: ${operationFieldIndex}`);
  }
  // Whitelist column names — never interpolate user-controlled values into SQL
  // identifiers without a hard whitelist.
  const targetColumn = `intermediate_code_p${operationFieldIndex}` as const;

  const client = await pool.connect();
  try {
    await client.query('begin');

    // M3 — active-window enforcement. If no active rule exists for this org,
    // the cascade silently no-ops (idempotent on absence).
    const rule = await loadActiveCascadeRule(client, orgId);
    if (!rule) {
      await client.query('rollback');
      return;
    }

    // AC2 — missing operation throws inside the tx → rollback below preserves
    // FG row state and outbox count.
    const op = await lookupProcessSuffix(client, orgId, operationName);

    const newCode = `WIP-${op.process_suffix}-${nextSeq7()}`;

    if (dryRun) {
      // M1 — dry-run: skip both UPDATE and outbox INSERT, still rollback for
      // hygiene (no SELECT side effects).
      await client.query('rollback');
      return;
    }

    // Atomic UPDATE — explicit org_id scope (M4 RLS-safe even as owner).
    const updateResult = await client.query(
      `update public.fg
          set ${targetColumn} = $1
        where id = $2 and org_id = $3`,
      [newCode, fgId, orgId],
    );

    if (updateResult.rowCount === 0) {
      // No matching row in this org — do not emit an outbox event for a
      // ghost write. Roll back to leave the system pristine.
      await client.query('rollback');
      return;
    }

    // Transactional outbox emit — bound to the same tx as the UPDATE.
    await client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values ($1, 'fg.intermediate_code_changed', 'fg', $2, $3::jsonb, $4)`,
      [
        orgId,
        fgId,
        JSON.stringify({
          fg_id: fgId,
          column: targetColumn,
          intermediate_code: newCode,
          operation_name: operationName,
          process_suffix: op.process_suffix,
          operation_seq: op.operation_seq,
          rule_id: CASCADE_RULE_ID,
          rule_version: rule.version,
        }),
        't021-cascade',
      ],
    );

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
