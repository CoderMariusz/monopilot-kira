---
name: MON-t2-api
description: Use when implementing T2-api tasks (Next.js Server Actions in apps/web/app/.../_actions/*.ts). Covers withOrgContext HOF, zod validation, rate-limit, outbox dispatch, error mapping. Required reading before touching server actions.
version: 1.0.0
model: opus
canonical_specs:
  - _meta/audits/2026-05-14-foundation-primitives-additions.md
  - _meta/audits/2026-05-14-tenant-context-remediation.md
  - _meta/specs/event-naming-convention.md
---

# MON-t2-api — T2-api Implementation Playbook (Opus)

**Purpose:** every monopilot-kira T2-api task must produce a Next.js Server Action under `apps/web/app/<route>/_actions/<verb>.ts` that wraps DB work in the `withOrgContext` HOF (T-125), validates input with zod, dispatches domain events via the outbox (T-112), maps errors to a discriminated union, and rate-limits expensive/auth endpoints (T-121). This skill encodes the non-negotiable patterns so an implementation agent cannot reinvent them per task.

**Why Opus only:** the HOF, outbox, e-sign, and rate-limit primitives have tight contracts; Haiku/Sonnet have repeatedly chosen FastAPI/Express templates, raw `current_setting('app.tenant_id')` reads, or async outbox emit outside the transaction. Each violation regresses tenant isolation (Wave0 v4.3 lock) or breaks event-first architecture (00-FOUNDATION §10).

## When to use

- Implementing a task whose `pipeline_inputs.task_type === "T2-api"`.
- Writing or modifying a Server Action under `apps/web/app/**/_actions/*.ts`.
- Writing a Next.js Route Handler under `apps/web/app/api/**/route.ts` that performs write/state-changing ops (read-only handlers are still T2-api but skip outbox).
- Adding a shared validator under `packages/<module>/src/validators.ts` consumed by a Server Action.

## Do NOT use when

- Task is `T1-schema` — schema/migrations belong in `packages/db/migrations/*.sql`; use **MON-t1-schema**.
- Task is `T3-ui` — components/pages live in `apps/web/app/.../(module)/page.tsx`; use **MON-t3-ui**.
- Task is `T4-wiring-test` — E2E/Playwright/integration glue; use **MON-t4-test**.
- Long-running work (>2s, batch, cron, retries). Server Actions must enqueue via outbox; the actual job runs in `apps/worker` (T-111 JobRegistry).
- API for an external/third-party caller. Server Actions are first-party only; cross-origin callers need a Route Handler with explicit auth — and that is a separate task class.

## Canonical file locations

| Concern | Path | Source of truth |
|---|---|---|
| Server Action | `apps/web/app/<module-route>/_actions/<verb>.ts` | this skill §pattern |
| Shared validators | `packages/<module>/src/validators.ts` | reused by Server Action + UI form |
| `withOrgContext` HOF | `packages/db/src/with-org-context.ts` | T-125 (FT-001) |
| Next.js route wrapper | `apps/web/lib/auth/with-org-context-route.ts` | T-125 |
| Outbox helpers | `packages/outbox/src/dispatch-queue.ts`, `packages/db/src/outbox.ts` | T-112 |
| Event-type enum | `packages/outbox/src/events.enum.ts` | event-naming-convention.md |
| Rate-limit | `packages/rate-limit/src/` (presets: auth-login, magic-link, saml, scim, pin-verify) | T-121 |
| E-sign | `packages/e-sign/src/index.ts` (`signEvent`, `dualSign`) | T-124 |

**Naming verbs (file name = verb):** `createBrief.ts`, `releaseSO.ts`, `closeNCR.ts`, `placeHold.ts`, `recordEvent.ts`. Match the past-tense outbox verb where possible (`releaseSO.ts` → emits `shipping.so.released`).

## Mandatory pattern (Server Action skeleton)

```ts
'use server';

import { z } from 'zod';
import { withOrgContext } from '@monopilot/db/with-org-context';
import { enqueueOutbox } from '@monopilot/db/outbox';
import { rateLimit } from '@monopilot/rate-limit';
import { revalidatePath } from 'next/cache';

// 1. zod schema — every input field, no `any`, no `unknown` escape hatch.
const Input = z.object({
  shipmentId: z.string().uuid(),
  carrierRef: z.string().min(1).max(64),
  releasedAt: z.string().datetime(),
});
export type ReleaseSOInput = z.infer<typeof Input>;

// 2. Error enum — closed set, never leak DB state.
export type ReleaseSOError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_released'
  | 'rate_limited'
  | 'persistence_failed';

// 3. Discriminated-union return — the ONLY shape consumers see.
export type ReleaseSOResult =
  | { ok: true; data: { shipmentId: string; releasedAt: string } }
  | { ok: false; error: ReleaseSOError; message?: string };

export async function releaseSO(raw: unknown): Promise<ReleaseSOResult> {
  // 4. Validate BEFORE opening a DB transaction (cheap fail path).
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  // 5. Rate-limit BEFORE the HOF (avoid burning a DB connection on a hot loop).
  const rl = await rateLimit({ preset: 'expensive', key: `releaseSO:${input.shipmentId}` });
  if (!rl.allowed) return { ok: false, error: 'rate_limited' };

  // 6. withOrgContext: opens txn, calls app.set_org_context(session_token, org_id),
  //    RLS now scopes every query to the caller's org via app.current_org_id().
  return withOrgContext(async ({ userId, orgId, client }) => {
    // 6a. Authorization check (RBAC) — same txn so app.current_org_id() is set.
    const { rows: perm } = await client.query<{ ok: boolean }>(
      `select true as ok from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = $1::uuid and ur.org_id = $2::uuid
          and r.slug = any($3::text[])`,
      [userId, orgId, ['shipping.dispatcher', 'shipping.admin']],
    );
    if (perm.length === 0) return { ok: false, error: 'forbidden' };

    // 6b. State transition guard (read current state under RLS).
    const { rows: cur } = await client.query<{ status: string }>(
      `select status from public.shipments where id = $1::uuid`,
      [input.shipmentId],
    );
    if (cur.length === 0) return { ok: false, error: 'not_found' };
    if (cur[0]!.status === 'released') return { ok: false, error: 'already_released' };

    // 6c. State change.
    try {
      await client.query(
        `update public.shipments
            set status = 'released', carrier_ref = $2, released_at = $3
          where id = $1::uuid and status <> 'released'`,
        [input.shipmentId, input.carrierRef, input.releasedAt],
      );

      // 6d. Outbox INSERT in the SAME txn — atomic with state change.
      await enqueueOutbox(client, {
        event_type: 'shipping.so.released', // module.entity.verb past-tense
        aggregate_id: input.shipmentId,
        org_id: orgId,
        payload: {
          shipment_id: input.shipmentId,
          carrier_ref: input.carrierRef,
          released_at: input.releasedAt,
          actor_user_id: userId,
        },
        occurred_at: new Date().toISOString(),
      });
    } catch (err) {
      // 6e. Map raw DB errors to the closed enum; log full err server-side.
      console.error('[releaseSO] persistence_failed', {
        shipmentId: input.shipmentId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, error: 'persistence_failed' };
    }

    // 7. Cache invalidation (App Router) — only on success, after txn commits
    //    via withOrgContext's finalize hook.
    revalidatePath(`/shipping/${input.shipmentId}`);
    return { ok: true, data: { shipmentId: input.shipmentId, releasedAt: input.releasedAt } };
  });
}
```

## Hard rules

| Wrong | Right |
|---|---|
| Direct `pg`/`postgres-js` query in Server Action body | Wrap every DB call in `withOrgContext(async ({ client }) => ...)` |
| `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` (GUC) | RLS reads `app.current_org_id()`; setter is `app.set_org_context(session_token, org_id)` (Wave0 v4.3) |
| `SET LOCAL app.current_org_id = $1` | `select app.set_org_context($1::uuid, $2::uuid)` |
| `throw new Error(dbErr.message)` to client | Map to closed enum; return `{ ok: false, error: '<code>' }`; log server-side only |
| `await fetch('/api/events', { method: 'POST', ... })` outside txn | `await enqueueOutbox(client, {...})` inside the same txn |
| Long-running work (loops, batch, retries, network fan-out) in Server Action | Enqueue via outbox; `apps/worker` (T-111 JobRegistry) consumes asynchronously |
| `input as any` or `JSON.parse(raw)` without schema | `z.object({...}).safeParse(raw)`; return `invalid_input` on failure |
| No rate-limit on auth/OTP/expensive endpoint | `await rateLimit({ preset, key })` BEFORE the HOF |
| Differentiating "user not in org" vs "user lacks role" in error | Both return `forbidden` — never leak existence |
| Mixing read + write Server Action with no idempotency guard | Add state guard (`where status <> 'released'`) or replay-nonce (e-sign) |
| Returning raw DB row | Whitelist fields in `data` payload — never echo internal columns |
| `export class XError {}` / `export const FOO = {...}` in a `'use server'` file | Only `export async function` is legal in a `'use server'` module — move classes/consts to a non-`'use server'` sibling |

## `'use server'` export rule (breaks `next build`, NOT caught by tsc/vitest)

A file with the `'use server'` directive at the top may **only export async functions** — Next.js compiles every export into a callable server-action reference. Exporting an error **class**, a const object, an enum, or a non-async function compiles fine under `tsc` and passes `vitest`, but **fails `next build`** ("A 'use server' file can only export async functions"). This is a recurring live-only break (01-npd): green local, red Vercel build.

Rule: keep the action file `'use server'` with only `export async function` declarations. Put shared error classes, error-code constants, zod schemas you want to re-export, and discriminated-union types in a **non-`'use server'` sibling module** (e.g. `apps/web/app/<route>/_actions/errors.ts` with no directive) and import them into the action file. Types (`export type`) are erased at compile time and are fine, but a runtime `export class` / `export const` is not. Always run `pnpm --filter web exec next build` locally before deploy to catch this.

## withOrgContext (T-125)

Defined in `packages/db/src/with-org-context.ts` (FT-001). Canonical signature:

```ts
export interface OrgContext {
  userId: string;
  orgId: string;
  sessionToken: string;
  client: PgClient; // bound to the active txn
}

export function withOrgContext<T>(
  fn: (ctx: OrgContext) => Promise<T>,
): Promise<T>;
```

Inside the HOF:

1. `BEGIN` a transaction.
2. Resolve the caller (Supabase GoTrue session → `userId`, active org → `orgId`, mint a fresh `sessionToken UUID`).
3. Execute `select app.set_org_context($1::uuid, $2::uuid)` with `(sessionToken, orgId)`. This is **SECURITY DEFINER** and writes to `app.session_org_contexts` (non-spoofable trust store, established in `packages/db/migrations/002-rls-baseline.sql`).
4. Every RLS policy on every business table reads `org_id = app.current_org_id()`. That function returns the txn-local org bound by step 3.
5. Run `fn(ctx)` — your business logic.
6. `COMMIT` on success; `ROLLBACK` on thrown error. Outbox rows committed atomically with state changes.

**Never bypass** by setting GUCs directly, by re-using a client outside the HOF, or by mutating `app.session_org_contexts`. The `with-org-context.ts` file has a grep-assertion test (AC in T-125) that bans `current_setting('app.tenant_id'|'app.current_org_id')` and `SET LOCAL app.current_org_id` literals from the helper file and from any consumer under `apps/web/`.

If you need a Next.js Route Handler (`apps/web/app/api/.../route.ts`) instead of a Server Action, use `withOrgContextRoute` from `apps/web/lib/auth/with-org-context-route.ts` (T-125 second deliverable). Same contract; the wrapper extracts session from `cookies()` and returns `NextResponse` directly.

## Outbox event dispatch (T-112)

Pattern: in the **same transaction** as the state change, INSERT into `outbox` (or call `enqueueOutbox(client, {...})` which does the same). The T-112 outbox consumer (registered in `apps/worker` via T-111 JobRegistry, runs every 5s) selects unprocessed rows, dispatches them, and writes to `outbox_dead_letter` on failure after exponential backoff.

Schema reminder (per T-112):

```sql
outbox (
  id           uuid pk,
  org_id       uuid not null,        -- RLS-scoped
  event_type   text not null,        -- module.entity.verb
  aggregate_id uuid,
  payload      jsonb not null,
  occurred_at  timestamptz not null,
  processed_at timestamptz,
  attempts     int not null default 0
)
```

**Event-type format** (per `_meta/specs/event-naming-convention.md`):

- ISA-95 dot format: `<aggregate>.<verb_phrase>` lowercase, snake_case, past-tense.
- Aggregate prefix must be in the registry (e.g., `fa`, `brief`, `lp`, `wo`, `quality`, `shipment`, `audit`, `org`, `user`, `role`). Adding a new prefix requires updating both the registry and `packages/outbox/src/events.enum.ts` in the same PR.
- Never put tenant_id, IDs, or payload data in `event_type` — those go in their typed columns.

Examples: `shipping.so.released`, `quality.hold.placed`, `wo.status.changed`, `fa.dept_closed`.

See **[[MON-foundation-primitives]] §events** for the full registry and dead-letter ops contract.

## E-sign attestation (T-124)

If the action triggers a state transition that requires CFR 21 Part 11 attestation — NCR close, LOTO sign-off, calibration certificate, BOL release, quality hold release, deviation approval — call `signEvent` (single signer) or `dualSign` (separation-of-duties two-signer) **BEFORE** the state change. Both write a paired audit_event with `retention_class='security'`.

```ts
import { signEvent, dualSign } from '@monopilot/e-sign';

const sig = await signEvent({
  event_id: input.ncrId,
  event_type: 'quality.ncr.closed',
  user_id: userId,
  password: input.password,    // server-verified via @monopilot/auth
  reason: input.reason,        // mandatory free-text per CFR 21 Part 11
  nonce: input.nonce,          // replay-guard, expires 60s
});
if (!sig.ok) return { ok: false, error: 'esign_failed' };

// Now perform the state transition referencing sig.signature_id.
```

`dualSign` requires two distinct `user_id`s with non-overlapping role sets enforced server-side (e.g., maker vs. approver). If the same user attempts both, the call returns `sod_violation` and writes a security audit event.

See **[[MON-foundation-primitives]] §e-sign** for the SoD matrix and replay-nonce store.

## Rate limit (T-121)

Wrap the action body in `await rateLimit({ preset, key })` **before** opening the HOF. Bucket key is `${orgId}:${actionName}:${userId}` (or a stable input field for unauthenticated paths like magic-link send).

Presets (token-bucket, Upstash-backed in prod, in-memory fallback in dev):

| Preset | Window | Capacity | Use for |
|---|---|---|---|
| `auth-login` | 60s | 10 | password sign-in |
| `magic-link` | 300s | 3 | magic-link send |
| `saml` | 60s | 30 | SAML callback |
| `scim` | 60s | 60 | SCIM provisioning |
| `pin-verify` | 60s | 5 | e-sign PIN verify |
| `expensive` | 60s | 20 | analytical queries, report builds |

If the preset doesn't match, escalate to a foundation task before adding a one-off preset.

Middleware-level rate-limit (`apps/web/middleware.ts`, also T-121) covers Route Handlers but does **not** automatically cover Server Actions — Server Actions must call `rateLimit` explicitly.

## Error mapping

| DB error class | User-facing code |
|---|---|
| `23505` unique_violation | `already_exists` or domain-specific (e.g., `already_released`) |
| `23503` foreign_key_violation | `invalid_reference` (whitelist the FK name; never echo the constraint string) |
| `23514` check_violation | `invalid_state` or `invalid_input` if the check maps to an input field |
| `42501` insufficient_privilege | `forbidden` (RLS blocked — caller is in wrong org) |
| `40001` serialization_failure | `retry` (idempotent retry from the client is safe) |
| Timeout | `unavailable` |
| Any other | `persistence_failed` |

Never include the `pg` error message, SQLSTATE, query text, or stack trace in the returned object. Log full err server-side with the action name and a correlation id.

## Acceptance criteria template

Use 3–4 ACs per T2-api task (Given/When/Then):

1. **Input validation:** "Given a payload missing a required field, when the action is invoked, then it returns `{ ok: false, error: 'invalid_input' }` and no DB write occurs."
2. **Success path:** "Given a valid payload and authorized caller, when the action completes, then it returns `{ ok: true, data: {...} }` with the documented shape and a corresponding row appears in `outbox` with `event_type = '<module.entity.verb>'`."
3. **Tenant isolation (RLS):** "Given the caller's org_id is A and the target aggregate belongs to org B, when the action is invoked, then it returns `{ ok: false, error: 'not_found' }` (RLS scopes the SELECT to zero rows) — never `forbidden` or `persistence_failed`."
4. **Atomicity (outbox in txn):** "Given the action throws after the state change but before commit, when the rollback completes, then the outbox row is absent (no orphan event) and the state change is reverted."

Optional 5th when applicable: rate-limit (`rate_limited` after N calls), e-sign (`esign_failed` on wrong PIN), or idempotency (re-call returns same result without duplicate outbox row).

## RED test commands

- Unit/integration: `pnpm --filter @monopilot/web test <action-name>`
- Cross-package validator: `pnpm --filter @monopilot/<module> test`
- Full web suite: `pnpm --filter @monopilot/web test`
- Testcontainers Postgres for RLS isolation (preferred): mount Postgres 16, run all migrations, spin two parallel transactions with different `app.set_org_context` calls, assert each sees only its own rows.

RED test file conventions:

- Co-located: `apps/web/app/<route>/_actions/__tests__/<verb>.test.ts`
- Mock Supabase auth via the test fixture in `apps/web/test/fixtures/supabase-auth.ts` (or equivalent — verify with `find apps/web/test -name "supabase-auth*"`).
- Outbox assertion: `SELECT event_type, payload FROM outbox WHERE org_id = $1` after the action completes.

## Cross-links

- [[MON-t1-schema]] — migrations, RLS policies, `app.set_org_context` / `app.current_org_id`, FORCE RLS.
- [[MON-foundation-primitives]] — outbox + dead-letter, e-sign SoD, rate-limit presets, observability spans, event registry.
- [[MON-multi-tenant-site]] — org + site context resolution, when to scope by site as well as org.
- [[MON-t3-ui]] — consuming Server Action result, form validation parity with shared `packages/<module>/src/validators.ts`.
- [[MON-t4-test]] — Playwright E2E that exercises the full UI → Server Action → DB → outbox loop.
- [[MON-project-overview]] — top-level project map.
