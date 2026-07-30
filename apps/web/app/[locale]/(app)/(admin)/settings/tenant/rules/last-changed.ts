type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type RuleVariantAuditRow = { rule_code: string; changed_at: string | Date | null };

/**
 * Resilient read: pulls the most-recent change timestamp per rule_code from the
 * audit_log trail emitted by saveRuleVariantOverridesLive
 * (action = 'tenant_variations.rule_variant.batch_updated').
 *
 * Failures degrade to an empty map so the rules table still renders with
 * `Never changed` -- blanking the whole screen over a decorative column would be
 * worse. But the error is logged, never swallowed: a fully-silent catch is what
 * kept this column dead (it queried a non-existent audit_log.created_at) for the
 * entire life of the feature, with no signal anywhere that auditing was broken.
 *
 * Lives outside page.tsx so it can be exercised against a real database; a Next
 * page module cannot export helpers.
 */
export async function readLastChangedByCode(client: QueryClient): Promise<Record<string, string>> {
  try {
    const { rows } = await client.query<RuleVariantAuditRow>(
      `select key as rule_code, max(occurred_at) as changed_at
         from public.audit_log,
              lateral jsonb_object_keys(coalesce(after_state->'rule_variant_overrides', '{}'::jsonb)) as key
        where org_id = app.current_org_id()
          and action = 'tenant_variations.rule_variant.batch_updated'
        group by key`,
    );
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (typeof row.rule_code !== 'string' || !row.changed_at) continue;
      const iso = row.changed_at instanceof Date ? row.changed_at.toISOString() : String(row.changed_at);
      map[row.rule_code] = iso;
    }
    return map;
  } catch (error) {
    console.error(
      '[settings/tenant/rules] last_changed_read_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return {};
  }
}
