import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/105-risk-created-outbox-event.sql');

describe('105 risk.created outbox event migration contract', () => {
  it('extends the canonical outbox event check without stale tenant GUCs', () => {
    expect(existsSync(migrationPath), 'expected packages/db/migrations/105-risk-created-outbox-event.sql').toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(/drop constraint if exists outbox_events_event_type_check/i);
    expect(sql).toMatch(/add constraint outbox_events_event_type_check check/i);
    expect(sql).toMatch(/'risk\.created'/);
    expect(sql).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('105 risk.created outbox event live constraint', () => {
  let ownerPool: pg.Pool;

  beforeAll(() => {
    ownerPool = getOwnerConnection();
  });

  afterAll(async () => {
    await ownerPool?.end();
  });

  it('accepts risk.created rows in public.outbox_events', async () => {
    const orgId = randomUUID();
    const riskId = randomUUID();

    const result = await ownerPool.query<{ event_type: string }>(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values ($1::uuid, 'risk.created', 'risk', $2, $3::jsonb, 'risk-actions-v1')
       returning event_type`,
      [orgId, riskId, JSON.stringify({ org_id: orgId, risk_id: riskId })],
    );

    expect(result.rows).toEqual([{ event_type: 'risk.created' }]);
  });
});
