import type { Pool } from 'pg';

import type { WorkerLogger } from './logger.js';

export type Logger = WorkerLogger;

export type JobSchedule =
  | { kind: 'interval'; everyMs: number }
  | { kind: 'cron'; expr: string };

export type JobContext = {
  pool: Pool;
  logger: Logger;
  signal: AbortSignal;
};

export type JobHandler = (ctx: JobContext) => Promise<void>;

type RegistryEntry = {
  name: string;
  schedule: JobSchedule;
  handler: JobHandler;
};

export class JobRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly abortController = new AbortController();
  private started = false;
  private shuttingDown = false;

  constructor(private readonly ctx: Omit<JobContext, 'signal'>) {}

  register(name: string, schedule: JobSchedule, handler: JobHandler): void {
    if (this.started) {
      throw new Error(`Cannot register job "${name}" after registry start.`);
    }

    if (this.entries.has(name)) {
      throw new Error(`Job "${name}" is already registered.`);
    }

    if (schedule.kind === 'interval' && schedule.everyMs <= 0) {
      throw new Error(`Job "${name}" interval must be positive.`);
    }

    this.entries.set(name, { name, schedule, handler });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    for (const entry of this.entries.values()) {
      if (entry.schedule.kind !== 'interval') {
        this.ctx.logger.warn('cron schedule skipped; cron evaluation is deferred', {
          job: entry.name,
        });
        continue;
      }

      const timer = setInterval(() => {
        this.runEntry(entry).catch((err: unknown) => {
          this.ctx.logger.error('scheduled job failed', { job: entry.name, err });
        });
      }, entry.schedule.everyMs);

      this.timers.add(timer);
    }
  }

  async runOnceForTest(name: string): Promise<void> {
    const entry = this.entries.get(name);

    if (!entry) {
      throw new Error(`Job "${name}" is not registered.`);
    }

    await this.runEntry(entry);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      await this.waitForInFlight();
      return;
    }

    this.shuttingDown = true;
    this.abortController.abort();

    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();

    await this.waitForInFlight();
  }

  private async runEntry(entry: RegistryEntry): Promise<void> {
    if (this.shuttingDown) {
      throw new Error(`Cannot run job "${entry.name}" while registry is shutting down.`);
    }

    const run = entry.handler({
      ...this.ctx,
      signal: this.abortController.signal,
    });

    this.inFlight.add(run);

    try {
      await run;
    } finally {
      this.inFlight.delete(run);
    }
  }

  private async waitForInFlight(): Promise<void> {
    const settled = await Promise.allSettled(Array.from(this.inFlight));
    for (const result of settled) {
      if (result.status === 'rejected') {
        this.ctx.logger.error('job rejected during shutdown', { err: result.reason });
      }
    }
  }
}
