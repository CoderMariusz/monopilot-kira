import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../packages/db/migrations/558-technical-approval-dual-sign-policy.sql',
);

function readMigration(): string {
  expect(existsSync(migrationPath), 'migration 558 must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8').toLowerCase();
}

describe('migration 558 technical approval dual-sign policy', () => {
  it('seeds two approvers whenever dual sign-off is enabled', () => {
    const sql = readMigration();

    expect(sql).toMatch(
      /'technical_product_spec_approval'[\s\S]*array\['quality_lead'\]::text\[\],\s*2,\s*true,\s*true,[\s\S]*jsonb_build_object\('require_dual_sign_off', true\)/,
    );
    expect(sql).toContain(
      "jsonb_build_object('min_approvers', 2, 'requires_new_version', true)",
    );
  });

  it('repairs only contradictory rows before adding the CHECK and executes a failing post-check', () => {
    const sql = readMigration();
    const repairIndex = sql.indexOf('update public.org_authorization_policies');
    const constraintIndex = sql.indexOf(
      'add constraint org_authorization_policies_dual_sign_min_approvers_check',
    );
    const postCheckIndex = sql.lastIndexOf(
      'from public.org_authorization_policies',
    );

    expect(repairIndex).toBeGreaterThanOrEqual(0);
    expect(constraintIndex).toBeGreaterThan(repairIndex);
    expect(postCheckIndex).toBeGreaterThan(constraintIndex);
    expect(sql).toContain(
      `settings_json @> '{"require_dual_sign_off": true}'::jsonb`,
    );
    expect(sql).toContain('min_approvers < 2');
    expect(sql).toContain('get diagnostics v_repaired = row_count');
    expect(sql).toContain('raise notice');
    expect(sql).toContain('select count(*)::integer');
    expect(sql).toContain('raise exception');
    expect(sql).not.toMatch(/^\s*prepare\b/m);

    const constraintSql = sql.slice(constraintIndex, postCheckIndex);
    expect(constraintSql).not.toContain('policy_code');
    expect(constraintSql).toContain(
      `coalesce(settings_json -> 'require_dual_sign_off', 'false'::jsonb) <> 'true'::jsonb`,
    );
  });
});
