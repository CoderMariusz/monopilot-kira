import { describe, expect, it, vi } from 'vitest';

import {
  ReceivePoError,
  listScannerPurchaseOrders,
  receiveScannerPoLine,
  type ReceiveLineInput,
} from './receive-po';
import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const USER_A = '00000000-0000-4000-8000-0000000000aa';
const SESSION_ID = '00000000-0000-4000-8000-0000000000ab';
const PO_ID = '00000000-0000-4000-8000-0000000000p0'.replace('p', 'a');
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const SITE_ID = '00000000-0000-4000-8000-0000000000d2';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const PO_DEST_WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';
const PO_DEST_LOCATION_ID = '00000000-0000-4000-8000-0000000000f3';
// lane W9-L8: operator-chosen destination inside the session-site warehouse
const REQ_LOCATION_ID = '00000000-0000-4000-8000-0000000000f2';

const session: ScannerSessionRow = {
  id: SESSION_ID,
  org_id: ORG_A,
  user_id: USER_A,
  device_id: null,
  site_id: SITE_ID,
  line_id: null,
  shift: null,
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date(),
  ended_at: null,
  created_at: new Date(),
  last_seen_at: new Date(),
};

const input: ReceiveLineInput = {
  clientOpId: 'op-1',
  poLineId: LINE_ID,
  qty: '10.500',
  batchNumber: 'B-1',
  bestBefore: '2026-07-01',
};

describe('scanner receive PO service', () => {
  it('site-scopes scanner PO listing through app.user_can_see_site', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    await listScannerPurchaseOrders(client, session);

    const listCall = findCall(client, 'from public.purchase_orders po');
    expect(listCall?.sql).toContain('app.user_can_see_site(po.site_id)');
    expect(listCall?.params).toEqual([ORG_A, expect.any(Array)]);
  });

  it('rejects receive without warehouse.grn.receive', async () => {
    const client = makeReceiveClient({ grantedReceivePermission: false });

    await expect(receiveScannerPoLine(client, session, input)).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
    expect(client.statements).not.toContain('begin');
  });

  it('creates a GRN, GRN item, LP, LP genesis history, audit row, and rolls PO status up', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1790000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    const result = await receiveScannerPoLine(client, session, input);

    expect(result).toMatchObject({
      ok: true,
      grnId: 'grn-1',
      grnNumber: 'GRN-20260611-0001',
      grnItemId: 'grn-item-1',
      lpId: 'lp-1',
      qty: '10.5',
      uom: 'kg',
      overReceived: true,
      poStatus: 'received',
    });
    expect(client.statements).toContain('begin');
    expect(client.statements).toContain('commit');
    expect(findCall(client, 'insert into public.license_plates')?.params).toEqual(
      expect.arrayContaining([ORG_A, WAREHOUSE_ID, ITEM_ID, '10.5', 'kg', 'B-1', '2026-07-01', LOCATION_ID]),
    );
    expect(findCall(client, 'insert into public.license_plates')?.sql).toContain("'available', 'pending'");
    expect(findCall(client, 'insert into public.grn_items')?.params).toEqual(
      expect.arrayContaining([ORG_A, 'grn-1', ITEM_ID, LINE_ID, '10.000000', '10.5', 'kg', 'B-1', '2026-07-01']),
    );
    const autoPutawayHistory = findCalls(client, 'insert into public.lp_state_history').find((call) =>
      call.sql.includes("'received', 'available'"),
    );
    expect(autoPutawayHistory?.sql).toContain(
      '(org_id, lp_id, from_state, to_state, reason_code, stock_move_id, transaction_id, created_by)',
    );
    expect(autoPutawayHistory?.params).toEqual(['lp-1', 'auto_putaway_po_receive', null, expect.any(String), USER_A]);
    expect(findCall(client, 'update public.purchase_orders')?.params).toEqual([ORG_A, PO_ID, 'received', USER_A]);
    expect(auditExt(client)).toMatchObject({ poLineId: LINE_ID, lpId: 'lp-1', qty: '10.5', overReceived: true });
    // flag OFF (default): no QC inspection is opened and the response says so
    expect(result).toMatchObject({ qcInspectionRequired: false, inspectionId: null });
    expect(findCall(client, 'insert into public.quality_inspections')).toBeUndefined();
  });

  it('flips the open draft GRN to completed once the PO rolls up to fully received', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-complete' });

    expect(result).toMatchObject({ ok: true, poStatus: 'received' });

    // the GRN completion is org-scoped, PO-scoped, po-source-typed, and only
    // touches still-draft rows (idempotent), stamping completed_at
    const grnComplete = findCall(client, "update public.grns set status = 'completed'");
    expect(grnComplete).toBeTruthy();
    expect(grnComplete?.sql).toContain('completed_at = now()');
    expect(grnComplete?.sql).toContain("source_type = 'po'");
    expect(grnComplete?.sql).toContain("status = 'draft'");
    expect(grnComplete?.params).toEqual([ORG_A, PO_ID, USER_A]);

    // the completion runs after the grn_item insert (so the freeze trigger on
    // grn_items never sees a completed parent) and before commit
    const sqls = client.calls.map((call) => call.sql);
    const grnItemIdx = sqls.findIndex((sql) => sql.includes('insert into public.grn_items'));
    const completeIdx = sqls.findIndex((sql) => sql.includes("update public.grns set status = 'completed'"));
    const commitIdx = sqls.indexOf('commit');
    expect(completeIdx).toBeGreaterThan(grnItemIdx);
    expect(completeIdx).toBeLessThan(commitIdx);
  });

  it('leaves the GRN as draft on a partial receipt (PO still partially_received)', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: false });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-partial', qty: '2.000' });

    expect(result).toMatchObject({ ok: true, poStatus: 'partially_received' });
    // no completion update is issued while the PO is only partially received
    expect(client.calls.some((call) => call.sql.includes("update public.grns set status = 'completed'"))).toBe(false);
    expect(client.statements).toContain('commit');
  });

  it('completes only draft GRNs (idempotent — a second receive re-runs the no-op-safe flip)', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-idem' });

    // the flip is scoped to status = 'draft', so re-issuing it after the GRN is
    // already completed matches zero rows — no double-completion, no error
    const grnComplete = findCall(client, "update public.grns set status = 'completed'");
    expect(grnComplete?.sql).toContain("and status = 'draft'");
    // exactly one completion statement per receive that finalises the PO
    expect(client.calls.filter((call) => call.sql.includes("update public.grns set status = 'completed'"))).toHaveLength(
      1,
    );
  });

  it('emits warehouse.lp.received with the LP aggregate in the receive transaction', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-lp-received-event' });

    const outbox = findCall(client, 'insert into public.outbox_events');
    expect(outbox).toBeDefined();
    expect(outbox?.params[0]).toBe('warehouse.lp.received');
    expect(outbox?.params[1]).toBe('license_plate');
    expect(outbox?.params[2]).toBe('lp-1');
    expect(JSON.parse(String(outbox?.params[3]))).toMatchObject({
      lp_id: 'lp-1',
      grn_id: 'grn-1',
      item_id: ITEM_ID,
      qty: '10.5',
      uom: 'kg',
      org_id: ORG_A,
      actor: USER_A,
    });

    const sqls = client.calls.map((call) => call.sql);
    const historyIdx = sqls.findIndex((sql) => sql.includes('insert into public.lp_state_history'));
    const outboxIdx = sqls.findIndex((sql) => sql.includes('insert into public.outbox_events'));
    const commitIdx = sqls.indexOf('commit');
    expect(outboxIdx).toBeGreaterThan(historyIdx);
    expect(outboxIdx).toBeLessThan(commitIdx);
  });

  it('opens a pending QC inspection for the LP when require_grn_qc_inspection is ON', async () => {
    const client = makeReceiveClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      isReceived: true,
      requireGrnQc: true,
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-qc' });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1', qcInspectionRequired: true, inspectionId: 'insp-1' });

    // LP is immediately put away but held as pending QA, never auto-released
    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.sql).toContain("'available', 'pending'");

    // inspection insert: numbered via next_quality_inspection_number, org-scoped, lp-referenced,
    // site-scoped from the LP, guarded against a duplicate pending inspection for the same LP
    const inspInsert = findCall(client, 'insert into public.quality_inspections');
    expect(inspInsert).toBeTruthy();
    expect(inspInsert?.sql).toContain('org_id, site_id, inspection_number');
    expect(inspInsert?.sql).toContain('select $1::uuid, lp.site_id');
    expect(inspInsert?.sql).toContain('app.user_can_see_site(lp.site_id)');
    expect(inspInsert?.sql).toContain('public.next_quality_inspection_number($1::uuid)');
    expect(inspInsert?.sql).toContain('not exists');
    expect(inspInsert?.params).toEqual([ORG_A, 'lp-1', ITEM_ID, USER_A]);

    // flag is read once per receive
    expect(client.calls.filter((call) => call.sql.includes('from public.tenant_variations'))).toHaveLength(1);

    // replay payload carries the inspection so a retried op can answer without re-inserting
    expect(auditExt(client)).toMatchObject({ qcInspectionRequired: true, inspectionId: 'insp-1' });
    expect(client.statements).toContain('commit');
  });

  it('registers the txn-scoped org context INSIDE the transaction, before the QC allocator (review fix F1)', async () => {
    const client = makeReceiveClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      isReceived: true,
      requireGrnQc: true,
    });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-ctx' });

    // The pg mock records query order: begin → session token insert →
    // app.set_org_context → quality_inspections insert (allocator) → commit →
    // token cleanup. app.current_org_id() resolves via active_org_contexts
    // keyed on the txn's txid (mig 002), so registration MUST be in-txn.
    const sqls = client.calls.map((call) => call.sql);
    const beginIdx = sqls.indexOf('begin');
    const tokenIdx = sqls.findIndex((sql) => sql.includes('insert into app.session_org_contexts'));
    const setCtxIdx = sqls.findIndex((sql) => sql.includes('app.set_org_context'));
    const allocatorIdx = sqls.findIndex((sql) => sql.includes('insert into public.quality_inspections'));
    const commitIdx = sqls.indexOf('commit');
    const cleanupIdx = sqls.findIndex((sql) => sql.includes('delete from app.session_org_contexts'));

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeGreaterThan(beginIdx);
    expect(setCtxIdx).toBeGreaterThan(tokenIdx);
    expect(allocatorIdx).toBeGreaterThan(setCtxIdx);
    expect(commitIdx).toBeGreaterThan(allocatorIdx);
    expect(cleanupIdx).toBeGreaterThan(commitIdx);

    // the registered context binds the SESSION org and scanner user (org/user RLS discipline)
    expect(client.calls[tokenIdx]?.params?.[1]).toBe(ORG_A);
    expect(client.calls[tokenIdx]?.params?.[2]).toBe(USER_A);
    expect(client.calls[setCtxIdx]?.params?.[1]).toBe(ORG_A);
  });

  it('replaying a QC-flagged receive returns the inspection without inserting a duplicate', async () => {
    const client = makeReceiveClient({
      requireGrnQc: true,
      replayExt: {
        grnId: 'grn-1',
        grnNumber: 'GRN-20260611-0001',
        grnItemId: 'grn-item-1',
        lpId: 'lp-1',
        lpNumber: 'LP-1',
        qty: '2.5',
        uom: 'kg',
        overReceived: false,
        poStatus: 'partially_received',
        qcInspectionRequired: true,
        inspectionId: 'insp-1',
      },
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-qc-replay', qty: '2.5' });

    expect(result).toMatchObject({ ok: true, replay: true, qcInspectionRequired: true, inspectionId: 'insp-1' });
    expect(client.calls.some((call) => call.sql.includes('insert into public.quality_inspections'))).toBe(false);
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(client.statements).not.toContain('begin');
  });

  it('replays an existing client operation without double receiving', async () => {
    const client = makeReceiveClient({
      replayExt: {
        grnId: 'grn-1',
        grnNumber: 'GRN-20260611-0001',
        grnItemId: 'grn-item-1',
        lpId: 'lp-1',
        lpNumber: 'LP-1',
        qty: '2.5',
        uom: 'kg',
        overReceived: false,
        poStatus: 'partially_received',
      },
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-replay', qty: '2.5' });

    expect(result).toMatchObject({ ok: true, replay: true, lpNumber: 'LP-1', qty: '2.5' });
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(client.statements).not.toContain('begin');
  });

  it('replays a failed client operation as the original error envelope', async () => {
    const client = makeReceiveClient({
      replayResultCode: 'over_receive_cap',
      replayExt: {
        message: 'Cannot exceed 110% of the ordered quantity',
      },
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-failed-replay', qty: '2.5' });

    expect(result).toEqual({
      ok: false,
      reason: 'over_receive_cap',
      message: 'Cannot exceed 110% of the ordered quantity',
    });
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(client.statements).not.toContain('begin');
  });

  // LP insert params (audit F-B07): [org, site, warehouse, lpNumber, product, qty,
  // uom, batch, best_before, expiry, shelf_life_mode_snapshot, location, grn, user]
  it('writes the canonical expiry_date from the explicit best-before input (audit F-B07)', async () => {
    const client = makeReceiveClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      shelfLifeDays: 90,
      shelfLifeMode: 'use_by',
    });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-expiry-explicit' });

    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.sql).toContain('expiry_date');
    expect(lpInsert?.sql).toContain('shelf_life_mode_snapshot');
    expect(lpInsert?.params[8]).toBe('2026-07-01'); // best_before_date kept for back-compat
    expect(lpInsert?.params[9]).toBe('2026-07-01'); // expiry_date: explicit input wins over shelf life
    expect(lpInsert?.params[10]).toBe('use_by'); // snapshot from items.shelf_life_mode
  });

  it('computes expiry_date from items.shelf_life_days when no best-before is scanned', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 11)); // receive date 2026-06-11
    const client = makeReceiveClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      shelfLifeDays: 30,
      shelfLifeMode: 'best_before',
    });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-expiry-shelf', bestBefore: null });

    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.params[8]).toBeNull(); // no operator input → best_before_date stays null
    expect(lpInsert?.params[9]).toBe('2026-07-11'); // receive date + 30 days shelf life
    expect(lpInsert?.params[10]).toBe('best_before');
  });

  it('leaves expiry_date null when neither best-before nor item shelf life exists', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-expiry-none', bestBefore: null });

    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.params[8]).toBeNull();
    expect(lpInsert?.params[9]).toBeNull(); // FEFO orders NULL expiry last (mig 191 NULLS LAST)
    expect(lpInsert?.params[10]).toBeNull();
  });

  // ── lane W9-L8: optional destination location ──────────────────────────────
  // LP insert params: [org, siteId, warehouseId, lpNumber, productId, qty, uom,
  // batch, best_before, expiry, shelf_life_mode_snapshot, locationId, grnId, user]
  // GRN item params: [org, grnId, lineNumber, productId, poLineId, orderedQty,
  // receivedQty, uom, batch, bestBefore, locationId, lpId, user]

  it('puts the LP (and GRN item line) into a valid requested destination location + its warehouse', async () => {
    const client = makeReceiveClient({
      orderedQty: '20.000000',
      receivedQty: '0.000000',
      requestedLocation: { id: REQ_LOCATION_ID, warehouse_id: WAREHOUSE_ID },
    });

    const result = await receiveScannerPoLine(client, session, {
      ...input,
      clientOpId: 'op-dest',
      toLocationId: REQ_LOCATION_ID,
    });

    expect(result).toMatchObject({ ok: true, lpId: 'lp-1' });

    // org-scoped validation INSIDE the txn: lookup bound to session.org_id
    // (fragment 'and l.id =' is unique — 'pol.id = $2::uuid' must not match)
    const locLookup = findCall(client, 'and l.id = $2::uuid');
    expect(locLookup?.params).toEqual([ORG_A, REQ_LOCATION_ID]);
    const sqls = client.calls.map((call) => call.sql);
    expect(sqls.indexOf('begin')).toBeLessThan(sqls.findIndex((sql) => sql.includes('and l.id = $2::uuid')));

    // LP lands in the requested location with the session-site warehouse
    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.params[1]).toBe(SITE_ID);
    expect(lpInsert?.params[2]).toBe(WAREHOUSE_ID);
    expect(lpInsert?.params[11]).toBe(REQ_LOCATION_ID);

    // the GRN item line mirrors where the goods actually went
    const grnItemInsert = findCall(client, 'insert into public.grn_items');
    expect(grnItemInsert?.params[10]).toBe(REQ_LOCATION_ID);

    // GRN header keys on warehouse + actual destination location (P1-06)
    const grnInsert = findCall(client, 'insert into public.grns');
    expect(grnInsert?.params).toEqual(expect.arrayContaining([WAREHOUSE_ID, REQ_LOCATION_ID]));
    expect(client.statements).toContain('commit');
  });

  it('rejects an unknown/cross-org destination location with 422 invalid_location and receives nothing', async () => {
    const client = makeReceiveClient({ orderedQty: '20.000000', receivedQty: '0.000000' }); // no requestedLocation → lookup misses

    await expect(
      receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-dest-bad', toLocationId: REQ_LOCATION_ID }),
    ).rejects.toMatchObject({ code: 'invalid_location', status: 422 } satisfies Partial<ReceivePoError>);

    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(auditResult(client)).toBe('invalid_location');
    expect(client.statements).toContain('commit');
  });

  it('rejects a malformed destination location id with 422 before opening a transaction', async () => {
    const client = makeReceiveClient({ orderedQty: '20.000000', receivedQty: '0.000000' });

    await expect(
      receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-dest-shape', toLocationId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'invalid_location', status: 422 } satisfies Partial<ReceivePoError>);

    expect(client.statements).not.toContain('begin');
    expect(client.calls).toHaveLength(0);
  });

  it('keeps the default warehouse location when no destination is requested (legacy path unchanged)', async () => {
    const client = makeReceiveClient({ orderedQty: '20.000000', receivedQty: '0.000000' });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-dest-absent' });

    // no destination → the requested-location lookup never runs
    expect(client.calls.some((call) => call.sql.includes('and l.id = $2::uuid'))).toBe(false);
    const lpInsert = findCall(client, 'insert into public.license_plates');
    expect(lpInsert?.params[1]).toBe(SITE_ID);
    expect(lpInsert?.params[2]).toBe(WAREHOUSE_ID);
    expect(lpInsert?.params[11]).toBe(LOCATION_ID);
    const grnItemInsert = findCall(client, 'insert into public.grn_items');
    expect(grnItemInsert?.params[10]).toBe(LOCATION_ID);
  });

  it('uses the PO destination warehouse when no explicit destination location is supplied', async () => {
    const client = makeReceiveClient({
      orderedQty: '20.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: PO_DEST_WAREHOUSE_ID,
    });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-po-dest' });

    const warehouseLookup = findCall(client, 'from public.warehouses w');
    expect(warehouseLookup?.params).toEqual([null, PO_DEST_WAREHOUSE_ID, SITE_ID]);
    expect(findCall(client, 'insert into public.license_plates')?.params[2]).toBe(PO_DEST_WAREHOUSE_ID);
    expect(findCall(client, 'insert into public.license_plates')?.params[11]).toBe(PO_DEST_LOCATION_ID);
    expect(findCall(client, 'insert into public.grns')?.params).toEqual(
      expect.arrayContaining([PO_DEST_WAREHOUSE_ID, PO_DEST_LOCATION_ID]),
    );
  });

  it('lets an explicit destination location override the PO destination warehouse', async () => {
    const client = makeReceiveClient({
      orderedQty: '20.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: PO_DEST_WAREHOUSE_ID,
      requestedLocation: { id: REQ_LOCATION_ID, warehouse_id: WAREHOUSE_ID },
    });

    await receiveScannerPoLine(client, session, {
      ...input,
      clientOpId: 'op-explicit-over-po-dest',
      toLocationId: REQ_LOCATION_ID,
    });

    const warehouseLookup = findCall(client, 'from public.warehouses w');
    expect(warehouseLookup?.params).toEqual([WAREHOUSE_ID, PO_DEST_WAREHOUSE_ID, SITE_ID]);
    expect(findCall(client, 'insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
    expect(findCall(client, 'insert into public.license_plates')?.params[11]).toBe(REQ_LOCATION_ID);
  });

  it('falls back through site/default warehouse ordering when the PO has no destination warehouse', async () => {
    const client = makeReceiveClient({
      orderedQty: '20.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: null,
    });

    await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-po-no-dest' });

    const warehouseLookup = findCall(client, 'from public.warehouses w');
    expect(warehouseLookup?.params).toEqual([null, null, SITE_ID]);
    expect(warehouseLookup?.sql).toContain('w.site_id = $3::uuid');
    expect(warehouseLookup?.sql).toContain('w.is_default desc');
    expect(findCall(client, 'insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
  });

  it('falls back to an org warehouse when the session site has no linked/default warehouse', async () => {
    const client = makeReceiveClient({
      orderedQty: '20.000000',
      receivedQty: '0.000000',
      warehouse: { id: WAREHOUSE_ID, default_location_id: LOCATION_ID },
    });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-no-site-warehouse' });

    expect(result).toMatchObject({ ok: true, grnId: 'grn-1', lpId: 'lp-1' });
    expect(findCall(client, 'insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
    expect(auditResult(client)).toBe('ok');
    expect(client.statements).toContain('commit');
  });

  it('returns no_warehouse_for_site only when the org has no warehouses', async () => {
    const client = makeReceiveClient({ orderedQty: '20.000000', receivedQty: '0.000000', noWarehouse: true });

    const result = await receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-no-org-warehouse' });

    expect(result).toEqual({
      ok: false,
      reason: 'no_warehouse_for_site',
      message: 'No warehouse is configured for your site — set one in Settings -> Sites',
    });
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(auditResult(client)).toBe('no_warehouse_for_site');
    expect(client.statements).toContain('commit');
  });

  it('rejects over-receipt beyond the 10 percent cap', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '10.000000' });

    await expect(receiveScannerPoLine(client, session, { ...input, qty: '1.100001' })).rejects.toMatchObject({
      code: 'over_receive_cap',
      status: 409,
    } satisfies Partial<ReceivePoError>);

    expect(client.statements).toContain('commit');
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(auditResult(client)).toBe('over_receive_cap');
  });

  it('rejects cross-org PO lines because every lookup is filtered by session.org_id', async () => {
    const client = makeReceiveClient({ lineMissing: true });

    await expect(receiveScannerPoLine(client, session, input)).rejects.toMatchObject({
      code: 'po_line_not_found',
      status: 404,
    } satisfies Partial<ReceivePoError>);

    const lineLookup = findCall(client, 'from public.purchase_order_lines pol');
    expect(lineLookup?.params[0]).toBe(ORG_A);
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(auditResult(client)).toBe('not_found');
  });

  // F1 — malformed qty must surface as ReceivePoError invalid_qty 400, never as
  // ReceivePoLineCoreError (which the scanner route does not catch → 500).
  it('rejects a malformed qty as ReceivePoError invalid_qty 400 before opening a transaction (F1)', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    await expect(
      receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-bad-qty', qty: 'not-a-number' }),
    ).rejects.toMatchObject({ code: 'invalid_qty', status: 400, name: 'ReceivePoError' } satisfies Partial<ReceivePoError>);

    // must not open a transaction — validation fires before begin
    expect(client.statements).not.toContain('begin');
    expect(client.calls).toHaveLength(0);
  });

  // F4 — over-cap audit ext must include orderedQty and receivedQty for diagnostics.
  it('includes orderedQty and receivedQty in the over-cap audit ext (F4)', async () => {
    const client = makeReceiveClient({ orderedQty: '10.000000', receivedQty: '10.000000' });

    await expect(receiveScannerPoLine(client, session, { ...input, qty: '1.100001' })).rejects.toMatchObject({
      code: 'over_receive_cap',
      status: 409,
    } satisfies Partial<ReceivePoError>);

    const ext = auditExt(client);
    expect(ext).toMatchObject({
      poLineId: LINE_ID,
      requestedQty: '1.100001',
      orderedQty: '10.000000',
      receivedQty: '10.000000',
    });
  });

  it('rejects WAC-governed receipts with an unresolvable UoM before any GRN/LP/grn_item writes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeReceiveClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      uom: 'each',
      wacResolved: false,
    });

    await expect(
      receiveScannerPoLine(client, session, { ...input, clientOpId: 'op-wac-uom', qty: '5' }),
    ).rejects.toMatchObject({ code: 'unresolved_uom', status: 422 } satisfies Partial<ReceivePoError>);

    expect(client.calls.some((call) => call.sql.includes('insert into public.grns'))).toBe(false);
    expect(client.calls.some((call) => call.sql.includes('insert into public.license_plates'))).toBe(false);
    expect(client.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
    expect(client.statements).toContain('rollback');
    expect(client.statements).not.toContain('commit');
  });
});

type FakeClient = QueryClient & {
  calls: Array<{ sql: string; params: readonly unknown[] }>;
  statements: string[];
};

function makeReceiveClient(options: {
  orderedQty?: string;
  receivedQty?: string;
  isReceived?: boolean;
  lineMissing?: boolean;
  replayExt?: Record<string, unknown>;
  replayResultCode?: string;
  requireGrnQc?: boolean;
  shelfLifeDays?: number | null;
  shelfLifeMode?: string | null;
  requestedLocation?: { id: string; warehouse_id: string };
  destinationWarehouseId?: string | null;
  warehouse?: { id: string; default_location_id: string | null };
  noWarehouse?: boolean;
  grantedReceivePermission?: boolean;
  uom?: string;
  wacResolved?: boolean;
  poUnitPrice?: string | null;
  poCurrency?: string;
}): FakeClient {
  const calls: FakeClient['calls'] = [];
  const statements: string[] = [];
  return {
    calls,
    statements,
    async query<T = unknown>(sql: string, params: readonly unknown[] = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (['begin', 'commit', 'rollback'].includes(normalized)) {
        statements.push(normalized);
        return { rows: [] as T[], rowCount: null };
      }
      if (normalized.includes('from public.scanner_audit_log') && normalized.includes('client_op_id')) {
        return {
          rows: options.replayExt ? ([{ result_code: options.replayResultCode ?? 'ok', ext: options.replayExt }] as T[]) : ([] as T[]),
          rowCount: options.replayExt ? 1 : 0,
        };
      }
      if (normalized.includes('bool_and(coalesce(rec.received_qty')) {
        return { rows: [{ is_received: options.isReceived ?? false }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.purchase_order_lines pol')) {
        return {
          rows: options.lineMissing
            ? ([] as T[])
            : ([
                {
                  id: LINE_ID,
                  org_id: ORG_A,
                  po_id: PO_ID,
                  item_id: ITEM_ID,
                  supplier_id: SUPPLIER_ID,
                  destination_warehouse_id: options.destinationWarehouseId ?? null,
                  line_no: 1,
                  ordered_qty: options.orderedQty ?? '10.000000',
                  uom: options.uom ?? 'kg',
                  received_qty: options.receivedQty ?? '0.000000',
                  shelf_life_days: options.shelfLifeDays ?? null,
                  shelf_life_mode: options.shelfLifeMode ?? null,
                },
              ] as T[]),
          rowCount: options.lineMissing ? 0 : 1,
        };
      }
      // lane W9-L8 destination lookup: `l.id = $2::uuid` is unique to the
      // requested-location query (the warehouse default-location subquery
      // filters by warehouse, not by id).
      if (normalized.includes('from public.locations l') && normalized.includes('l.id = $2::uuid')) {
        return {
          rows: options.requestedLocation ? ([options.requestedLocation] as T[]) : ([] as T[]),
          rowCount: options.requestedLocation ? 1 : 0,
        };
      }
      if (normalized.includes('from public.warehouses w')) {
        if (options.noWarehouse) return { rows: [] as T[], rowCount: 0 };
        if (params[0] === WAREHOUSE_ID) {
          return { rows: [{ id: WAREHOUSE_ID, default_location_id: LOCATION_ID }] as T[], rowCount: 1 };
        }
        if (params[1] === PO_DEST_WAREHOUSE_ID) {
          return { rows: [{ id: PO_DEST_WAREHOUSE_ID, default_location_id: PO_DEST_LOCATION_ID }] as T[], rowCount: 1 };
        }
        return {
          rows: [options.warehouse ?? { id: WAREHOUSE_ID, default_location_id: LOCATION_ID }] as T[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.grns') && normalized.includes('status =')) {
        return { rows: [] as T[], rowCount: 0 };
      }
      if (normalized.includes("substring(grn_number from 'GRN-")) {
        return { rows: [{ seq: 1 }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.grns')) {
        return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('coalesce(max(line_number)')) {
        return { rows: [{ line_number: 1 }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.license_plates')) {
        return { rows: [{ id: 'lp-1' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.grn_items')) {
        return { rows: [{ id: 'grn-item-1' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.tenant_variations')) {
        return { rows: [{ require_qc: options.requireGrnQc ?? false }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.user_roles') && normalized.includes('app.current_user_is_platform_admin')) {
        const granted = options.grantedReceivePermission !== false;
        return { rows: granted ? ([{ ok: true }] as T[]) : ([] as T[]), rowCount: granted ? 1 : 0 };
      }
      if (normalized.includes('insert into public.quality_inspections')) {
        return { rows: [{ id: 'insp-1' }] as T[], rowCount: 1 };
      }
      if (normalized.includes('select pol.item_id::text, pol.unit_price::text as unit_price')) {
        if (options.poUnitPrice === null) {
          return { rows: [] as T[], rowCount: 0 };
        }
        return {
          rows: [
            {
              item_id: ITEM_ID,
              unit_price: options.poUnitPrice ?? '4.20',
              currency: options.poCurrency ?? 'GBP',
            },
          ] as T[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.items i') && normalized.includes('as qty_kg')) {
        const uom = String(params[1] ?? 'kg').toLowerCase();
        if (options.wacResolved === false || (uom !== 'kg' && options.wacResolved !== true)) {
          return { rows: [{ qty_kg: '0', resolved: false }] as T[], rowCount: 1 };
        }
        return { rows: [{ qty_kg: String(params[0] ?? '0'), resolved: true }] as T[], rowCount: 1 };
      }
      if (normalized.includes('from public.currencies') && normalized.includes('where code = $1')) {
        const code = String(params[0] ?? 'GBP');
        if (['EUR', 'GBP', 'USD'].includes(code)) {
          return { rows: [{ id: `currency-${code}` }] as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 0 };
      }
      if (normalized.startsWith('select ($1::numeric * coalesce($2::numeric, 0))::text as value')) {
        const left = Number(params[0] ?? 0);
        const right = Number(params[1] ?? 0);
        return { rows: [{ value: String(left * right) }] as T[], rowCount: 1 };
      }
      if (normalized.includes('insert into public.item_wac_state')) {
        return {
          rows: [{ totalQtyKg: String(params[2] ?? '0'), totalValue: String(params[3] ?? '0'), clamped: false }] as T[],
          rowCount: 1,
        };
      }
      if (normalized.includes('update public.grn_items') && normalized.includes('ext_jsonb')) {
        return { rows: [] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 1 };
    },
  };
}

function findCall(client: FakeClient, fragment: string) {
  return client.calls.find((call) => call.sql.includes(fragment));
}

function findCalls(client: FakeClient, fragment: string) {
  return client.calls.filter((call) => call.sql.includes(fragment));
}

function auditResult(client: FakeClient): unknown {
  return findCall(client, 'insert into public.scanner_audit_log')?.params[4];
}

function auditExt(client: FakeClient): Record<string, unknown> {
  const raw = findCall(client, 'insert into public.scanner_audit_log')?.params[6];
  return JSON.parse(String(raw)) as Record<string, unknown>;
}
