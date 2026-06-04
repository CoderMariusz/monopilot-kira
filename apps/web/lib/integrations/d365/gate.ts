/**
 * T-030 — D365 feature-flag + constants gate (`assertD365Enabled`).
 *
 * Single guard consumed by every D365 entry point (pull cron, push worker,
 * connection-test/health route, manual sync trigger). It enforces the two
 * preconditions from PRD §13.6 / §13.10:
 *
 *   1. The per-org `integration.d365.enabled` feature flag is ON
 *      (`public.feature_flags_core`). When OFF → V-TEC-70 (the API surface maps
 *      this to HTTP 412 Precondition Failed).
 *   2. All five P1 D365 reference constants are populated for the org
 *      (`"Reference"."D365_Constants"`). When any is missing/blank → V-SET-42.
 *
 * D365 is OPTIONAL + export/import only (R15 anti-corruption). This gate never
 * touches D365 itself; it only reads local org configuration under the caller's
 * RLS-scoped transaction. `d365_item_id` is a TEXT soft reference everywhere —
 * never a hard FK.
 *
 * The constant store is the canonical `"Reference"."D365_Constants"` table
 * (migration 083). The seed splits two of the five logical constants into a
 * family (`PRODUCTGROUPID_FG`/`_PR`, `COSTINGOPERATIONRESOURCEID_DEFAULT`), so a
 * canonical constant counts as present when ANY key equal to it OR prefixed by
 * `<KEY>_` carries a non-empty value.
 */

export type QueryClient = {
  query<T = unknown>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The feature-flag code that gates the whole integration (PRD §13.6). */
export const D365_ENABLED_FLAG = 'integration.d365.enabled';

/**
 * The five P1 D365 reference constants that must be populated before the
 * integration may run (PRD §13.6, V-SET-42). Order is stable for deterministic
 * error reporting.
 */
export const D365_REQUIRED_CONSTANTS = [
  'PRODUCTIONSITEID',
  'APPROVERPERSONNELNUMBER',
  'CONSUMPTIONWAREHOUSEID',
  'PRODUCTGROUPID',
  'COSTINGOPERATIONRESOURCEID',
] as const;

export type D365ConstantKey = (typeof D365_REQUIRED_CONSTANTS)[number];

/** Validation codes surfaced by the gate (PRD §13.10). */
export type D365GateCode = 'V-TEC-70' | 'V-SET-42';

/**
 * Thrown by `assertD365Enabled` when a precondition fails. The `code` carries
 * the PRD validation id so the route layer can map it to the right HTTP status
 * (V-TEC-70 → 412, V-SET-42 → 412/409 per surface) without leaking detail.
 */
export class D365DisabledError extends Error {
  readonly code: D365GateCode;
  /** For V-SET-42: the canonical constant keys that are still unset. */
  readonly missingConstants: readonly string[];

  constructor(code: D365GateCode, message: string, missingConstants: readonly string[] = []) {
    super(message);
    this.name = 'D365DisabledError';
    this.code = code;
    this.missingConstants = missingConstants;
  }
}

/**
 * Read the per-org `integration.d365.enabled` flag. Fail-closed: a missing row
 * is treated as disabled (never throws on absence).
 */
export async function isD365Enabled(client: QueryClient): Promise<boolean> {
  const { rows } = await client.query<{ is_enabled: boolean }>(
    `select is_enabled
       from public.feature_flags_core
      where org_id = app.current_org_id()
        and flag_code = $1`,
    [D365_ENABLED_FLAG],
  );
  return rows[0]?.is_enabled === true;
}

/**
 * Return the canonical required constants that are NOT satisfied for the org.
 * A canonical constant is satisfied when a row whose `constant_key` equals it
 * OR begins with `<KEY>_` carries a non-empty `constant_value`.
 */
export async function findMissingD365Constants(
  client: QueryClient,
): Promise<D365ConstantKey[]> {
  const { rows } = await client.query<{ constant_key: string; constant_value: string | null }>(
    `select constant_key, constant_value
       from "Reference"."D365_Constants"
      where org_id = app.current_org_id()`,
  );

  const populated = rows
    .filter((row) => typeof row.constant_value === 'string' && row.constant_value.trim().length > 0)
    .map((row) => row.constant_key);

  return D365_REQUIRED_CONSTANTS.filter((key) => {
    return !populated.some((present) => present === key || present.startsWith(`${key}_`));
  });
}

/**
 * Assert that D365 is fully enabled for the caller's org. Throws
 * `D365DisabledError` with the matching PRD code when a precondition fails.
 *
 * Order: flag first (V-TEC-70), then constants (V-SET-42) — a disabled
 * integration is the cheaper, more common rejection.
 */
export async function assertD365Enabled(client: QueryClient): Promise<void> {
  const enabled = await isD365Enabled(client);
  if (!enabled) {
    throw new D365DisabledError(
      'V-TEC-70',
      'D365 integration is disabled for this organization (integration.d365.enabled=false).',
    );
  }

  const missing = await findMissingD365Constants(client);
  if (missing.length > 0) {
    throw new D365DisabledError(
      'V-SET-42',
      `D365 reference constants are incomplete: ${missing.join(', ')}.`,
      missing,
    );
  }
}
