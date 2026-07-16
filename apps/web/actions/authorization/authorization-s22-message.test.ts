import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

describe('authorization S22 dual-sign messaging (C008)', () => {
  it('maps dual-sign min-approver violations to a distinct blocker code and at-least-2 copy', () => {
    const preflight = readFileSync(resolve(repoRoot, 'apps/web/actions/authorization/preflight.ts'), 'utf8');
    const page = readFileSync(
      resolve(repoRoot, 'apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx'),
      'utf8',
    );
    const client = readFileSync(
      resolve(repoRoot, 'apps/web/app/[locale]/(app)/(admin)/settings/authorization/authorization-screen.client.tsx'),
      'utf8',
    );
    const en = readFileSync(resolve(repoRoot, 'apps/web/i18n/en.json'), 'utf8');

    expect(preflight).toContain("code: 'min_approvers_dual_sign_invalid'");
    expect(page).toContain("code: 'min_approvers_dual_sign_invalid'");
    expect(client).toContain("code: 'min_approvers_dual_sign_invalid'");
    expect(client).toContain("copy('blockerMinApproversDualSignInvalid')");
    expect(en).toContain('"blockerMinApproversDualSignInvalid": "Dual sign-off requires at least 2 approvers"');
    expect(en).toContain('"blockerMinApproversInvalid": "Minimum approvers must be at least 1"');
  });
});
