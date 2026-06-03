import { Writable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../logger.js';

function createMemoryDestination() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  return {
    lines,
    stream,
    output: () => lines.join(''),
  };
}

describe('createLogger', () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.resetModules();
  });

  it('redacts secret-bearing top-level keys without redacting safe payload fields', () => {
    const destination = createMemoryDestination();
    const logger = createLogger({ name: 'test' }, destination.stream);

    logger.info({ password: 'p4ss', token: 'tok', payload: 'ok' }, 'msg');

    const output = destination.output();
    expect(output).toContain('"password":"[Redacted]"');
    expect(output).toContain('"token":"[Redacted]"');
    expect(output).toContain('"payload":"ok"');
    expect(output).toContain('"msg":"msg"');
  });

  it('masks only the password section of database URLs', () => {
    const destination = createMemoryDestination();
    const logger = createLogger({ name: 'test', redactKeys: ['database_url'] }, destination.stream);

    logger.info({ database_url: 'postgres://user:secret@host/db' }, 'db');

    const output = destination.output();
    expect(output).toContain('"database_url":"postgres://user:[Redacted]@host/db"');
  });

  it('shortens actor_user_id values to the first eight characters', () => {
    const destination = createMemoryDestination();
    const logger = createLogger({ name: 'test' }, destination.stream);

    logger.info({ user: { actor_user_id: 'abc-123-very-long' } }, 'actor');

    expect(destination.output()).toContain('"actor_user_id":"abc-123-"');
  });

  it('uses LOG_LEVEL to drop lower-priority lines', () => {
    process.env.LOG_LEVEL = 'warn';
    const destination = createMemoryDestination();
    const logger = createLogger({ name: 'test' }, destination.stream);

    logger.info('skip');

    expect(destination.output()).toBe('');
  });

  it('backs the worker logger with JSON lines named worker and shared redaction', async () => {
    const destination = createMemoryDestination();
    const workerLoggerPath = new URL('../../../../apps/worker/src/logger.ts', import.meta.url).href;
    const { createLogger: createWorkerLogger } = await import(/* @vite-ignore */ workerLoggerPath);
    const logger = createWorkerLogger('info', destination.stream);

    logger.info('worker msg', {
      job: 'example',
      password: 'p4ss',
      user: { actor_user_id: 'abc-123-very-long' },
    });

    const output = destination.output();
    expect(output).toContain('"name":"worker"');
    expect(output).toContain('"msg":"worker msg"');
    expect(output).toContain('"job":"example"');
    expect(output).toContain('"password":"[Redacted]"');
    expect(output).toContain('"actor_user_id":"abc-123-"');
  });
});
