import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_063 = '063-org-authorization-policies.sql';

/** Canonical seed literals from migration 063 / seed_authorization_policies_for_org. */
const CANONICAL_063 = {
  npd: {
    policyCode: 'npd_post_release_edit',
    requestPermissions: "array['npd.released_product_edit.request']::text[]",
    authorizePermissions: "array['npd.released_product_edit.authorize']::text[]",
    approverRoleCodes: "array['owner']::text[]",
    minApprovers: 1,
    requireSegregationOfDuties: true,
    requiresNewVersion: true,
    approvalGateRuleCode: null,
    settingsJson: "'{}'::jsonb",
  },
  technical: {
    policyCode: 'technical_product_spec_approval',
    requestPermissions: "'{}'::text[]",
    authorizePermissions: "array['technical.product_spec.approve']::text[]",
    approverRoleCodes: "array['quality_lead']::text[]",
    minApprovers: 1,
    requireSegregationOfDuties: true,
    requiresNewVersion: true,
    approvalGateRuleCode: 'technical_product_spec_approval_gate_v1',
    settingsJson: "jsonb_build_object('require_dual_sign_off', true)",
  },
  gateRule: {
    ruleCode: 'technical_product_spec_approval_gate_v1',
    definitionJson: "jsonb_build_object('min_approvers', 1, 'requires_new_version', true)",
  },
} as const;

function readMigration(name: string): string {
  return readFileSync(resolve(__dirname, `../migrations/${name}`), 'utf8');
}

describe('migration 487 org_authorization_policies seed (S22)', () => {
  it('mirrors migration 063 seed_authorization_policies_for_org defaults exactly', () => {
    const sql487 = readMigration('487-org-authorization-policies-seed.sql');
    const sql063 = readMigration(MIGRATION_063);

    // Structural idempotency (487-only pattern).
    expect(sql487).toContain('insert into public.org_authorization_policies');
    expect(sql487).toContain('on conflict on constraint org_authorization_policies_org_code_unique do nothing');

    // Policy codes.
    expect(sql487).toContain(`'${CANONICAL_063.npd.policyCode}'`);
    expect(sql487).toContain(`'${CANONICAL_063.technical.policyCode}'`);

    // NPD row — permissions, roles, invariants.
    expect(sql487).toContain(CANONICAL_063.npd.requestPermissions);
    expect(sql487).toContain(CANONICAL_063.npd.authorizePermissions);
    expect(sql487).toContain(CANONICAL_063.npd.approverRoleCodes);
    expect(sql487).toContain(CANONICAL_063.npd.settingsJson);

    // Technical row — permissions, roles, dual-sign default (063 canonical = true).
    expect(sql487).toContain(CANONICAL_063.technical.requestPermissions);
    expect(sql487).toContain(CANONICAL_063.technical.authorizePermissions);
    expect(sql487).toContain(CANONICAL_063.technical.approverRoleCodes);
    expect(sql487).toContain(CANONICAL_063.technical.settingsJson);
    expect(sql487).not.toContain("jsonb_build_object('require_dual_sign_off', false)");

    // Shared column defaults applied in the SELECT (min_approvers, segregation, version).
    expect(sql487).toMatch(/\n\s+1,\s*\n\s+true,\s*\n\s+p\.requires_new_version,/);

    // Gate rule seed matches 063.
    expect(sql487).toContain(`'${CANONICAL_063.gateRule.ruleCode}'`);
    expect(sql487).toContain(CANONICAL_063.gateRule.definitionJson);

    // 063 function body is the canonical source — 487 must not diverge on dual-sign.
    expect(sql063).toContain(CANONICAL_063.technical.settingsJson);
    expect(sql487).toContain(CANONICAL_063.technical.settingsJson);
  });
});
