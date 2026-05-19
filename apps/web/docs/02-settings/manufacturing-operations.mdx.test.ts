import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const testDir = __dirname;
const repoRoot = resolve(testDir, '../../../..');
const pagePath = resolve(repoRoot, 'docs/02-settings/manufacturing-operations.mdx');
const expectedAdrPath = resolve(
  repoRoot,
  '_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md',
);

const expectedSeedRows = [
  { industry: 'bakery', operation: 'Mix', suffix: 'MX', sequence: 1 },
  { industry: 'bakery', operation: 'Knead', suffix: 'KN', sequence: 2 },
  { industry: 'bakery', operation: 'Proof', suffix: 'PR', sequence: 3 },
  { industry: 'bakery', operation: 'Bake', suffix: 'BK', sequence: 4 },
  { industry: 'pharma', operation: 'Synthesis', suffix: 'SY', sequence: 1 },
  { industry: 'pharma', operation: 'Separation', suffix: 'SE', sequence: 2 },
  { industry: 'pharma', operation: 'Crystallization', suffix: 'CZ', sequence: 3 },
  { industry: 'pharma', operation: 'Drying', suffix: 'DR', sequence: 4 },
  { industry: 'fmcg', operation: 'Mix', suffix: 'MX', sequence: 1 },
  { industry: 'fmcg', operation: 'Fill', suffix: 'FL', sequence: 2 },
  { industry: 'fmcg', operation: 'Seal', suffix: 'SL', sequence: 3 },
  { industry: 'fmcg', operation: 'Label', suffix: 'LB', sequence: 4 },
  { industry: 'generic', operation: 'Process_A', suffix: 'PA', sequence: 1 },
  { industry: 'generic', operation: 'Process_B', suffix: 'PB', sequence: 2 },
  { industry: 'generic', operation: 'Process_C', suffix: 'PC', sequence: 3 },
  { industry: 'generic', operation: 'Process_D', suffix: 'PD', sequence: 4 },
];

function readPage(): string {
  expect(
    existsSync(pagePath),
    'expected docs/02-settings/manufacturing-operations.mdx to exist for T-094 Manufacturing Operations integration docs',
  ).toBe(true);
  return readFileSync(pagePath, 'utf8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('T-094 Manufacturing Operations docs page', () => {
  it('exists and exposes the required reader-facing headings', () => {
    const page = readPage();

    for (const heading of [
      '# Manufacturing Operations Integration',
      '## Generic Product Lifecycle Naming',
      '## ManufacturingOperations integration flow',
      '## Seed rows',
      '## Source references',
    ]) {
      expect(page, `missing heading: ${heading}`).toMatch(new RegExp(`^${escapeRegExp(heading)}$`, 'm'));
    }
  });

  it('documents the ManufacturingOperations integration as a Mermaid sequence diagram', () => {
    const page = readPage();

    expect(page, 'expected an MDX fenced Mermaid sequence diagram').toMatch(/```mermaid\s+sequenceDiagram\b[\s\S]*?```/m);
    expect(page, 'sequence must show the Reference.ManufacturingOperations lookup').toMatch(
      /sequenceDiagram[\s\S]*Reference\.ManufacturingOperations[\s\S]*(process_suffix|operation_seq|WIP-<process_suffix>)/,
    );
  });

  it('links ADR-034 using a relative link that resolves in this repo', () => {
    const page = readPage();
    const adrLink = page.match(/\[[^\]]*ADR-034[^\]]*\]\(([^)]+)\)/);

    expect(adrLink?.[1], 'expected a markdown link whose label mentions ADR-034').toBeDefined();
    const href = adrLink![1].split('#')[0];
    expect(href, 'ADR link should target the canonical ADR-034 decision file').toContain(
      '_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md',
    );
    expect(existsSync(expectedAdrPath), 'canonical ADR-034 file must exist').toBe(true);
    expect(existsSync(resolve(dirname(pagePath), href)), `ADR-034 link does not resolve: ${href}`).toBe(true);
  });

  it('documents every seeded ManufacturingOperations row in a markdown table', () => {
    const page = readPage();

    expect(page, 'Seed rows section should cite the seed SQL source').toContain('packages/db/seeds/manufacturing-operations.sql');
    expect(page, 'Seed rows section should document idempotency').toMatch(/ON CONFLICT|idempotent/i);

    for (const row of expectedSeedRows) {
      const tableRow = new RegExp(
        `\\|\\s*${escapeRegExp(row.industry)}\\s*\\|\\s*${escapeRegExp(row.operation)}\\s*\\|\\s*${escapeRegExp(row.suffix)}\\s*\\|\\s*${row.sequence}\\s*\\|`,
      );
      expect(page, `missing documented seed row ${row.industry}/${row.operation}/${row.suffix}`).toMatch(tableRow);
    }
  });
});
