import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const runIntegrationTest = process.env.DATABASE_URL ? describe : describe.skip;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/131-fa-template-applied-event.sql');

describe('131 fa.template_applied outbox event migration contract', () => {
  it('extends the canonical outbox event check without stale tenant GUCs', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/131-fa-template-applied-event.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/drop constraint if exists outbox_events_event_type_check/i);
    expect(sql).toMatch(/add constraint outbox_events_event_type_check check/i);
    expect(sql).toMatch(/'fa\.template_applied'/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('131 fa.template_applied outbox event live constraint', () => {
  let ownerPool: pg.Pool;

  beforeAll(() => {
    ownerPool = getOwnerConnection();
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  it('accepts fa.template_applied rows in public.outbox_events', async () => {
    const orgId = randomUUID();
    const productCode = `FA-${randomUUID()}`;

    const result = await ownerPool.query<{ event_type: string }>(
      `
        insert into public.outbox_events
          (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
        values ($1::uuid, 'fa.template_applied', 'fa', $2, $3::jsonb, 't013-chain4-test')
        returning event_type
      `,
      [
        orgId,
        productCode,
        JSON.stringify({
          product_code: productCode,
          template_name: 'BakeryStandard',
          affected_count: 3,
        }),
      ],
    );

    expect(result.rows).toEqual([{ event_type: 'fa.template_applied' }]);
  });
});
