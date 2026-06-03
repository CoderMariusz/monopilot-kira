import * as Sentry from '@sentry/nextjs';
import { createLogger, redactBeforeSend } from '@monopilot/observability';

const initKey = Symbol.for('monopilot.sentry.web.client.initialized');
const warnKey = Symbol.for('monopilot.sentry.web.client.warned');
const state = globalThis as typeof globalThis & Record<symbol, boolean | undefined>;

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  if (!state[warnKey]) {
    createLogger({ name: 'sentry' }).warn('SENTRY_DSN is unset; Sentry web client SDK disabled');
    state[warnKey] = true;
  }
} else if (!state[initKey]) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA,
    tracesSampleRate: 0.1,
    beforeSend: redactBeforeSend,
  });
  state[initKey] = true;
}
