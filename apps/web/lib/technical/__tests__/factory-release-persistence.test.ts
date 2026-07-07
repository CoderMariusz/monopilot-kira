import { describe, expect, it } from 'vitest';

import {
  FACTORY_RELEASE_EVENT_APP_VERSION,
  RELEASED_TO_FACTORY_EVENT,
  insertReleasedToFactoryEvent,
} from '../factory-release-persistence';

describe('factory-release-persistence', () => {
  it('emits the canonical fg.released_to_factory event shape for non-NPD technical release', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const client = {
      async query<T>(sql: string, params?: readonly unknown[]) {
        calls.push({ sql, params });
        if (sql.includes('insert into public.outbox_events')) {
          return { rows: [{ id: 77 }] as T[] };
        }
        return { rows: [] as T[] };
      },
    };

    const eventId = await insertReleasedToFactoryEvent(
      { orgId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', client },
      {
        productCode: 'FG5101',
        activeBomHeaderId: '33333333-3333-4333-8333-333333333333',
        activeFactorySpecId: '44444444-4444-4444-8444-444444444444',
      },
    );

    expect(eventId).toBe(77);
    const insert = calls.find((call) => call.sql.includes('insert into public.outbox_events'));
    expect(insert?.params?.[0]).toBe(RELEASED_TO_FACTORY_EVENT);
    expect(insert?.params?.[1]).toBe('FG5101');
    expect(insert?.params?.[3]).toBe(FACTORY_RELEASE_EVENT_APP_VERSION);
    expect(insert?.params?.[4]).toBe(
      `${FACTORY_RELEASE_EVENT_APP_VERSION}:FG5101:released-to-factory:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444`,
    );
    expect(JSON.parse(String(insert?.params?.[2]))).toMatchObject({
      productCode: 'FG5101',
      activeBomHeaderId: '33333333-3333-4333-8333-333333333333',
      activeFactorySpecId: '44444444-4444-4444-8444-444444444444',
    });
  });
});
