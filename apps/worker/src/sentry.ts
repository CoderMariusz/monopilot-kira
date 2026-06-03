import * as Sentry from '@sentry/node';
import { createLogger, redactBeforeSend } from '@monopilot/observability';

const initKey = Symbol.for('monopilot.sentry.worker.initialized');
const warnKey = Symbol.for('monopilot.sentry.worker.warned');
const state = globalThis as typeof globalThis & Record<symbol, boolean | undefined>;

export function initializeSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  const logger = createLogger({ name: 'sentry' });

  if (!dsn) {
    if (!state[warnKey]) {
      logger.warn('SENTRY_DSN is unset; Sentry worker SDK disabled');
      state[warnKey] = true;
    }
    return false;
  }

  if (state[initKey]) {
    return true;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA,
      tracesSampleRate: 0.1,
      beforeSend: redactBeforeSend,
    });
    state[initKey] = true;
    return true;
  } catch (err) {
    logger.warn({ err }, 'Sentry worker SDK init failed; continuing without error transport');
    return false;
  }
}

export function captureJobException(err: unknown, job: string): void {
  if (!state[initKey]) {
    return;
  }

  Sentry.captureException(err, {
    tags: {
      job,
    },
  });
}

initializeSentry();
