/**
 * D365-identity — pull accept path must not silently re-key item_code on existing rows.
 */
import { describe, expect, it, vi } from 'vitest';
import { processPullJob, type D365IncomingItem, type D365PullClient } from '../pull';

type QueryCall = { sql: string; params?: readonly unknown[] };

function mockClient(items: D365IncomingItem[]): D365PullClient {
  return { fetchItems: async () => items };
}

describe('D365 pull — item_code identity guard', () => {
  it('accept path UPDATE omits item_code and only syncs name/item_type', async () => {
    const calls: QueryCall[] = [];
    const itemId = '11111111-1111-4111-8111-111111111111';
    const orgId = '22222222-2222-4222-8222-222222222222';
    const d365ItemId = 'D365-SAME-CODE';
    const syncedAt = new Date(Date.now() - 86_400_000).toISOString();

    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'running'")) {
          return { rows: [] };
        }
        if (text.includes('from public.items') && text.includes('d365_item_id')) {
          return {
            rows: [{
              id: itemId,
              item_code: 'RM-LOCAL',
              name: 'Old name',
              item_type: 'rm',
              updated_at: syncedAt,
              d365_last_sync_at: syncedAt,
            }],
          };
        }
        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'completed'")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const incoming: D365IncomingItem = {
      d365_item_id: d365ItemId,
      item_code: 'RM-LOCAL',
      name: 'D365 name',
      item_type: 'rm',
      modified_at: new Date().toISOString(),
    };

    const result = await processPullJob(
      client,
      mockClient([incoming]),
      { id: 'job-1', org_id: orgId, target_entity: 'items' },
    );

    expect(result.drifted).toBe(0);
    expect(result.recordsProcessed).toBe(1);

    const acceptUpdate = calls.find(
      (call) =>
        call.sql.toLowerCase().includes('update public.items')
        && call.sql.toLowerCase().includes('d365_sync_status'),
    );
    expect(acceptUpdate).toBeDefined();
    expect(acceptUpdate!.sql.toLowerCase()).not.toMatch(/item_code\s*=/);
    expect(acceptUpdate!.params).toEqual([itemId, incoming.name, incoming.item_type]);
  });

  it('differing remote item_code on accept path routes to drift instead of rename', async () => {
    const calls: QueryCall[] = [];
    const itemId = '33333333-3333-4333-8333-333333333333';
    const orgId = '44444444-4444-4444-8444-444444444444';
    const d365ItemId = 'D365-REKEY';
    const syncedAt = new Date(Date.now() - 86_400_000).toISOString();

    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'running'")) {
          return { rows: [] };
        }
        if (text.includes('from public.items') && text.includes('d365_item_id')) {
          return {
            rows: [{
              id: itemId,
              item_code: 'RM-LOCAL',
              name: 'Local name',
              item_type: 'rm',
              updated_at: syncedAt,
              d365_last_sync_at: syncedAt,
            }],
          };
        }
        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'completed'")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const incoming: D365IncomingItem = {
      d365_item_id: d365ItemId,
      item_code: 'RM-FROM-D365',
      name: 'Local name',
      item_type: 'rm',
      modified_at: new Date().toISOString(),
    };

    const result = await processPullJob(
      client,
      mockClient([incoming]),
      { id: 'job-2', org_id: orgId, target_entity: 'items' },
    );

    expect(result.drifted).toBe(1);

    const driftAudit = calls.find(
      (call) => call.sql.toLowerCase().includes('insert into public.audit_log') && call.sql.toLowerCase().includes('d365_drift'),
    );
    expect(driftAudit).toBeDefined();

    const driftUpdate = calls.find(
      (call) =>
        call.sql.toLowerCase().includes('update public.items')
        && call.sql.toLowerCase().includes("d365_sync_status = 'drift'"),
    );
    expect(driftUpdate).toBeDefined();
    expect(driftUpdate!.params).toEqual([itemId]);

    const syncedUpdate = calls.find(
      (call) =>
        call.sql.toLowerCase().includes('update public.items')
        && call.sql.toLowerCase().includes("d365_sync_status = 'synced'"),
    );
    expect(syncedUpdate).toBeUndefined();
  });

  it('new-row import INSERTs item_code from D365', async () => {
    const calls: QueryCall[] = [];
    const orgId = '55555555-5555-4555-8555-555555555555';
    const d365ItemId = 'D365-NEW-ITEM';

    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'running'")) {
          return { rows: [] };
        }
        if (text.includes('from public.items') && text.includes('d365_item_id')) {
          return { rows: [] };
        }
        if (text.startsWith('update public.d365_sync_jobs') && text.includes("status = 'completed'")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const incoming: D365IncomingItem = {
      d365_item_id: d365ItemId,
      item_code: 'RM-NEW-FROM-D365',
      name: 'New D365 item',
      item_type: 'rm',
      modified_at: new Date().toISOString(),
    };

    const result = await processPullJob(
      client,
      mockClient([incoming]),
      { id: 'job-3', org_id: orgId, target_entity: 'items' },
    );

    expect(result.drifted).toBe(0);
    expect(result.recordsProcessed).toBe(1);

    const insert = calls.find(
      (call) => call.sql.toLowerCase().includes('insert into public.items'),
    );
    expect(insert).toBeDefined();
    expect(insert!.params).toEqual([
      orgId,
      incoming.item_code,
      incoming.item_type,
      incoming.name,
      incoming.d365_item_id,
    ]);
  });
});
