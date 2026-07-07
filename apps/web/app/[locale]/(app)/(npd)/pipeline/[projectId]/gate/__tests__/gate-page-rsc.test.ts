import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx',
);

describe('NPD gate page — RSC boundary', () => {
  it('toggleGateChecklistItem uses a named server action (no .bind closure)', () => {
    const source = readFileSync(PAGE, 'utf8');

    expect(source).not.toMatch(/toggleChecklistAdapter\.bind\(/);
    expect(source).toMatch(/async function toggleChecklistAdapter\(input: \{ projectId: string; itemId: string; done: boolean \}\)/);
    expect(source).toContain('toggleGateChecklistItem={loaded.canWrite ? toggleChecklistAdapter : undefined}');
  });
});
