# @monopilot/observability

Shared observability primitives for MonoPilot services.

## Structured logger

`createLogger({ name, level, redactKeys })` returns a pino logger. The default
level is `process.env.LOG_LEVEL ?? 'info'`; callers may pass `level` for a local
override. In tests without a custom destination, the logger uses `pino-pretty`.
Production callers should rely on pino's default asynchronous destination.

The logger redacts sensitive fields before any line is written. The default
redact allowlist is:

- `password`
- `pin`
- `token`
- `access_token`
- `refresh_token`
- `mfa_secret`
- `scim_token_hash`
- `recovery_codes`
- `private_jsonb`
- `authorization`
- `cookie`
- `set-cookie`
- `database_url`
- `subject_id`
- `actor_user_id`
- `secret`
- `bearer`
- `api_key`

`database_url` keeps the scheme, username, host, and path visible while masking
only the password segment, for example
`postgres://user:[Redacted]@host/db`. `actor_user_id` is shortened to the first
eight characters so operators can correlate lines without logging the full
actor identifier. Other allowlisted keys are emitted as `[Redacted]`.

Use `redactKeys` to add more exact key names for a service; it extends the
default list rather than replacing it.
