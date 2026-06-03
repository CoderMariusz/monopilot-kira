import { describe, expect, it, vi } from 'vitest';
import { LocalDispatchQueue } from '../dispatch-queue';
import { EventType } from '../events.enum';
import type { OutboxMessage } from '../queue';

function buildMessage(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 'evt-107',
    orgId: '00000000-0000-0000-0000-000000000003',
    eventType: EventType.AUDIT_RECORDED,
    aggregateType: 'audit',
    aggregateId: '00000000-0000-0000-0000-000000000004',
    payload: { action: 'test', secret: 'do-not-report' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    appVersion: '1.0.0',
    ...overrides,
  };
}

describe('LocalDispatchQueue error surfacing', () => {
  it('reports dispatch failures with the error and event_id', async () => {
    const boom = new Error('handler boom');
    const handler = vi.fn().mockRejectedValue(boom);
    const reportError = vi.fn();
    const queue = new LocalDispatchQueue([handler], { reportError });

    await expect(queue.publish(buildMessage())).rejects.toThrow('handler boom');

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(boom, { event_id: 'evt-107' });
  });

  it('continues accepting later messages when reportError is unset', async () => {
    const boom = new Error('handler boom');
    const handler = vi
      .fn()
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(undefined);
    const queue = new LocalDispatchQueue([handler]);

    await expect(queue.publish(buildMessage({ id: 'evt-failed' }))).rejects.toThrow(
      'handler boom',
    );
    await expect(queue.publish(buildMessage({ id: 'evt-next' }))).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(queue.errors).toHaveLength(1);
    expect(queue.processed).toHaveLength(1);
    expect(queue.processed[0]?.id).toBe('evt-next');
  });
});
