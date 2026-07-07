import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx',
);

describe('settings locations page — RSC boundary', () => {
  it('passes the module server action without .bind()', () => {
    const source = readFileSync(PAGE, 'utf8');
    const treeProps = source.match(/<LocationTreeScreen[\s\S]*?\/>/s)?.[0] ?? '';

    expect(treeProps).toContain('importCsvAction={importLocationCsvAction}');
    expect(treeProps).toContain('importWarehouseId={selectedWarehouseId}');
    expect(treeProps).toContain('importLocale={locale}');
    expect(source).not.toMatch(/importLocationCsvAction\.bind\(/);
  });
});
