const SECRET_KEY_PATTERN =
  /(?:password|pin|token|access_token|refresh_token|mfa_secret|scim_token_hash|recovery_codes|private_jsonb|authorization|cookie|set-cookie|database_url|subject_id|actor_user_id|secret|bearer|api_key)/i;

const REDACTED = '[Redacted]';

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitize(value: unknown, key?: string, seen = new WeakSet<object>()): unknown {
  if (key && SECRET_KEY_PATTERN.test(key)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, undefined, seen));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (seen.has(value)) {
    return REDACTED;
  }
  seen.add(value);

  const sanitized: JsonObject = {};
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    const nextValue = sanitize(nestedValue, nestedKey, seen);
    if (nextValue !== undefined) {
      sanitized[nestedKey] = nextValue;
    }
  }

  seen.delete(value);
  return sanitized;
}

export function redactBeforeSend<TEvent>(event: TEvent): TEvent {
  const sanitized = sanitize(event);
  if (!isPlainObject(sanitized)) {
    return event;
  }

  delete sanitized.user;

  return sanitized as TEvent;
}
