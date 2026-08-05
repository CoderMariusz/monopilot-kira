import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../packages/db/migrations/559-factory-spec-esign-evidence.sql',
);

function readMigration(): string {
  expect(existsSync(migrationPath), 'migration 559 must exist').toBe(true);
  return readFileSync(migrationPath, 'utf8').toLowerCase();
}

describe('migration 559 factory-spec e-sign evidence', () => {
  it('repairs invalid factory availability before installing the evidence trigger', () => {
    const sql = readMigration();
    const releaseRepair = sql.indexOf('update public.factory_release_status');
    const specRepair = sql.indexOf('update public.factory_specs');
    const triggerCreate = sql.indexOf('create constraint trigger factory_specs_approved_esign_evidence');

    expect(releaseRepair).toBeGreaterThanOrEqual(0);
    expect(specRepair).toBeGreaterThan(releaseRepair);
    expect(triggerCreate).toBeGreaterThan(specRepair);
    expect(sql).toContain("release_status = 'pending_technical_approval'");
    expect(sql).toContain("status = 'in_review'");
    expect(sql).toContain('approved_by = null');
    expect(sql).toContain('released_by = null');
  });

  it('ties every factory-usable status to the exact signed bundle and distinct signers', () => {
    const sql = readMigration();

    expect(sql).toContain("new.status in ('approved_for_factory', 'released_to_factory')");
    expect(sql).toContain("intent = 'tech.fa.release'");
    expect(sql).toContain("p_factory_spec_id::text || ':' || p_bom_header_id::text || ':approve'");
    expect(sql).toContain('subject_hash = v_subject_hash');
    expect(sql).toContain('count(distinct signer_user_id)');
    expect(sql).toContain('signer_user_id = p_approved_by');
    expect(sql).toContain("using errcode = '23514'");
  });

  it('repairs unsupported quality policy rows before constraining them to one signature', () => {
    const sql = readMigration();
    const repair = sql.indexOf('update public.signoff_policies');
    const constraint = sql.indexOf('add constraint signoff_policies_supported_signature_count_check');

    expect(repair).toBeGreaterThanOrEqual(0);
    expect(constraint).toBeGreaterThan(repair);
    for (const intent of ['qa.hold.release', 'qa.ncr.close', 'qa.haccp.ccp.deviation']) {
      expect(sql).toContain(`'${intent}'`);
    }
    expect(sql).toContain('required_signatures = 1');
    expect(sql).toContain('second_signer_role_id is null');
    expect(sql).toContain('allow_same_user = true');
  });
});
