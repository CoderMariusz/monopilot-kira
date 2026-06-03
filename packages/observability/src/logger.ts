import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;
export type LogDestination = DestinationStream;

export type CreateLoggerOptions = {
  name?: string;
  level?: string;
  redactKeys?: string[];
};

const REDACTED = '[Redacted]';

const DEFAULT_REDACT_KEYS = [
  'password',
  'pin',
  'token',
  'access_token',
  'refresh_token',
  'mfa_secret',
  'scim_token_hash',
  'recovery_codes',
  'private_jsonb',
  'authorization',
  'cookie',
  'set-cookie',
  'database_url',
  'subject_id',
  'actor_user_id',
  'secret',
  'bearer',
  'api_key',
];

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function maskDatabaseUrl(value: unknown): unknown {
  if (typeof value !== 'string') {
    return REDACTED;
  }

  return value.replace(/^([^:]+:\/\/[^:@/]+):([^@]*)@/, `$1:${REDACTED}@`);
}

function redactValue(key: string, value: unknown): unknown {
  const normalized = normalizeKey(key);

  if (normalized === 'database_url') {
    return maskDatabaseUrl(value);
  }

  if (normalized === 'actor_user_id' && typeof value === 'string') {
    return value.slice(0, 8);
  }

  return REDACTED;
}

function sanitizeForLogging(value: unknown, redactKeys: Set<string>, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, redactKeys, seen));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(source)) {
    const normalized = normalizeKey(key);
    sanitized[key] = redactKeys.has(normalized)
      ? redactValue(normalized, nestedValue)
      : sanitizeForLogging(nestedValue, redactKeys, seen);
  }

  seen.delete(value);
  return sanitized;
}

export function createLogger(opts: CreateLoggerOptions = {}, destination?: LogDestination): Logger {
  const redactKeys = new Set([...DEFAULT_REDACT_KEYS, ...(opts.redactKeys ?? [])].map(normalizeKey));
  const options: pino.LoggerOptions = {
    name: opts.name,
    level: opts.level ?? process.env.LOG_LEVEL ?? 'info',
    serializers: {
      err: pino.stdSerializers.err,
    },
    formatters: {
      log(object) {
        return sanitizeForLogging(object, redactKeys) as Record<string, unknown>;
      },
    },
    redact: {
      paths: Array.from(redactKeys).filter(
        (key) => key !== 'database_url' && key !== 'actor_user_id',
      ),
      censor: REDACTED,
    },
  };

  if (process.env.NODE_ENV === 'test' && !destination) {
    options.transport = {
      target: 'pino-pretty',
    };
  }

  return destination ? pino(options, destination) : pino(options);
}
