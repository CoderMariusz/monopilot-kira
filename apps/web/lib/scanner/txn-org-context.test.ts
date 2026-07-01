import { describe, expect, it, vi } from 'vitest';

import { registerTxnOrgContext, withTxnOrgContext, type TxnOrgContextClient } from './txn-org-context';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function makeClient(): TxnOrgContextClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  };
}

describe('scanner txn org context', () => {
  it('registers the trusted scanner user id with the org context row', async () => {
    const client = makeClient();

    await registerTxnOrgContext(client, ORG_ID, USER_ID);

    const insert = client.query.mock.calls.find(([sql]) => String(sql).includes('insert into app.session_org_contexts'));
    expect(insert).toBeDefined();
    expect(String(insert?.[0])).toContain('(session_token, org_id, user_id)');
    expect(insert?.[1]).toEqual([expect.any(String), ORG_ID, USER_ID]);
  });

  it('threads user id through the transaction wrapper before running work', async () => {
    const client = makeClient();

    await withTxnOrgContext(client, ORG_ID, USER_ID, async () => {
      await client.query('select app.current_user_id()');
    });

    const calls = client.query.mock.calls.map(([sql]) => String(sql));
    const beginIdx = calls.indexOf('begin');
    const insertIdx = calls.findIndex((sql) => sql.includes('insert into app.session_org_contexts'));
    const workIdx = calls.indexOf('select app.current_user_id()');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(beginIdx);
    expect(workIdx).toBeGreaterThan(insertIdx);
    expect(client.query.mock.calls[insertIdx]?.[1]).toEqual([expect.any(String), ORG_ID, USER_ID]);
  });
});
