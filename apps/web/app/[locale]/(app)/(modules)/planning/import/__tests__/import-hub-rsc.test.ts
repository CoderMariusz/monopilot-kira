import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildToImportCardProps,
  buildWoImportCardProps,
  findFunctionFields,
} from '../_lib/import-hub-card-props';

const PAGE = join(
  process.cwd(),
  'app/[locale]/(app)/(modules)/planning/import/page.tsx',
);

const mockT = (key: string) => key;

describe('planning import hub — RSC boundary', () => {
  it('EntityImportCard props stay serializable (no inline arrow callbacks)', () => {
    const source = readFileSync(PAGE, 'utf8');
    const toCard = source.match(/<EntityImportCard[\s\S]*?validateAction=\{validateToImport\}/s)?.[0] ?? '';
    const woCard = source.match(/<EntityImportCard[\s\S]*?validateAction=\{validateWoImport\}/s)?.[0] ?? '';

    expect(toCard).toContain('{...toCardProps}');
    expect(toCard).not.toMatch(/previewColumns=/);
    expect(toCard).not.toMatch(/spec=\{/);
    expect(toCard).not.toMatch(/createdNumber=\{/);
    expect(toCard).not.toMatch(/createdHref=\{/);

    expect(woCard).toContain('{...woCardProps}');
    expect(woCard).not.toMatch(/previewColumns=/);
    expect(woCard).not.toMatch(/spec=\{/);
    expect(woCard).not.toMatch(/createdNumber=\{/);
    expect(woCard).not.toMatch(/createdHref=\{/);
  });

  it('TO/WO card prop builders contain no function fields', () => {
    const toProps = buildToImportCardProps(mockT, 'en', false);
    const woProps = buildWoImportCardProps(mockT, 'en', false);

    expect(findFunctionFields(toProps)).toEqual([]);
    expect(findFunctionFields(woProps)).toEqual([]);
    expect(toProps.entityKind).toBe('to');
    expect(woProps.entityKind).toBe('wo');
    expect(toProps.previewColumnDescriptors.every((column) => typeof column.formatId === 'string')).toBe(true);
    expect(woProps.previewColumnDescriptors.every((column) => typeof column.formatId === 'string')).toBe(true);
  });
});
