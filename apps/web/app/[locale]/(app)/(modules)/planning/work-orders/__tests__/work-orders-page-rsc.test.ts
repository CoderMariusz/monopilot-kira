import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(modules)/planning/work-orders/page.tsx',
);

describe('planning work orders list — RSC boundary', () => {
  it('createWorkOrderAction is a named server action import (no inline closure)', () => {
    const source = readFileSync(PAGE, 'utf8');

    expect(source).toContain("import { createWorkOrderFromPlanning } from './_actions/createWorkOrder'");
    const listViewProps = source.match(/<WoListView[\s\S]*?\/>/s)?.[0] ?? '';
    expect(listViewProps).toContain('createWorkOrderAction={createWorkOrderFromPlanning}');
    expect(listViewProps).not.toMatch(/createWorkOrderAction=\{async/);
    expect(listViewProps).not.toMatch(/createWorkOrderAction=\{\s*\(/);
  });
});
