import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const upsertPolicyPath = resolve(repoRoot, 'apps/web/actions/security/upsert-policy.ts');
const forceMfaPath = resolve(repoRoot, 'apps/web/actions/security/force-mfa.ts');

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readRequiredSource(path: string, label: string): string {
  expect(existsSync(path), `${label} must exist for TASK-000085/T-032 security policy Server Actions`).toBe(true);
  return stripComments(readFileSync(path, 'utf8'));
}

function normalized(source: string): string {
  return source.replace(/\s+/g, ' ').toLowerCase();
}

function indexOfAny(source: string, fragments: readonly string[]): number {
  const indexes = fragments.map((fragment) => source.indexOf(fragment)).filter((index) => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

describe('org security policy Server Actions (TASK-000085/T-032 RED)', () => {
  it('rejects WebAuthn in mfa_allowed_methods before persisting the policy', () => {
    const source = normalized(readRequiredSource(upsertPolicyPath, 'apps/web/actions/security/upsert-policy.ts'));

    expect(source).toContain("'use server'");
    expect(source).toMatch(/export\s+async\s+function\s+upsert(security)?policy\s*\(/);
    expect(source).toMatch(/mfa_allowed_methods|mfaallowedmethods/);

    const webAuthnIndex = source.indexOf('webauthn');
    const rejectionIndex = indexOfAny(source, [
      'webauthn_not_allowed',
      'webauthn_deferred',
      'phase 3',
      'invalid_mfa_method',
      'unsupported_mfa_method',
    ]);
    const persistenceIndex = indexOfAny(source, [
      'insert into public.org_security_policies',
      'update public.org_security_policies',
      'on conflict',
      '.insert(',
      '.update(',
    ]);

    expect(webAuthnIndex, 'upsertPolicy must explicitly inspect/reject webauthn while D7 defers WebAuthn').toBeGreaterThanOrEqual(0);
    expect(rejectionIndex, 'upsertPolicy must return a typed rejection for WebAuthn').toBeGreaterThanOrEqual(webAuthnIndex);
    expect(persistenceIndex, 'WebAuthn rejection must happen before org_security_policies persistence').toBeGreaterThan(rejectionIndex);
  });

  it('forces MFA enrollment markers for owner/admin/module_admin users when required_admins is saved', () => {
    const forceSource = normalized(readRequiredSource(forceMfaPath, 'apps/web/actions/security/force-mfa.ts'));
    const upsertSource = normalized(readRequiredSource(upsertPolicyPath, 'apps/web/actions/security/upsert-policy.ts'));
    const combined = `${upsertSource}\n${forceSource}`;

    expect(forceSource).toContain("'use server'");
    expect(forceSource).toMatch(/export\s+async\s+function\s+force(admin)?mfa\s*\(/);
    expect(combined).toMatch(/withorgcontext\s*\(/);
    expect(upsertSource).toContain('required_admins');

    const requirementIndex = upsertSource.indexOf('required_admins');
    const triggerIndex = indexOfAny(upsertSource, ['forcemfa', 'forceadminmfa', 'requires_mfa_at']);
    expect(triggerIndex, 'saving mfa_requirement=required_admins must trigger the MFA marker action').toBeGreaterThan(requirementIndex);

    expect(forceSource).toMatch(/owner/);
    expect(forceSource).toMatch(/admin/);
    expect(forceSource).toMatch(/module_admin/);
    expect(forceSource).toMatch(/requires_mfa_at/);
    expect(forceSource).toMatch(/update\s+public\.users|\.update\(/);
    expect(forceSource).toMatch(/user_roles|roles/);
  });

  it('forces MFA enrollment markers for all active org users when required_all is saved', () => {
    const source = normalized(readRequiredSource(upsertPolicyPath, 'apps/web/actions/security/upsert-policy.ts'));

    expect(source).toContain('required_all');
    const requirementIndex = source.indexOf('required_all');
    const triggerIndex = indexOfAny(source, ['forceallusersmfa', 'requires_mfa_at']);
    expect(triggerIndex, 'saving mfa_requirement=required_all must trigger all-user MFA markers').toBeGreaterThan(requirementIndex);
    expect(source).toMatch(/update\s+public\.users/);
    expect(source).toMatch(/is_active\s*=\s*true/);
  });

  it('writes security-retained audit_log rows for policy and forced-MFA changes', () => {
    const combined = normalized(`${readRequiredSource(upsertPolicyPath, 'apps/web/actions/security/upsert-policy.ts')}\n${readRequiredSource(forceMfaPath, 'apps/web/actions/security/force-mfa.ts')}`);

    expect(combined).toContain('insert into public.audit_log');
    expect(combined).toContain('org_security_policies');
    expect(combined).toContain("'security'");
  });

  it('enforces the password_min_length floor of 8 before policy upsert', () => {
    const source = normalized(readRequiredSource(upsertPolicyPath, 'apps/web/actions/security/upsert-policy.ts'));

    expect(source).toMatch(/password_min_length|passwordminlength/);
    const minLengthIndex = indexOfAny(source, ['password_min_length', 'passwordminlength']);
    const floorIndex = indexOfAny(source, [
      '.min(8',
      '>= 8',
      '< 8',
      'min_length_floor',
      'password_min_length_floor',
      'too_short',
    ]);
    const persistenceIndex = indexOfAny(source, [
      'insert into public.org_security_policies',
      'update public.org_security_policies',
      'on conflict',
      '.insert(',
      '.update(',
    ]);

    expect(floorIndex, 'upsertPolicy must reject password_min_length below the PRD floor of 8').toBeGreaterThanOrEqual(minLengthIndex);
    expect(persistenceIndex, 'password_min_length validation must happen before org_security_policies persistence').toBeGreaterThan(floorIndex);
  });
});
