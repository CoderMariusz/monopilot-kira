import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(modules)/planning/import/page.tsx',
);

describe('planning import hub — RSC boundary', () => {
  it('EntityImportCard props stay serializable (no inline arrow callbacks)', () => {
    const source = readFileSync(PAGE, 'utf8');
    const toCard = source.match(/<EntityImportCard[\s\S]*?testid="to"[\s\S]*?\/>/s)?.[0] ?? '';
    const woCard = source.match(/<EntityImportCard[\s\S]*?testid="wo"[\s\S]*?\/>/s)?.[0] ?? '';

    expect(toCard).toContain('createdNumberField="to_number"');
    expect(toCard).not.toMatch(/createdNumber=\{/);
    expect(toCard).not.toMatch(/createdHref=\{/);

    expect(woCard).toContain('createdNumberField="wo_number"');
    expect(woCard).not.toMatch(/createdNumber=\{/);
    expect(woCard).not.toMatch(/createdHref=\{/);
  });
});
