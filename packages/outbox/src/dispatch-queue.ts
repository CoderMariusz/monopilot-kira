/**
 * LocalDispatchQueue — in-process queue that synchronously fans messages out
 * to the registered handler list at publish() time.
 *
 * Why this exists (vs. InMemoryQueue):
 *   The cron route's previous wiring used InMemoryQueue, which only appended
 *   messages to an internal array and then dropped them at request end. That
 *   left cascade events (`fg.intermediate_code_changed`, `tenant.migration.*`,
 *   etc.) in limbo: rows in `outbox_events` were stamped consumed_at, but no
 *   handler ever ran. LocalDispatchQueue closes that gap by invoking handlers
 *   inline during runOnce() — BEFORE the worker stamps consumed_at — so a
 *   handler throw aborts the stamp and the row stays in the outbox for the
 *   next cron tick (at-least-once retry).
 *
 * Error semantics: re-throw on any handler failure. The runOnce() loop
 * propagates the throw, which means consumed_at is NOT updated for that row.
 * The `errors` array is still populated for observability before the re-throw.
 */
import { Queue, type OutboxMessage } from './queue.js';

export type MessageHandler = (msg: OutboxMessage) => Promise<void>;

export class LocalDispatchQueue extends Queue {
  private readonly handlers: MessageHandler[];
  public readonly processed: OutboxMessage[] = [];
  public readonly errors: Array<{ message: OutboxMessage; error: unknown }> = [];

  constructor(handlers: MessageHandler[]) {
    super();
    this.handlers = handlers;
  }

  async publish(message: OutboxMessage): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(message);
      } catch (err) {
        this.errors.push({ message, error: err });
        // Re-throw so runOnce skips the consumed_at stamp for this row.
        // At-least-once: the row remains in outbox_events for the next tick.
        throw err;
      }
    }
    this.processed.push(message);
  }
}
