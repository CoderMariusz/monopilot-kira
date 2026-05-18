---
name: MON-foundation-primitives
description: Use when implementing any task that touches T-111 (apps/worker), T-112 (outbox), T-113 (GDPR), T-117 (pino), T-118 (Sentry), T-121 (rate-limit), T-124 (e-sign), T-125 (withOrgContext). Required reading whenever a task has cross-mod dep on 00-foundation.
version: 1.0.0
model: opus
canonical_spec: _meta/audits/2026-05-14-foundation-primitives-additions.md
---

# MON-foundation-primitives — Cross-cutting Foundation Primitives Playbook

**Purpose:** implementation guidance for any atomic task that consumes one or more of the foundation primitives T-111..T-125. These primitives are SHARED contracts; every module must consume them correctly or it will drift, leak PII, bypass tenancy, or break the outbox.

**Why this skill exists:** the 2026-05-14 audits (`foundation-primitives-additions.md` + `tenant-context-remediation.md`) introduced 15 cross-cutting tasks that every module silently depends on (apps/worker, outbox, GDPR registry, observability stack, rate-limit middleware, e-sign primitive, `withOrgContext` HOF). Module tasks routinely under-specify these dependencies. Re-deriving the contract per task wastes Opus tokens and reintroduces drift.

## When to use

- Implementing a task whose `pipeline_inputs.dependencies` references any of T-111..T-125
- Implementing a task whose `details` or `prompt` mention: outbox, worker, GDPR / erasure, rate-limit, e-sign / signEvent / dualSign, `withOrgContext`, pino logger, Sentry, OTel
- Adding a new domain event (anywhere) — outbox + event-naming sections apply
- Adding a new PII column to any module — GDPR registry section applies
- Adding any DB-touching Server Action or worker handler — `withOrgContext` section is mandatory

## Do NOT use when

- Pure UI task with no Server Action / no DB read — use `MON-t3-ui`
- Foundation-internal task (T-111..T-125 itself) — those tasks ARE the contracts; you implement the contract, you do not consume it
- Module schema work alone (no event, no PII, no rate-limit) — use `MON-t1-schema`

## Required reading (load in this order, every time)

1. `_meta/audits/2026-05-14-foundation-primitives-additions.md` — canonical spec for T-111..T-124, P0 list, contracts table
2. `_meta/audits/2026-05-14-tenant-context-remediation.md` — T-125 `withOrgContext` HOF + setter signature `app.set_org_context(session_token uuid, org uuid)` + canonical RLS reader `app.current_org_id()`
3. `_foundation/contracts/gdpr.md` — GDPR registry + dispatcher contract (created by T-113; if absent, read T-113.json prompt)
4. `_foundation/contracts/backup-policy.md` — T-119/T-120 RPO≤24h / RTO≤8h contract (created by T-119; if absent, read T-119.json prompt)
5. `_meta/specs/event-naming-convention.md` — outbox `event_type` format authority
6. The target task JSON — `scope_files`, `acceptance_criteria`, `risk_red_lines` are normative; do not exceed them

## Primitive index

| Primitive | Task ID | Package/path | What it provides | When to use |
|---|---|---|---|---|
| apps/worker | T-111 | `apps/worker/` | Long-running ops + outbox consumer entrypoint + JobRegistry + SIGTERM drain | Any op > 1s expected, or async fan-out |
| outbox | T-112 | `packages/db/src/outbox.ts` + `packages/db/migrations/*outbox*.sql` | Transactional event log + dispatcher (5s interval job) + retry + dead-letter | Every domain event published outside the writing service |
| GDPR registry | T-113 | `packages/gdpr/` + `_foundation/contracts/gdpr.md` | Per-domain ErasureHandler registry + tx-scoped runErasure dispatcher | Any new table containing PII; any export/erasure endpoint |
| GDPR cron | T-114 | `apps/worker/` (job) + `gdpr_erasure_requests` migration | SKIP LOCKED cron, state machine pending→running→completed/failed | Module-side erasure handler registration only — wire via T-113 |
| pino logger | T-117 | `packages/observability/src/logger.ts` | Structured logs with redaction allowlist (password/pin/token/subject_id/actor_user_id) | All server-side logging |
| Sentry | T-118 | `packages/observability/src/sentry.ts` + `@sentry/nextjs` + `@sentry/node` | Error tracking (apps/web client+server+edge + apps/worker) + release tagging | Server Actions + worker tasks |
| OpenTelemetry | T-116 | `packages/observability/src/otel.ts` | NodeSDK + OTLP exporter + instrumentation.ts | Server-side critical paths (Server Actions, worker jobs) |
| rate-limit | T-121 | `packages/rate-limit/` + `apps/web/middleware.ts` bind | Token-bucket per (org_id, action, user) — Upstash or in-memory | Auth, OTP/PIN, magic-link, SAML, SCIM, expensive analytics |
| e-sign | T-124 | `packages/e-sign/src/` + `e_sign_log` RLS table | `signEvent`, `dualSign`, replay-nonce guard, CFR 21 Part 11 audit, paired audit_events (`retention_class='security'`) | NCR close, LOTO, calibration, BOL release, any state transition requiring e-signature |
| withOrgContext | T-125 | `packages/db/src/with-org-context.ts` + `apps/web/lib/auth/with-org-context-route.ts` | HOF wrapping all DB calls; sets `app.session_org_contexts` row + calls `app.set_org_context(session_token, org_id)` | Every Server Action / route handler / worker task touching DB |
| Backup policy | T-119 | `_foundation/contracts/backup-policy.md` + `apps/worker` verification cron | RPO≤24h / RTO≤8h spec + `backup.verification.{succeeded,failed}` audit rows | Reference when discussing recovery; do not re-spec |
| Restore drill | T-120 | `tooling/restore-drill/` script | Logical restore + smoke-query suite (schema, RLS, org-context, audit_events, outbox) | Quarterly cron only — not module work |

## T-111 apps/worker pattern

`apps/worker` is the single long-running Node service (alongside `apps/web`). It hosts every background concern:

- Outbox dispatcher (T-112) — 5s interval, drains `outbox_events` → publisher → mark `dispatched_at`
- GDPR erasure cron (T-114) — pending→running→completed/failed state machine, SKIP LOCKED
- Backup verification cron (T-119) — writes `backup.verification.{succeeded,failed}` to `audit_events`
- Future: PM scheduling, OEE rollups, D365 dispatch, label print fan-out

Contract:

- `JobRegistry` interface — `register(name, fn, intervalMs)`; jobs are intervals only in P1 (cron-expression scheduler is out of scope; advisory follow-up #4 in primitives audit)
- Env loader is **Zod fail-closed** at boot — missing required env crashes the process; never default-fallback secrets
- Shutdown — SIGTERM drain: stop interval pollers, await in-flight handlers (with timeout), close DB pool, exit 0
- Heartbeat — every job logs `{ job, runId, durationMs, status }` via pino (T-117); long-running jobs emit periodic heartbeat logs
- Retry — exponential backoff with dead-letter (`outbox_dead_letter` for T-112; per-handler policy for cron jobs)

When adding a job:

1. Register in `apps/worker/src/jobs/index.ts` via `register(name, handler, intervalMs)`
2. Handler is `async (ctx) => …` — `ctx` provides `db` (already `withOrgContext`-wrapped per row), `logger` (pino child with `job` field), `signal` (AbortSignal for SIGTERM)
3. Wrap all DB work in `withOrgContext` even inside the worker — the worker may iterate multi-tenant rows; per-row org context is mandatory
4. Emit pino logs at info on success, error on failure (full stack via Sentry capture)

## T-112 outbox pattern (CRITICAL)

**Schema:**

```sql
outbox_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  varchar(64) NOT NULL,
  payload     jsonb NOT NULL,
  org_id      uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz NULL,
  attempts    int NOT NULL DEFAULT 0
)
-- + outbox_dead_letter for permanently-failed rows (T-112 ships this)
```

**Producer rule (load-bearing):**

```ts
await db.transaction(async tx => {
  await tx.update(orders).set({ status: 'released' }).where(eq(orders.id, id));
  await tx.insert(outboxEvents).values({
    event_type: 'shipping.so.released', // see naming convention §
    org_id,
    payload: { order_id: id, released_by: user_id, released_at: now }
  });
});
```

INSERT into outbox **MUST be in the same transaction** as the state change. Otherwise consumers will see events for state that rolled back, or miss events when the state insert succeeds and the outbox insert fails.

**Consumer:** the dispatcher (T-112) is registered in `apps/worker` as a 5s interval `runOnce` job. It SELECTs unprocessed rows FOR UPDATE SKIP LOCKED, calls the publisher (P1 ships `LoggingQueue` stub — Azure Service Bus adapter is follow-up #3), marks `dispatched_at`, and increments `attempts` on failure. Dead-letter after N retries.

**`event_type` width:** migration 053 widened `event_type` to `varchar(64)`. Stay well under — current max in registry is ~30 chars (`quality.ccp_out_of_spec`). Never exceed 64.

**Never `JSON.parse(payload)`** at consume time — parse via the Zod schema declared for that event type. Untyped consumers are how silent contract drift starts.

## Event naming convention (embedded summary)

Authority: `_meta/specs/event-naming-convention.md`. Rules:

1. **Format:** ISA-95 dot format `<aggregate>.<verb_phrase>` (e.g., `fa.created`, `shipment.epcis_commissioning`) — NOT 3-segment `<module>.<entity>.<verb>`. The aggregate prefix is registered in the spec; modules do not invent new aggregates without a registry update in the same PR.
2. **Case:** lowercase, snake_case verb phrase. `fa.created` ✅; `FA.Created` / `fa.Create` / `faCreated` ❌
3. **Tense:** verbs are past-tense — state already changed. `wo.completed` ✅; `wo.complete` ❌
4. **No PII in `event_type`** — never `user.<email>.invited` or `fa.<sku>.created`; identifiers go in `payload`
5. **Always include `org_id`** in the outbox row (column) AND in `payload` for downstream consumers — never assume the queue topic carries it
6. **New aggregate prefix?** Add to the registry in `_meta/specs/event-naming-convention.md` AND to `lib/outbox/events.enum.ts` SoT in the same PR
7. **Topic routing key is separate:** `<tenant>/<site>/<area>/<line>/<event_type>` — that is queue-layer, not the `event_type` column

Registered prefixes today: `fa.*`, `brief.*`, `org.*`, `user.*`, `role.*`, `lp.*`, `wo.*`, `audit.*`, `quality.*`, `shipment.*`. `product.*` is reserved for product-master events — NOT a synonym for `fa.*`.

## T-113 / T-114 GDPR pattern

**Two halves:**

1. **Registry (T-113):** `_foundation/contracts/gdpr.md` lists every PII column by `(table, column, subject_type, retention_class, erasure_strategy)`. Implementation: `registerErasureHandler(domain, fn)` in `packages/gdpr`. Each domain module owns ONE handler that anonymizes/deletes its rows for a given `subject_id`. Handlers are tx-scoped (the dispatcher runs each handler inside a single transaction so partial erasure is impossible).
2. **Cron (T-114):** `apps/worker` job reads `gdpr_erasure_requests` (state machine: pending → running → completed/failed) via SELECT FOR UPDATE SKIP LOCKED, calls every registered handler for that subject, transitions the row.

**Rules when adding a new PII column:**

- Add the column to `_foundation/contracts/gdpr.md` registry **in the same PR as the migration** — non-negotiable; CI enforces or will soon (follow-up)
- Choose `erasure_strategy ∈ {anonymize, delete, retain_with_legal_basis}` deliberately
- If your module is the first to hold PII for `subject_type=X`, write a T-115-style wire-up task that calls `registerErasureHandler('your-domain', yourFn)` and proves erasure works end-to-end (existing example: T-115 wires NPD T-089)
- Log via pino — but ensure `subject_id` and PII fields are in the redaction allowlist (T-117). The contract requires the logger NEVER persists raw subject_id post-erasure

**Module-side follow-ups** (advisory #1 in primitives audit): Warehouse `signed_by`, Scanner `operator_id`, Quality e-sign signers, Production WO actor cols, Settings users each need a wire-up task analogous to T-115.

## T-117 pino logger pattern

Re-export: `import { logger } from '@monopilot/observability'`.

Usage:

```ts
logger.info({ orderId, orgId, userId }, 'order released');
logger.error({ err, orderId }, 'order release failed');
```

Rules:

- **Structured fields first, message string second** — never string-concat IDs into the message
- **Never log raw request body** without going through redaction; redaction allowlist is configured in `@monopilot/observability` and currently covers: `password`, `pin`, `token`, `api_key`, `secret`, `authorization`, `cookie`, `set-cookie`, `subject_id`, `actor_user_id`, `ssn`, `dob`. Add module-specific PII keys (e.g., `tax_id`, `iban`) via the redact-config extension point — do not silently log new PII keys
- **Use child loggers** for per-job / per-request context: `const log = logger.child({ job: 'gdpr_erasure', runId })`
- **`console.log` is forbidden** in production code paths (advisory #2: ESLint rule pending under `tooling/eslint/`)

## T-118 Sentry pattern

- `apps/web` — `@sentry/nextjs` with `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`; DSN env-gated (missing DSN → no-op, never crash)
- `apps/worker` — `@sentry/node` initialized in the worker entrypoint before any job registration
- **`redactBeforeSend`** reuses the T-117 redaction allowlist — never ship a divergent redactor
- Release tagging — git SHA injected at build; events grouped by release for regression triage
- Server Actions and worker jobs both auto-capture unhandled rejections; explicit `Sentry.captureException(err)` for handled-but-noteworthy errors

## T-116 OpenTelemetry baseline

`packages/observability/src/otel.ts` exports `NodeSDK` initialization with OTLP exporter. `apps/web/instrumentation.ts` and `apps/worker` entry both call it. Adds tracing to:

- Next.js Server Actions and route handlers (auto-instrumented)
- DB calls (via Drizzle wrapper)
- Worker jobs (manual span around each handler invocation)

Module rule: do not add ad-hoc tracers; consume the global `trace.getTracer('module-name')` if a custom span is needed. P1 ships InMemorySpanExporter smoke test only — OTLP collector wiring is env-driven.

## T-121 rate-limit pattern

```ts
import { withRateLimit } from '@monopilot/rate-limit';

export const releaseSO = withRateLimit(
  'shipping.so.release',
  { limit: 10, windowMs: 60_000 },
  async (input) => {
    return withOrgContext({ orgId, userId, sessionToken }, async (db) => {
      // ... actual logic
    });
  }
);
```

Rules:

- **Bucket key composed:** `org_id + actionName + user_id`. Anonymous endpoints (login, magic-link, SAML/SCIM, PIN verify) use `org_id + actionName + ip` per the T-121 presets
- **Presets ship for:** `auth-login`, `magic-link`, `saml`, `scim`, `pin-verify` — use them by name, do not reinvent
- **On exceed:** return discriminated `{ ok: false, error: 'rate_limited', retryAfterMs }` — never throw. UI surfaces a toast with retry guidance.
- **Bound at the edge:** `apps/web/middleware.ts` wires rate-limit for unauthenticated endpoints. Authenticated Server Actions wrap themselves via `withRateLimit`
- **Storage:** Upstash Redis in prod; in-memory LRU in dev/test (auto-selected by env). Never assume Redis in tests

## T-124 e-sign pattern (CFR 21 Part 11)

API:

```ts
import { signEvent, dualSign } from '@monopilot/e-sign';

await signEvent({
  subject_id: ncrId,
  subject_type: 'quality.ncr',
  user_id,
  password,         // server-verified against Supabase auth — NEVER persisted
  reason: 'NCR closed after corrective action',
  org_id,
  session_token,
});

await dualSign({
  subject_id: lotoTagId,
  subject_type: 'maintenance.loto',
  signer1: { user_id: opUserId, password: opPw, reason: 'lockout applied' },
  signer2: { user_id: supUserId, password: supPw, reason: 'lockout verified' },
  org_id,
  session_token,
});
```

Rules:

- **`signEvent` use cases:** NCR close, calibration sign-off (single signer), label-spec approval, finance journal post, BOL release (depending on policy)
- **`dualSign` use cases:** LOTO apply/remove, dual-control finance close, calibration when SOP requires verifier, BRCGS / 21 CFR 11 dual-sign records
- **Server-verified password** via `@monopilot/auth` — the implementation calls Supabase GoTrue; we never receive plaintext at rest, never log it (it is in T-117 redaction allowlist), never persist it
- **Replay-nonce guard** — each call includes a single-use nonce; a replay attempt returns `replay_detected`
- **Audit:** writes to `e_sign_log` (RLS-scoped, append-only via trigger denying UPDATE/DELETE) AND emits a paired `audit_events` row with `retention_class='security'`. Link via `subject_id` + `subject_type`
- **SoD (separation of duties):** `dualSign` rejects when `signer1.user_id === signer2.user_id`
- **Time-to-sign window:** the nonce expires (default 5 min) — UIs that collect both signatures sequentially must refresh the nonce between signers

## T-125 withOrgContext usage (mandatory for every DB call)

```ts
import { withOrgContext } from '@monopilot/db';

export async function listOpenNcrs(input: Input) {
  const { orgId, userId, sessionToken } = await getSession(); // T-022-ish
  return withOrgContext({ orgId, userId, sessionToken }, async (db) => {
    return db.select().from(ncrs).where(eq(ncrs.status, 'open'));
  });
}
```

What it does (Wave0 canonical):

1. INSERTs/UPSERTs a row in `app.session_org_contexts (session_token PK, org_id, user_id, ...)` — the **trust store**, not a GUC
2. Calls `SELECT app.set_org_context(session_token, org_id)` — the non-spoofable setter (SECURITY DEFINER, returns the org UUID)
3. Sets `SET LOCAL app.current_user_id = $userId` — for audit triggers only; this is the ONE legitimate GUC use
4. Runs the callback with the wrapped Drizzle client
5. On commit/rollback the transaction-local `app.active_org_contexts` entry is cleared; outside the tx, `app.current_org_id()` returns NULL

Rules:

- **Every** Server Action, route handler, and worker job that touches DB MUST be inside `withOrgContext`. No exceptions.
- **RLS policies** read `app.current_org_id()` (the **function**), NEVER `current_setting('app.current_org_id')` or `current_setting('app.tenant_id')` — those resolve to NULL and silently return zero rows or break RLS
- **The column is `org_id`** (Wave0 v4.3 lock), NEVER `tenant_id`. The 2026-05-14 remediation rewrote 16 task JSONs that had this drift; do not reintroduce it
- **Composes with `withSiteContext`** for multi-site (see `MON-multi-tenant-site`) — site filtering layers on top of org filtering, never replaces it
- **Worker jobs that fan out across orgs** must establish org context per row/batch — never assume a single context for the whole job

## i18n cross-cutting (next-intl)

- **Locale files:** `apps/web/messages/<locale>.json` (en + pl shipped; add locales per market)
- **Key format:** `<module>.<feature>.<element>` (e.g., `quality.ncr.close_button`, `shipping.bol.error_already_released`)
- **Translate ALL user-facing strings** — including error codes returned from Server Actions; never return raw English to the UI. Error codes go through the i18n layer in the toast/dialog
- **Server-side messages** (worker logs, audit reasons) stay in English — they are operator-facing, not user-facing
- **Forbidden:** hardcoded strings in TSX (`<Button>Close NCR</Button>`) — use `t('quality.ncr.close_button')`. ESLint rule pending

## Hard rules (memorize before touching code)

| # | Rule | Why |
|---|---|---|
| 1 | Never `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` | Wave0 spoofable-GUC drift; use `app.current_org_id()` function |
| 2 | Column is `org_id`, never `tenant_id` | Wave0 v4.3 lock; 16 task JSONs were rewritten 2026-05-14 |
| 3 | Outbox INSERT in same transaction as state change | Otherwise consumers see events for rolled-back state or miss events |
| 4 | `event_type` max 64 chars, lowercase, dot, past-tense, no PII | Migration 053 widened to 64; do not exceed; PII goes in payload |
| 5 | No `JSON.parse(payload)` — parse via Zod | Untyped consumers cause silent contract drift |
| 6 | Every DB call wrapped in `withOrgContext` | RLS fail-closed depends on it |
| 7 | New PII column → add to `_foundation/contracts/gdpr.md` in same PR | CI enforces (or will); GDPR §13 success criterion |
| 8 | Never persist passwords; e-sign uses server-verified auth + nonce | CFR 21 Part 11 + redaction allowlist |
| 9 | No `console.log` in production paths — use pino with structured fields | Redaction allowlist only applies to pino |
| 10 | Rate-limit returns `{ ok: false, error: 'rate_limited' }` — never throws | Discriminated union; UI handles cleanly |
| 11 | `signEvent`/`dualSign` audit rows are append-only (`retention_class='security'`) | 21 CFR 11 immutability |
| 12 | New aggregate prefix → register in `_meta/specs/event-naming-convention.md` AND `lib/outbox/events.enum.ts` same PR | SoT divergence breaks consumers |
| 13 | Worker jobs use Zod fail-closed env loading | Silent default secrets are how prod incidents start |
| 14 | `withOrgContext` setter signature is `(sessionToken, orgId, fn)`; setter SQL is `app.set_org_context(session_token uuid, org uuid)` | Wave0 contract; do not reorder args |
| 15 | Hardcoded user-facing strings forbidden — next-intl with `<module>.<feature>.<element>` keys | i18n parity |

## Closeout checklist (paste into closeout markdown when this skill applied)

- [ ] All DB calls wrapped in `withOrgContext` (grep `apps/web/app/**` and `apps/worker/src/jobs/**` for direct `db.select`/`db.insert`/`db.update`)
- [ ] No `current_setting('app.tenant_id'|'app.current_org_id')` in modified files (grep proof)
- [ ] No `tenant_id` column or policy reference in modified migrations (grep proof; Wave0 says `org_id`)
- [ ] Outbox INSERTs are in the same `db.transaction(...)` block as the state change (visual diff cite)
- [ ] New `event_type` values are ≤64 chars, lowercase dot past-tense, registered in `events.enum.ts` + `event-naming-convention.md`
- [ ] New PII columns added to `_foundation/contracts/gdpr.md` registry
- [ ] No `console.log` in modified server code (grep proof); pino used with structured fields
- [ ] Sensitive fields (password, pin, token, subject_id, etc.) appear nowhere outside redaction allowlist
- [ ] Rate-limited endpoints return `{ ok: false, error: 'rate_limited', retryAfterMs }` (no throws)
- [ ] e-sign calls use `signEvent`/`dualSign` from `@monopilot/e-sign`; no ad-hoc password verification
- [ ] User-facing strings via `t('<module>.<feature>.<element>')`; no hardcoded English in TSX

## Cross-links

- `[[MON-multi-tenant-site]]` — site-level filtering layered on top of `withOrgContext`
- `[[MON-t1-schema]]` — Drizzle + RLS migrations consuming `app.current_org_id()`
- `[[MON-t2-api]]` — Server Action conventions; uses `withOrgContext` + rate-limit + e-sign + outbox producer pattern
- `[[MON-integrations-compliance]]` — D365, KSeF, EUDR, EPCIS adapters consuming outbox events
- `[[MON-t3-ui]]` — toast/error rendering of `{ ok: false, error: 'rate_limited' }` and e-sign dialog
- `[[MON-t4-test]]` — testcontainers Postgres pattern for outbox/withOrgContext/GDPR tests
