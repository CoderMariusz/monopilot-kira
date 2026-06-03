# Cron route authentication — Vercel-only deploy assumption

Runbook documenting the authentication model for
`apps/web/app/api/internal/cron/*` routes and what operators must do when
deploying to a non-Vercel target.

---

## How the routes work on Vercel

The two cron routes are:

| Route | Method | Schedule (vercel.json) |
|---|---|---|
| `/api/internal/cron/drift` | `GET` | `0 2 * * *` (daily at 02:00 UTC) |
| `/api/internal/cron/outbox` | `POST` | configured in vercel.json (pending wave-2 wiring) |

Both routes share the same authentication logic (`authorizeCron`):

1. **Vercel platform header** — Vercel sets `x-vercel-cron: 1` on every
   scheduled invocation. This header is injected by the Vercel platform **after**
   the request reaches the edge; it cannot be set by an external caller
   (Vercel strips it from inbound user requests). The route trusts this header
   unconditionally on Vercel.

2. **Bearer token fallback** — `Authorization: Bearer <CRON_SECRET>`. The
   secret is compared using a constant-time comparison (`timingSafeEqual` via
   `@monopilot/db/system-actor-connection.js#cronBearerMatches`) to defeat
   timing oracles.

3. **Dev-only relaxed path** — when `CRON_SECRET` is unset AND
   `NODE_ENV === 'development'` AND `VERCEL_ENV` is unset (i.e. a local
   developer machine), any non-empty bearer is accepted. This convenience
   shortcut is explicitly gated on the absence of `VERCEL_ENV` so that Vercel
   Preview and staging deployments — which run with `NODE_ENV !== 'production'`
   but are internet-reachable — are not affected.

Source: `apps/web/app/api/internal/cron/drift/route.ts` and
`apps/web/app/api/internal/cron/outbox/route.ts`.

---

## The Vercel-only deploy assumption

The `x-vercel-cron` trust is only safe when the deployment target is Vercel.
On Vercel, the platform strips the header from all inbound HTTP requests before
forwarding them to the function; the header is added back only for legitimate
scheduled invocations. **Off Vercel, any caller can forge the header.**

`apps/web/vercel.json` registers the drift cron:

```json
{
  "crons": [
    {
      "path": "/api/internal/cron/drift",
      "schedule": "0 2 * * *"
    }
  ]
}
```

This file is the source of truth for the cron schedule on Vercel. The
`x-vercel-cron` trust model only holds as long as Vercel remains the deploy
target.

---

## Non-Vercel deployment: switch to Bearer-only

If the application is ever deployed to a non-Vercel target (e.g. AWS Lambda,
Azure Functions, a self-hosted Node.js server, or a Docker container behind an
API gateway), the `x-vercel-cron` path **must not be trusted**.

### Required changes for a non-Vercel target

1. **Remove `x-vercel-cron` trust** — the branch in `authorizeCron` that
   returns `{ ok: true }` on `x-vercel-cron: 1` must be removed or gated on an
   env var that confirms Vercel platform hosting.

2. **Require Bearer in all environments** — set `CRON_SECRET` to a 32-byte hex
   secret (generate with `openssl rand -hex 32`) and configure the external
   scheduler to pass `Authorization: Bearer <CRON_SECRET>` on every invocation.

3. **Register cron schedules with the external scheduler** — replace the
   `vercel.json` `crons` block with the equivalent configuration for your
   platform (e.g. AWS EventBridge, Azure Logic Apps, Kubernetes CronJob, or a
   simple `crontab` entry).

4. **Example curl for local testing after the switch**:
   ```bash
   curl -X GET \
     http://localhost:3000/api/internal/cron/drift \
     -H "Authorization: Bearer ${CRON_SECRET}"
   ```

### Minimal patch to `authorizeCron` for Bearer-only mode

```ts
function authorizeCron(req: Request): AuthDecision {
  const cronSecret = process.env.CRON_SECRET;
  // NOTE: x-vercel-cron trust removed for non-Vercel targets.
  // All callers must present a valid Bearer token.

  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const presented = authHeader.slice(7).trim();
    if (cronBearerMatches(presented, cronSecret)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'no_valid_auth' };
}
```

---

## Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | Required in production + Vercel Preview | Bearer secret for non-Vercel cron callers; generate with `openssl rand -hex 32` |
| `VERCEL_ENV` | Auto-set by Vercel | Prevents dev-only bearer relaxation on Preview/staging |
| `NODE_ENV` | Auto-set or explicit | Controls production fail-closed behaviour |

From `.env.example`:

```bash
# Required (production): Bearer secret for the internal cron routes.
# Generate with: openssl rand -hex 32
CRON_SECRET="change-me-generate-with-openssl-rand-hex-32"
```

---

## Security notes

- On Vercel, `x-vercel-cron` requests are also implicitly authenticated by the
  Vercel platform — no external caller can reach the function with that header
  set. The Bearer path is an additional fallback for Vercel Cron-less manual
  invocations (e.g. ops debugging via curl).
- `CRON_SECRET` must be rotated if it is ever exposed. Rotation is immediate:
  update the secret in Vercel project settings (or the deployment environment)
  and restart the deployment. Existing in-flight cron requests complete with the
  old secret; the next scheduled tick uses the new secret.
- Never log the value of `CRON_SECRET` or the `Authorization` header.

---

## Related

- `apps/web/vercel.json` — cron schedule registration.
- `apps/web/app/api/internal/cron/drift/route.ts` — drift detection cron.
- `apps/web/app/api/internal/cron/outbox/route.ts` — outbox worker cron.
- `docs/runbooks/preview-supabase-bootstrap.md` — Supabase Preview env setup.
