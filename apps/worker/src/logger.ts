export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = {
  job?: string;
  err?: unknown;
};

export type WorkerLogger = {
  debug: (msg: string, fields?: LogFields) => void;
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
};

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return err;
}

export function createLogger(minLevel: LogLevel = 'info'): WorkerLogger {
  function write(level: LogLevel, msg: string, fields: LogFields = {}) {
    if (levelRank[level] < levelRank[minLevel]) {
      return;
    }

    // [follow-up] T-117 replaces this console shim with @monopilot/observability
    // while preserving the WorkerLogger method shape used by the registry.
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(fields.job ? { job: fields.job } : {}),
      ...(fields.err ? { err: serializeError(fields.err) } : {}),
    });

    if (level === 'error') {
      console.error(line);
      return;
    }

    if (level === 'warn') {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
  };
}
