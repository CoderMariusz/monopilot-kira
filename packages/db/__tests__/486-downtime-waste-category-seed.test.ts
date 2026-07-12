import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('migration 486 downtime + waste category seed (S16)', () => {
  it('is idempotent and seeds baseline 4P downtime + waste taxonomies per org', () => {
    const sql = readFileSync(
      resolve(__dirname, '../migrations/486-production-downtime-waste-category-seed.sql'),
      'utf8',
    );
    expect(sql).toContain('insert into public.downtime_categories');
    expect(sql).toContain('insert into public.waste_categories');
    expect(sql).toContain('on conflict on constraint downtime_categories_org_code_unique do nothing');
    expect(sql).toContain('on conflict on constraint waste_categories_org_code_unique do nothing');
    expect(sql).toContain("('PLANT_BREAKDOWN', 'Equipment breakdown', 'unplanned')");
    expect(sql).toContain("('TRIM', 'Trim / offcut')");
  });
});
