import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'migrations/123-schema-runtime-dept-zod.sql');

describe('T-014 schema-runtime DeptColumns migration', () => {
  it('uses the 123 migration slot without recreating canonical Reference tables', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/alter\s+table\s+"Reference"\."DeptColumns"[\s\S]*add\s+column\s+if\s+not\s+exists\s+data_type\s+text/i);
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });

  it('reasserts forced app.current_org_id RLS and app_user DML grants', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/alter\s+table\s+"Reference"\."DeptColumns"\s+force\s+row\s+level\s+security/i);
    expect(migration).toMatch(/using\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(migration).toMatch(/with\s+check\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."DeptColumns"\s+to\s+app_user/i);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."PackSizes"\s+to\s+app_user/i);
  });
});
