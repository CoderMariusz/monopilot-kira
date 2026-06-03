import type { EventType } from './events.enum.js';

/**
 * A message published to the queue by the outbox worker.
 */
export interface OutboxMessage {
  id: number | string;
  orgId: string;
  eventType: EventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  appVersion: string;
}

/**
 * Pluggable queue interface. Implementations must be at-least-once safe.
 *
 * Exported as an abstract class so that it survives TypeScript erasure and
 * can be checked at runtime (the RED-phase test does `expect(queue.Queue).toBeDefined()`).
 */
export abstract class Queue {
  abstract publish(message: OutboxMessage): Promise<void>;
}

/**
 * In-memory queue adapter used in tests and local development.
 * Messages are appended to the `messages` array in insertion order.
 */
export class InMemoryQueue extends Queue {
  public readonly messages: OutboxMessage[] = [];

  async publish(message: OutboxMessage): Promise<void> {
    this.messages.push(message);
  }
}

export default Queue;
