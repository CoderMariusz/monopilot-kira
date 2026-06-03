# Supabase deploy runbook

Deploy runbook for Monopilot Supabase Auth (GoTrue) configuration. These
settings are not in `.env` — they live in the Supabase project dashboard and
must be applied manually before go-live. The application code asserts the
expected values in comments (see `apps/web/app/(auth)/actions.ts` and
`apps/web/lib/auth/supabase-server.ts`) but cannot enforce them at runtime
without a verification script (see T-065).

---

## Required GoTrue settings (Auth > Settings in the Supabase dashboard)

| Setting | GoTrue config key | Required value | Where |
|---|---|---|---|
| Access token lifetime | `JWT_EXP` | `900` (15 minutes) | Auth > Settings > JWT expiry |
| Magic-link / OTP expiry | `MAILER_OTP_EXP` | `604800` (7 days) | Auth > Settings > OTP expiry |
| Refresh token rotation | `REFRESH_TOKEN_ROTATION_ENABLED` | `true` | Auth > Settings > Refresh Token Rotation |
| Refresh token reuse interval | `SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` | `10` seconds | Auth > Settings > Reuse Interval |

### Why 15-minute access tokens?

PRD §5.x locks the access token TTL at 15 minutes with rotating refresh tokens
as the security posture for all tenants. Supabase's default is **3600 seconds**
(1 hour), which exceeds the PRD requirement. Setting `JWT_EXP=900` ensures that
a stolen access token is usable for at most 15 minutes before the client must
call the refresh endpoint.

The application middleware at `apps/web/middleware.ts` relies on
`@supabase/ssr`'s automatic token refresh: on every request it checks the
expiry and transparently rotates the token when less than 60 seconds remain.
**If `JWT_EXP` is not set to 900, users may hold tokens valid for up to 1 hour
after they should have expired.**

### Why 7-day magic-link OTP expiry?

`MAILER_OTP_EXP` controls how long a Supabase magic-link or invitation OTP
remains valid before the GoTrue server rejects it. The PRD §5.x value is 7 days
to support async invitation workflows (an invitee may not check email for
several days). Supabase's default is 3600 seconds (1 hour), which is too short
for the invitation flow.

Note: the application also passes `options.data.ttl` as a JWT metadata claim so
consuming components can read the intended expiry, but this claim is
informational only — the actual enforcement is entirely on the GoTrue server
side via `MAILER_OTP_EXP`.

### Why refresh token rotation?

Rotating refresh tokens (`REFRESH_TOKEN_ROTATION_ENABLED=true`) ensures that
each use of a refresh token invalidates the previous one and issues a new one.
This prevents refresh-token replay attacks: if an attacker steals a refresh
token, using it after the legitimate client has already rotated it produces a
detection event (GoTrue logs a token reuse violation and invalidates the session
family).

`SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10` provides a 10-second grace window to
handle concurrent requests that may both attempt to use the same refresh token
before the first rotation completes (e.g. two browser tabs opening simultaneously
at session start).

---

## Applying the settings

### Via the Supabase dashboard

1. Go to the Supabase project dashboard.
2. Navigate to **Authentication > Settings**.
3. Under **JWT Settings**, set **JWT Expiry** to `900`.
4. Under **Email Settings**, set **OTP Expiry** to `604800`.
5. Under **Sessions**, enable **Refresh Token Rotation** and set the
   **Reuse Interval** to `10`.
6. Click **Save**.

### Via the GoTrue admin API (automated / CI)

The GoTrue admin API exposes config at `GET /admin/config`. To apply settings:

```bash
curl -X PATCH \
  "${SUPABASE_URL}/auth/v1/admin/config" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "jwt_exp": 900,
    "mailer_otp_exp": 604800,
    "refresh_token_rotation_enabled": true,
    "security_refresh_token_reuse_interval": 10
  }'
```

Replace `SUPABASE_URL` with your project URL (e.g. `https://<project>.supabase.co`)
and `SUPABASE_SERVICE_ROLE_KEY` with the service-role key from the project API
settings. **Never commit the service-role key.**

---

## Verifying the settings

Run the verification script (T-065) after applying:

```bash
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
pnpm verify:supabase
```

The script reads the live GoTrue config and exits non-zero if any value drifts
from the expected PRD §5.x values. See `scripts/verify-supabase-config.ts`.

---

## Rollback procedure

If a change to GoTrue settings causes authentication regressions:

1. Return `JWT_EXP` to the previous value via the dashboard or admin API.
2. Coordinate with any active sessions: existing access tokens remain valid
   until their embedded `exp` claim expires; no forced logout is needed for
   `JWT_EXP` changes. Refresh-token rotation changes take effect immediately
   for all new token refreshes.
3. If refresh token rotation was disabled (regression: attacker could replay old
   tokens), force-logout all sessions via **Authentication > Users > Sign out
   all users** in the dashboard, or via the Admin API:
   ```bash
   curl -X POST \
     "${SUPABASE_URL}/auth/v1/admin/users/<user_id>/logout" \
     -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
     -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
   ```
4. Re-apply the correct settings and run `pnpm verify:supabase` to confirm.

---

## Environment variable summary (for reference)

The following vars from `.env.example` are relevant to authentication but are
separate from the GoTrue server-side settings above:

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Project URL for Supabase client init |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key for RLS-scoped requests |

The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is used only by the
verification script and should never be set in the application's runtime
environment.

---

## Related runbooks

- `docs/runbooks/preview-supabase-bootstrap.md` — role-bootstrap and
  onboarding requirements for Supabase Preview environments.
