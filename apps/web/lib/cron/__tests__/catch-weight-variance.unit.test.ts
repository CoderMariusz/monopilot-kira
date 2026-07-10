import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const libSrc = resolve(here, '../catch-weight-variance.ts');
const migration477 = resolve(here, '../../../../../packages/db/migrations/477-catch-weight-variance-site-day-key.sql');

describe('catch-weight variance wave-14 contract', () => {
  it('migration 477 exists and replaces the org/item/day unique key with org/item/site/day', () => {
    const sql = readFileSync(migration477, 'utf8');
    expect(sql).toMatch(/drop index if exists public\.catch_weight_variance_daily_org_item_day_uq/i);
    expect(sql).toMatch(/catch_weight_variance_daily_org_item_site_day_uq/i);
    expect(sql).toMatch(/nulls not distinct/i);
  });

  it('groups variance by item_id and site_id (not min(site_id))', () => {
    const src = readFileSync(libSrc, 'utf8');
    expect(src).toMatch(/group by scored\.item_id, scored\.site_id/i);
    expect(src).not.toMatch(/min\(site_id::text\)/i);
  });

  it('upserts on (org_id, item_id, site_id, day)', () => {
    const src = readFileSync(libSrc, 'utf8');
    expect(src).toMatch(/on conflict \(org_id, item_id, site_id, day\)/i);
  });

  it('surfaces skipped zero/missing nominal weighings instead of silently dropping them', () => {
    const src = readFileSync(libSrc, 'utf8');
    expect(src).toMatch(/skip_reason/i);
    expect(src).toMatch(/skipped:/i);
    expect(src).toMatch(/zero_nominal|missing_nominal/);
  });
});
