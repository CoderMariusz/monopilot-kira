import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'migrations/120-d365-import-cache-meta.sql');

describe('T-090 D365 import cache metadata migration', () => {
  it('creates an org-scoped security-invoker view without stale tenant scope', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/create\s+or\s+replace\s+view\s+public\.d365_import_cache_meta/i);
    expect(migration).toMatch(/with\s*\(\s*security_invoker\s*=\s*true\s*\)/i);
    expect(migration).toMatch(/cache\.org_id/i);
    expect(migration).toMatch(/max\s*\(\s*cache\.last_synced_at\s*\)\s+as\s+last_synced_at/i);
    expect(migration).toMatch(/count\s*\(\s*\*\s*\)\s+as\s+row_count/i);
    expect(migration).toMatch(/grant\s+select\s+on\s+public\.d365_import_cache_meta\s+to\s+app_user/i);
    expect(migration).toMatch(/'d365\.cache\.refreshed'/);
    expect(migration).not.toMatch(/\btenant_id\b|current_setting\s*\(/i);
  });
});
