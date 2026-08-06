/**
 * FIX3-PROD — production dashboard WO-list SQL (real Postgres).
 * Requires DATABASE_URL — loud fail, no describe.skip.
 *
 * Reproduces live 42883 `text / numeric` when lateral qty_kg is cast to text.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../packages/db/src/clients.js';
import {
  createPgTestFixture,
  type PgTestFixture,
} from '../../../../../../tests/helpers/owner-org-context.js';
import {
  PRODUCTION_DASHBOARD_WO_LIST_SQL,
  PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL,
} from '../_lib/dashboard-queries';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('dashboard-data.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

let orgId: string;
let siteId: string;
let userId: string;
const productId = randomUUID();
const bomHeaderId = randomUUID();
const woId = randomUUID();

describe('production dashboard WO list SQL (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fixture: PgTestFixture;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    fixture = await createPgTestFixture(ownerPool, { permissions: [] });
    ({ orgId, siteId, userId } = fixture);
    await ownerPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, uom_base, created_by)
       values ($1, $2, 'FG-FIX3', 'fg', 'FIX3 Dashboard FG', 'kg', $3)
       on conflict (id) do nothing`,
      [productId, orgId, userId],
    );
    await ownerPool.query(
      // Fixture był pisany pod stary schemat. Aktualny stan (sprawdzony w bazie):
      //  * kolumna twórcy to `created_by_user`, nie `created_by`;
      //  * status 'active' wymaga KOMPLETU zatwierdzenia (approved_by + approved_at),
      //    inaczej łamie bom_headers_approved_status_requires_approval_check;
      //  * bom_headers_not_orphaned_check został PRZEDEFINIOWANY i patrzy na `item_id`
      //    (uuid → items.id), nie na starą tekstową kolumnę `product_id`.
      `insert into public.bom_headers
         (id, org_id, item_id, version, status, yield_pct, created_by_user, approved_by, approved_at)
       values ($1, $2, $3, 1, 'active', 100, $4, $4, pg_catalog.now())
       on conflict (id) do nothing`,
      [bomHeaderId, orgId, productId, userId],
    );
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, site_id, wo_number, product_id, item_type_at_creation,
          planned_quantity, uom, status, active_bom_header_id)
       values ($1, $2, $3, 'WO-FIX3-001', $4, 'fg', 50.000, 'kg', 'IN_PROGRESS', $5)
       on conflict (id) do nothing`,
      [woId, orgId, siteId, productId, bomHeaderId],
    );
    await ownerPool.query(
      // wo_outputs.transaction_id (the registration idempotency key) is NOT NULL.
      `insert into public.wo_outputs
         (org_id, site_id, wo_id, transaction_id, output_type, product_id, batch_number, qty_kg, uom)
       values ($1, $2, $3, gen_random_uuid(), 'primary', $4, 'WO-FIX3-001-OUT-001', 0.960, 'kg')`,
      [orgId, siteId, woId, productId],
    );
  });

  afterAll(async () => {
    await ownerPool?.query('delete from public.wo_outputs where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.bom_headers where org_id = $1', [orgId]).catch(() => undefined);
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

  it('computes progress_pct from numeric lateral qty_kg / planned_quantity', async () => {
    await runUnderOrg(async (client) => {
      const { rows } = await client.query<{
        id: string;
        produced_quantity: string;
        progress_pct: string;
      }>(PRODUCTION_DASHBOARD_WO_LIST_SQL);

      const row = rows.find((r) => r.id === woId);
      expect(row).toBeDefined();
      expect(row?.produced_quantity).toBe('0.960');
      expect(row?.progress_pct).toBe('2');
    });
  });

  it('reproduces live 42883 when lateral qty_kg is cast to text', async () => {
    await runUnderOrg(async (client) => {
      await expect(client.query(PRODUCTION_DASHBOARD_WO_LIST_SQL_BROKEN_TEXT_LATERAL)).rejects.toMatchObject({
        code: '42883',
      });
    });
  });
});
