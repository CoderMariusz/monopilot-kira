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

type SimpleDailyCron = {
  minute: number;
  hour: number;
};

export class JobRegistry {
  private readonly entries = new Map<string, RegistryEntry>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly lastCronRuns = new Map<string, string>();
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
      if (entry.schedule.kind === 'cron') {
        const cron = parseSimpleDailyCron(entry.schedule.expr);
        if (!cron) {
          this.ctx.logger.warn('unsupported cron schedule skipped', {
            job: entry.name,
            expr: entry.schedule.expr,
          });
          continue;
        }

        const timer = setInterval(() => {
          const now = new Date();
          if (!isCronDue(entry.name, cron, now, this.lastCronRuns)) return;
          this.runEntry(entry).catch((err: unknown) => {
            this.ctx.logger.error('scheduled job failed', { job: entry.name, err });
          });
        }, 60_000);

        this.timers.add(timer);
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

function parseSimpleDailyCron(expr: string): SimpleDailyCron | null {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(expr.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { minute, hour };
}

function isCronDue(
  jobName: string,
  cron: SimpleDailyCron,
  now: Date,
  lastCronRuns: Map<string, string>,
): boolean {
  if (now.getMinutes() !== cron.minute || now.getHours() !== cron.hour) {
    return false;
  }

  const runKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (lastCronRuns.get(jobName) === runKey) {
    return false;
  }
  lastCronRuns.set(jobName, runKey);
  return true;
}
