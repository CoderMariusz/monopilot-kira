import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx',
);
const ACTION = join(
  process.cwd(),
  'app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/_actions/toggle-gate-checklist.ts',
);

describe('NPD gate page — RSC boundary', () => {
  it('approvalHistory subtitle passes ICU {count} from loaded approvals', () => {
    const pageSource = readFileSync(PAGE, 'utf8');

    expect(pageSource).toMatch(/t\('subtitle',\s*\{\s*count\s*\}\)/);
    expect(pageSource).toContain('const approvalCount = loaded.data?.approvals.length ?? 0');
    expect(pageSource).toContain('loadHistoryLabels(locale, approvalCount)');
    expect(pageSource).not.toMatch(/loadHistoryLabels\(locale,\s*'npd\.approvalHistory'\)/);
  });

  it('toggleGateChecklistItem uses a module server action (no inline adapter)', () => {
    const pageSource = readFileSync(PAGE, 'utf8');
    const actionSource = readFileSync(ACTION, 'utf8');

    expect(pageSource).not.toMatch(/toggleChecklistAdapter\.bind\(/);
    expect(pageSource).not.toMatch(/async function toggleChecklistAdapter/);
    expect(pageSource).toContain("import { toggleGateChecklistAdapter } from './_actions/toggle-gate-checklist'");
    expect(pageSource).toContain('toggleGateChecklistItem={loaded.canWrite ? toggleGateChecklistAdapter : undefined}');

    expect(actionSource).toContain("'use server'");
    expect(actionSource).toMatch(/export async function toggleGateChecklistAdapter/);
    expect(actionSource).not.toMatch(/export type /);
    expect(actionSource).not.toMatch(/export const /);
  });
});
