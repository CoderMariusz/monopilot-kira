/**
 * P0.5 — "Zwroty RMA nie wracają do magazynu".
 * Prawdziwe wywołanie receiveRma + processRma('restock') na żywej bazie.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedOrg, teardown, snapshot, report, type Seed } from './seed';
import {
  receiveRma,
  processRma,
} from '../../../../apps/web/app/[locale]/(app)/(modules)/shipping/_actions/rma-actions';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('P0.5 RMA restock', () => {
  let seed: Seed;
  let rmaId: string;
  let lineId: string;

  beforeAll(async () => {
    seed = await seedOrg('p05');
    rmaId = randomUUID();
    lineId = randomUUID();
    await seed.ownerPool.query(
      `insert into public.rma_requests (id, org_id, site_id, customer_id, reason_code, status, approved_at, approved_by)
       values ($1, $2, $3, $4, 'damaged', 'approved', now(), $5)`,
      [rmaId, seed.orgId, seed.siteId, seed.customerId, seed.userId],
    );
    await seed.ownerPool.query(
      `insert into public.rma_lines (id, org_id, site_id, rma_request_id, product_id, quantity_expected, quantity_received)
       values ($1, $2, $3, $4, $5, 5, 0)`,
      [lineId, seed.orgId, seed.siteId, rmaId, seed.fgItemId],
    );
  });

  afterAll(async () => {
    await teardown(seed);
    await seed.appPool.end().catch(() => undefined);
    await seed.ownerPool.end().catch(() => undefined);
  });

  it('receive+process(restock) 5 kg → czy powstaje LP i stock_move?', async () => {
    const before = await snapshot(seed);
    report('p05','PRZED',before);

    const recv = await receiveRma({ rmaId, lines: [{ lineId, quantityReceived: '5' }] });
    report('p05','receiveRma ->',recv);

    const proc = await processRma({ rmaId, disposition: 'restock' });
    report('p05','processRma ->',proc);

    const after = await snapshot(seed);
    report('p05','PO',after);

    const { rows: holds } = await seed.ownerPool.query(
      `select count(*)::text as c from public.quality_holds where org_id = $1`,
      [seed.orgId],
    ).catch(() => ({ rows: [{ c: 'n/a' }] }));
    report('p05','quality_holds',holds);

    const { rows: lineRows } = await seed.ownerPool.query(
      `select quantity_received::text as q, disposition from public.rma_lines where id = $1`,
      [lineId],
    );
    report('p05','rma_line PO',lineRows);

    // Raport, nie asercja — chcę zobaczyć fakty.
    expect(recv).toBeTruthy();
  });

  it('częściowy commit: linia A ok, linia B nieistniejąca → co zostaje utrwalone?', async () => {
    // reset
    await seed.ownerPool.query(`update public.rma_requests set status='approved' where id=$1`, [rmaId]);
    await seed.ownerPool.query(`update public.rma_lines set quantity_received=0 where id=$1`, [lineId]);

    const bogus = randomUUID();
    const res = await receiveRma({
      rmaId,
      lines: [
        { lineId, quantityReceived: '5' },
        { lineId: bogus, quantityReceived: '3' },
      ],
    });
    report('p05','receiveRma (A ok, B bogus) ->',res);

    const { rows } = await seed.ownerPool.query(
      `select quantity_received::text as q from public.rma_lines where id = $1`,
      [lineId],
    );
    const { rows: hdr } = await seed.ownerPool.query(
      `select status from public.rma_requests where id = $1`,
      [rmaId],
    );
    report('p05','PO czesciowy commit',{lineA:rows,header:hdr});
    expect(res).toBeTruthy();
  });
});
