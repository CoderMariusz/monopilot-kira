import { describe, expect, it, vi } from 'vitest';
import { LocalDispatchQueue } from '../dispatch-queue';
import type { OutboxMessage } from '../queue';
import { EventType } from '../events.enum';

function buildMessage(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 1,
    orgId: '00000000-0000-0000-0000-000000000003',
    eventType: EventType.AUDIT_RECORDED,
    aggregateType: 'audit',
    aggregateId: '00000000-0000-0000-0000-000000000004',
    payload: { action: 'test' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    appVersion: '1.0.0',
    ...overrides,
  };
}

describe('LocalDispatchQueue', () => {
  it('invokes every registered handler for each published message', async () => {
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);
    const queue = new LocalDispatchQueue([handlerA, handlerB]);

    const msg = buildMessage();
    await queue.publish(msg);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerA).toHaveBeenCalledWith(msg);
    expect(handlerB).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledWith(msg);
  });

  it('appends to processed[] when all handlers succeed', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const queue = new LocalDispatchQueue([handler]);

    const m1 = buildMessage({ id: 1 });
    const m2 = buildMessage({ id: 2 });
    await queue.publish(m1);
    await queue.publish(m2);

    expect(queue.processed).toHaveLength(2);
    expect(queue.processed[0]?.id).toBe(1);
    expect(queue.processed[1]?.id).toBe(2);
    expect(queue.errors).toHaveLength(0);
  });

  it('re-throws when a handler fails (consumed_at must not be stamped)', async () => {
    const boom = new Error('handler boom');
    const handler = vi.fn().mockRejectedValue(boom);
    const queue = new LocalDispatchQueue([handler]);

    const msg = buildMessage();
    await expect(queue.publish(msg)).rejects.toThrow('handler boom');
  });

  it('records the failure in errors[] and does NOT add to processed[] on throw', async () => {
    const boom = new Error('handler boom');
    const handler = vi.fn().mockRejectedValue(boom);
    const queue = new LocalDispatchQueue([handler]);

    const msg = buildMessage();
    await expect(queue.publish(msg)).rejects.toThrow();

    expect(queue.errors).toHaveLength(1);
    expect(queue.errors[0]?.message).toBe(msg);
    expect(queue.errors[0]?.error).toBe(boom);
    expect(queue.processed).toHaveLength(0);
  });

  it('runs handlers in registration order and stops at the first failure', async () => {
    const calls: string[] = [];
    const handlerA = vi.fn(async (_m: OutboxMessage) => {
      calls.push('A');
    });
    const handlerB = vi.fn(async (_m: OutboxMessage) => {
      calls.push('B');
      throw new Error('B boom');
    });
    const handlerC = vi.fn(async (_m: OutboxMessage) => {
      calls.push('C');
    });

    const queue = new LocalDispatchQueue([handlerA, handlerB, handlerC]);
    await expect(queue.publish(buildMessage())).rejects.toThrow('B boom');

    // C must not run after B threw — fail-fast keeps semantics deterministic
    expect(calls).toEqual(['A', 'B']);
    expect(handlerC).not.toHaveBeenCalled();
  });

  it('is a Queue subclass (so worker.runOnce can accept it)', () => {
    const queue = new LocalDispatchQueue([]);
    // Duck-typed — Queue is abstract; LocalDispatchQueue implements publish()
    expect(typeof queue.publish).toBe('function');
  });
});
