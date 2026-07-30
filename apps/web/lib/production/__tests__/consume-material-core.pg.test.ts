/**
 * A1 correction — real-DB FEFO consume LP resolution (C2).
 *
 * Proves held-first / eligible-second: when the earliest FEFO LP carries an
 * active quality hold, resolveConsumptionLp auto-picks the next eligible LP.
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../packages/db/src/clients.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../tests/helpers/owner-org-context.js';

import { resolveConsumptionLp } from '../consume-material-core.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

let orgId: string;
let userId: string;
const itemId = randomUUID();
let siteId: string;
let warehouseId: string;
const heldLpId = randomUUID();
const eligibleLpId = randomUUID();

runPg('consume-material-core FEFO hold exclusion (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fixture: PgTestFixture;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    fixture = await createPgTestFixture(ownerPool, { permissions: [] });
    ({ orgId, userId, siteId, warehouseId } = fixture);
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, $3, 'rm', 'A1 FEFO RM', 'kg', $4)
       on conflict (id) do nothing`,
      [itemId, orgId, `A1FEFO-${itemId.slice(0, 8)}`, userId],
    );

    await ownerPool.query(
      `insert into public.license_plates (
         id, org_id, site_id, warehouse_id, lp_number, product_id,
         quantity, reserved_qty, uom, status, qa_status, expiry_date, created_by, updated_by
       )
       values
         ($1, $2, $3, $4, 'A1F-HELD', $5, 10.000, 0.000, 'kg', 'available', 'released',
          '2026-01-15T00:00:00Z', $6, $6),
         ($7, $2, $3, $4, 'A1F-ELIG', $5, 10.000, 0.000, 'kg', 'available', 'released',
          '2026-06-15T00:00:00Z', $6, $6)
       on conflict (id) do nothing`,
      [heldLpId, orgId, siteId, warehouseId, itemId, userId, eligibleLpId],
    );

    await ownerPool.query(
      `insert into public.quality_holds
         (id, org_id, reference_type, reference_id, priority, hold_status, created_by)
       values ($1, $2, 'lp', $3, 'high', 'open', $4)
       on conflict (id) do nothing`,
      [randomUUID(), orgId, heldLpId, userId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.quality_holds where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.license_plates where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.items where org_id = $1', [orgId]).catch(() => undefined);
    await fixture?.cleanup();
    await appPool?.end();
    await ownerPool?.end();
  });

  async function runUnderOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const sessionToken = randomUUID();
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id, user_id = excluded.user_id`,
      [sessionToken, orgId, userId],
    );
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
      const result = await fn(client);
      await client.query('rollback');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await ownerPool
        .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
        .catch(() => undefined);
    }
  }

  it('skips held earliest FEFO LP and selects the next eligible LP (C2)', async () => {
    await runUnderOrg(async (client) => {
      const result = await resolveConsumptionLp(
        { client, userId },
        {
          explicitLpId: null,
          productIds: [itemId],
          uom: 'kg',
          qty: '1.000',
          siteId,
        },
      );

      expect(result).toMatchObject({
        ok: true,
        lpId: eligibleLpId,
        fefoAutoResolved: true,
      });
    });
  });
});
