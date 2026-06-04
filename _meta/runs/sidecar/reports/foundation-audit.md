# SIDE-CAR Audit — 00-foundation (READ-ONLY)

Date: 2026-06-04
Scope: adversarial code+plan review of the already-built `00-foundation` module.
Method: STATUS.md/manifest claim-vs-code verification, core security primitive
read-through, outbox event-vocabulary drift analysis, RLS baseline review, spot
verification of DONE carry-forwards.
Constraint honoured: no files in main working tree or 01-npd modified; this is a
read-only report + proposed-task stubs only.

Bottom line: foundation code quality is **high** — the auth/RLS/withOrgContext/
RBAC/audit primitives are well-engineered and the sampled DONE carry-forwards are
substantive (real code, not stubs). The serious problem is **not** in any single
foundation task but in a **systemic event-vocabulary drift** that foundation owns
(the outbox contract) and that later modules (01-npd, 02-settings, 03-technical)
have silently outgrown. One live consumer path is a head-of-line poison-pill.

---

## P1 — Outbox event vocabulary has drifted into 3 desynchronized sources; consumer `normalizeEventType` throws on 32 live events

This is the highest-impact finding and is the same *class* of bug the brief
referenced (the `fa.edit`-dropped-from-the-CHECK-union incident, fixed by
migration 147). It is not fixed at the root — it has metastasized.

There are now **three** independent, drifting event vocabularies:

1. `packages/outbox/src/events.enum.ts` — `EventType` / `ALL_EVENTS` (**50 events**).
   Declared the "single source of truth" (T-003 "source-of-truth lock") and
   guarded by `packages/outbox/src/__tests__/events.test.ts`, which asserts
   `ALL_EVENTS` equals a **hardcoded 50-event list**.
2. `packages/outbox/src/event-types.ts` — `FA_EVENT_TYPES` (**8 fa.* events**),
   a separate hardcoded list used by `emitFaEvent`.
3. The DB CHECK constraint `outbox_events_event_type_check` — **82 events**,
   repeatedly DROP+RECREATE'd by per-module migrations (109/121/126/130/135/140
   reconciles + 119/147/etc.). Latest authoritative rebuild: migration 147.

**Diff (events.enum.ts vs DB CHECK migration 147):**
- In TS enum but NOT in DB CHECK: `fg.edit`  ← would FAIL the CHECK on INSERT.
- In DB CHECK but NOT in TS enum: **32 events**, all emitted by live downstream
  code, e.g. `fa.built`, `fa.template_applied`, `fa.cascade`, `fa.deleted`,
  `fa.core_closed`, `fa.dept_closed`, `fa.dept_reopened`, `fa.built_reset`,
  `fa.recipe_changed`, `npd.project.created`, `npd.gate.advanced` (already in
  enum — but `npd.project.*`, `npd.builder.*` are not), `onboarding.step.*`,
  `technical.factory_spec.approved`, `formulation.locked`,
  `formulation.submitted_for_trial`, `settings.line.upserted`,
  `settings.location.upserted`, `settings.machine.upserted`,
  `settings.warehouse.deactivated`, `rule.deployed`, `brief.converted`,
  `brief.completed_for_project`, `d365.cache.refreshed`,
  `fg.release_blocked`, `fg.released_to_factory`.

**Why this is live, not theoretical** — these events are emitted by real,
shipped code that writes to `public.outbox_events`:
- `apps/web/actions/infra/line.ts:121` → `settings.line.upserted`
- `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:191` → `npd.gate.advanced`
- `apps/web/app/(npd)/builder/_lib/factory-release-status.ts` → `technical.factory_spec.approved`
- `apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/lock-version.ts` → `formulation.locked`
- `packages/cascade-engine/src/chain4-template.ts` → `fa.template_applied`
- `apps/web/app/(npd)/fa/.../page.tsx` → `fa.built`

**The bug** — the foundation outbox **consumer** reads these rows and calls
`normalizeEventType(row.event_type)`:
- `apps/web/app/api/internal/cron/outbox/route.ts:95` — **no per-row try/catch.**
  `normalizeEventType` throws `Unknown event type: <x>` for any of the 32
  DB-only events. Because `runOnce` polls `WHERE consumed_at IS NULL ORDER BY
  org_id, created_at LIMIT 100` and the throwing row never gets `consumed_at`
  set, the throw aborts the whole batch and **the same un-normalizable row is
  re-read first on every subsequent run → permanent head-of-line block / queue
  poison-pill.**  (file:line — route.ts:85-115)
- `apps/worker/src/jobs/outbox-consumer.ts:160` (`toOutboxMessage` →
  `normalizeEventType`) — this path *is* inside the per-row try/catch (T-112),
  so it doesn't block, but it increments `attempts` and **dead-letters every one
  of the 32 event types after maxAttempts.** Net effect: all NPD / settings /
  technical / onboarding / formulation domain events are silently routed to the
  DLQ and never dispatched (no cascade, no downstream hooks).
- `packages/outbox/src/worker.ts:44` — same `normalizeEventType` call.

**`fg.edit` mismatch (the inverse hole):** `LegacyEventAlias` maps
`'fa.edit' → FG_EDIT ('fg.edit')` and `normalizeEventType('fa.edit')` returns
`'fg.edit'`. But the DB CHECK contains `fa.edit` and **not** `fg.edit`. Any
producer that normalizes before INSERT (or any future code that emits the
canonical `fg.edit`) hits a CHECK violation. Today `update-fa-cell.ts:8` emits
the raw string `'fa.edit'` (which is in the CHECK), so production INSERT works —
but the enum/CHECK are contradictory and a single refactor to "use the canonical
value" breaks the insert. This is a latent landmine.

**Root cause:** there is **no test or CI gate that asserts the TS enum ⊇ the DB
CHECK union** (or that the DB CHECK ⊆ enum ∪ aliases). `events.test.ts` locks
the enum to a frozen 50-item literal; T-122's `check:drift` gate compares
`pg_dump` to a baseline schema snapshot and so only catches DDL drift, **not the
semantic divergence between the enum and the CHECK list.** Every module adds its
events to the DB CHECK via migration but nobody updates `events.enum.ts`, and the
"source-of-truth lock" test happily stays green because it only checks the enum
against itself.

**Fix (root):**
1. Make the DB CHECK list derive from (or be validated against) `events.enum.ts`
   — either generate the CHECK from `ALL_EVENTS` in a single foundation
   migration helper, or add a DB-gated test that loads
   `outbox_events_event_type_check` and asserts `dbCheckSet ⊆ (ALL_EVENTS ∪ alias
   targets)` and `(ALL_EVENTS ∪ alias values) ⊆ dbCheckSet`. This becomes the
   real "source-of-truth lock."
2. Bring `events.enum.ts` `EventType` up to the full 82-event union (or
   restructure so each module's events are registered into a shared
   `ALL_EVENTS` rather than living only in migrations). Update
   `events.test.ts`'s frozen literal accordingly (it currently *enforces* the
   stale 50).
3. Add `fg.edit` to the DB CHECK (or drop the `fa.edit→fg.edit` alias and keep
   `fa.edit` canonical) so the alias target and the CHECK agree.
4. Harden the cron consumer (`route.ts:runOnce`) with a per-row try/catch that
   marks the row failed/skipped instead of aborting the batch — so an unknown
   event can never head-of-line-block the queue even if the lists drift again.

See proposed tasks `foundation-001`, `foundation-002`, `foundation-003`.

---

## P2 — `withOrgContext` app-pool factory lacks the production guard its sibling has

`apps/web/lib/auth/with-org-context.ts:103-118` `getAppPool()` falls back, when
`DATABASE_URL_APP` is unset, to rewriting `DATABASE_URL`'s username to `app_user`
with a **hardcoded test password** `'app-user-test-password'`:

```ts
if (!process.env.DATABASE_URL_APP) {
  url.username = 'app_user';
  url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
}
```

The canonical sibling `packages/db/src/clients.ts:16-22` (`getAppConnection`)
guards exactly this case:
```ts
if (NODE_ENV === 'production' && !VITEST && !DATABASE_URL_APP)
  throw new Error('DATABASE_URL_APP must be set in production');
```

`withOrgContext` is the HOF that wraps **every** data-plane Server Action, yet it
omits this guard. If a prod deploy is missing `DATABASE_URL_APP`, instead of
failing fast it will (a) silently attempt to connect as `app_user` with a
guessable hardcoded password, or (b) if that fails, surface an opaque
`app_pool_connect` error per request. The `getOwnerPool()` in the same file
(line 93-101) also has no production assertion, but owner falls back to
`DATABASE_URL` unmodified so it's lower risk.

**Fix:** mirror the `getAppConnection` production guard in
`withOrgContext.getAppPool` (and consider exporting/reusing `getAppConnection`'s
guard logic rather than re-implementing the username-rewrite in two places).

See proposed task `foundation-004`.

---

## P2 — `events.enum.ts` "source-of-truth lock" test is misleadingly named / self-referential

`packages/outbox/src/__tests__/events.test.ts` is the only thing called the
"source-of-truth lock" but it asserts `ALL_EVENTS` equals a **frozen literal
copy** of itself (50 entries) and never touches the DB. It also explicitly
forbids any `fa.*` value in `ALL_EVENTS` (lines 121-127) — correct for the
canonical-prefix policy — but the DB CHECK is *full* of `fa.*` strings because
01-npd standardized on `fa.*` raw event names. So the "lock" actively encodes a
*different* naming policy than the one the live DB enforces. This is the
mechanism by which the drift in P1 stayed invisible. Folded into the P1 fix but
called out separately because the test's name implies a guarantee it does not
provide.

---

## Assumptions worth revising (plan / PRD)

- **PRD §5 storage pattern still says `tenant_id`** for the composite indexes
  (`(tenant_id, dept_id, status, created_at)`) and the partition open-question
  (`partition by tenant_id`). Wave0 v4.3 locked business scope to `org_id`; the
  PRD flags `tenant_id` as control-plane-only elsewhere (§5 RLS line, §W0-v4.3)
  but the §5 storage examples were not amended and read as guidance that
  contradicts the hard rule. 01-npd built on `org_id` (correct). **Low risk
  (docs only), but the §5 storage examples should get the same `[LEGACY-D365]` /
  org_id amendment T-047 applied elsewhere** so a future module author copying
  the index template doesn't reintroduce `tenant_id`. Not proposing a task —
  fold into the next PRD amendment pass.

- **"events.enum.ts is the single source of truth" (T-003) is no longer true in
  practice.** Reality: each module owns its events via migration and the enum is
  a stale subset. Either re-assert the invariant with a real cross-check (P1) or
  formally downgrade the claim in the foundation contract. Decision needed below.

- **Two outbox consumers with different failure semantics coexist** (the cron
  route `route.ts` aborts-the-batch; the worker `outbox-consumer.ts` per-row
  DLQs). It's unclear which is the production path. If both can run, the cron
  route's poison-pill behavior dominates. Decision needed below.

---

## Things checked and found OK (no action)

- **RLS baseline (`002-rls-baseline.sql`)** — solid. `app.current_org_id()` is
  bound to `pg_backend_pid()` AND `txid_current_if_assigned()` (transaction-
  scoped, fail-closed to NULL outside a txn). `force row level security` on
  `organizations` + `users`. `set_org_context` is SECURITY DEFINER with
  `search_path = pg_catalog`, validates the (token, org) pair, errcode 28000 on
  mismatch. EXECUTE revoked from public, granted only to `app_user`. Signature
  `(session_token uuid, org uuid)` matches the `withOrgContext` call site.
- **`withOrgContext` (T-125)** — verifies JWT via `supabase.auth.getUser()` (not
  `getSession()`), resolves `org_id` from `public.users` (not JWT claims), fresh
  per-call session token, BEGIN→set_org_context→action→COMMIT/ROLLBACK, finally
  cleanup with documented out-of-band GC (migration 031). No swallowed errors —
  failures are annotated and re-thrown. Well done.
- **`getOwnerConnection` (BYPASSRLS) request-path usages** — reviewed each:
  `invite/accept/route.ts` (token-based, no session yet — owner justified, atomic
  consume, fail-closed on rowCount=0), `orgs/create.ts` (org bootstrap — owner
  required), SAML callback/login (pre-session IdP flow), cron routes (system
  actor). `grantRole` owner use is the documented T-077 WONTFIX with explicit
  guards (assertUserBelongsToOrg actor+target, SoD-on-target, dual-control,
  approval-token jti, HMAC fail-closed). No accidental RLS bypass in a
  user-session data path found.
- **money-as-float** — no `float`/`double precision`/`real` columns in any
  foundation migration. NUMERIC discipline holds at the foundation layer.
- **audit_events** — retention_class CHECK present; T-009/T-064 role.assigned
  retention='security' VALIDATE CONSTRAINT verified DONE on the test project per
  STATUS; org_id nullable + RLS recreated (T-087).
- **DONE carry-forward spot checks** — T-125 (file present + full impl), T-070
  (8h `ABSOLUTE_MAX_SESSION_S` present, session-check.ts), T-109 (MFA_MASTER_KEY
  fail-closed guard present, totp.ts) all substantive. No DONE-without-substance
  found in the sample.
- **RBAC permission seeding** distributed across module migrations (017/050/080/
  146/...) — expected pattern; deep coverage is the sibling RBAC audit's scope,
  not a foundation gap.

---

## DECISIONS NEEDED (human)

1. **Outbox event source-of-truth model.** Pick one:
   (a) Re-assert `events.enum.ts` as authoritative and *generate* the DB CHECK
       from it (every module stops hand-editing the CHECK); or
   (b) Accept that the DB CHECK is authoritative and reduce `events.enum.ts` to a
       validated mirror with a DB-gated sync test.
   Either way a real cross-check gate must replace the current self-referential
   `events.test.ts` lock. (Drives foundation-001/002.)

2. **`fa.*` vs `fg.*` event naming.** `events.test.ts` forbids `fa.*` in the
   enum and aliases `fa.edit→fg.edit`, but the DB CHECK and all 01-npd producers
   use raw `fa.*`. Decide the canonical prefix and reconcile the alias/CHECK so
   `normalizeEventType` round-trips correctly. (Drives foundation-003.)

3. **Which outbox consumer is the production path** — the Vercel cron route
   (`api/internal/cron/outbox/route.ts`) or the `apps/worker` consumer? If both,
   the cron route needs the per-row guard (foundation-002) urgently because its
   abort-the-batch behavior is a hard outage mode, not a degradation.

4. **PRD §5 storage `tenant_id` examples** — approve folding an org_id amendment
   into the next PRD pass (no standalone task proposed).
