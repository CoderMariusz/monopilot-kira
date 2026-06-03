import { createLogger as createStructuredLogger, type LogDestination } from '@monopilot/observability';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown> & {
  job?: string;
  err?: unknown;
};

export type WorkerLogger = {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
};

export function createLogger(minLevel: LogLevel = 'info', destination?: LogDestination): WorkerLogger {
  const logger = createStructuredLogger({ name: 'worker', level: minLevel }, destination);

  function write(level: LogLevel, msg: string, fields: LogFields = {}) {
    logger[level](fields, msg);
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}
