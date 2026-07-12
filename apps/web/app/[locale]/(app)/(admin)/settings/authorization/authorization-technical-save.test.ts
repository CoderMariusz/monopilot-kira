import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('authorization technical dual-sign configuration (S22)', () => {
  it('allows saving technical min_approvers and require_dual_sign_off from the settings screen', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'app/[locale]/(app)/(admin)/settings/authorization/authorization-screen.client.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY');
    expect(source).toContain('technicalMinApprovers');
    expect(source).toContain('require_dual_sign_off: technicalDualSignOff');
    expect(source).toMatch(/technicalDualSignOff && technicalMinApprovers < 2/);
  });
});
