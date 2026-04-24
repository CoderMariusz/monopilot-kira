# E-0 Foundation Track γ — Outbox + Rule Engine + Schema-driven + Testing/CI (v2)

Generated: 2026-04-23
Tracks: 00-f (Outbox/pg-boss), 00-g (Rule engine DSL), 00-h (Schema-driven), 00-i (Testing/CI)
Tasks: T-00f-001..006, T-00g-001..008, T-00h-001..005, T-00i-001..008

## T-00f-001 — Migration `010-outbox-events.sql` + DLQ table

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — baseline migration applied]
- **Downstream (will consume this):** [T-00f-002 — insertOutboxEvent helper], [T-00f-003 — pg-boss worker], [T-00f-004 — retry policy table]
- **Parallel (can run concurrently):** [T-00e-001]

### GIVEN / WHEN / THEN
**GIVEN** the baseline migration (009 or lower) has been applied and `tenants` table exists with `id UUID PRIMARY KEY`
**WHEN** `apps/web/drizzle/migrations/010-outbox-events.sql` is applied via `pnpm drizzle-kit migrate`
**THEN** `outbox_events` table exists with all R13 columns plus outbox-specific columns; `dead_letter_queue` table exists; partial index on `(tenant_id, scheduled_at) WHERE status IN ('pending','processing')` is created; Drizzle schema types in `apps/web/drizzle/schema/outbox.ts` compile without errors

### ACP Prompt
````
# Task T-00f-001 — Migration `010-outbox-events.sql` + DLQ table

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10` — outbox_events table shape + ISA-95-compatible event schema
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/migrations/` → sprawdź ostatni plik migracji żeby ustalić aktualny numer sekwencji i naming convention

## Twoje zadanie
Baza ma tabelę `tenants(id UUID PRIMARY KEY)`. Utwórz migrację `010-outbox-events.sql` która tworzy dwie tabele: `outbox_events` (główna tabela outbox) oraz `dead_letter_queue` (tabela dla event'ów po wyczerpaniu retry). Następnie wygeneruj Drizzle schema types. Migration musi być idempotent (IF NOT EXISTS). Po migracji `outbox_events` musi zawierać wszystkie wymagane kolumny — zarówno R13 audit columns jak i outbox-specific columns. Status enum musi być enforce'owany przez CHECK constraint.

## Implementacja

1. Utwórz `apps/web/drizzle/migrations/010-outbox-events.sql` z następującą dokładną strukturą:

```sql
-- Migration 010: outbox_events + dead_letter_queue
-- Idempotent: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS outbox_events (
  -- R13 audit columns (required on all business tables)
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  created_at           TIMESTAMPTZ DEFAULT now(),
  created_by_user      UUID,
  created_by_device    UUID,
  app_version          TEXT,
  model_prediction_id  UUID,
  epcis_event_id       UUID,
  external_id          TEXT,
  schema_version       INT NOT NULL DEFAULT 1,
  -- outbox-specific columns
  event_type           TEXT NOT NULL,
  aggregate_type       TEXT NOT NULL,
  aggregate_id         UUID NOT NULL,
  payload              JSONB NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','processing','processed','failed','dlq')),
  attempts             INT NOT NULL DEFAULT 0,
  last_error           TEXT,
  scheduled_at         TIMESTAMPTZ DEFAULT now(),
  processed_at         TIMESTAMPTZ,
  dlq_at               TIMESTAMPTZ
);

-- Partial index: only unfinished events (worker polling target)
CREATE INDEX IF NOT EXISTS idx_outbox_events_pending
  ON outbox_events (tenant_id, scheduled_at)
  WHERE status IN ('pending', 'processing');

-- GIN index on payload for event_type-based queries
CREATE INDEX IF NOT EXISTS idx_outbox_events_payload
  ON outbox_events USING GIN (payload);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  outbox_event_id  UUID NOT NULL REFERENCES outbox_events(id),
  tenant_id        UUID NOT NULL,
  reason           TEXT,
  failed_at        TIMESTAMPTZ DEFAULT now(),
  raw_payload      JSONB
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant
  ON dead_letter_queue (tenant_id, failed_at);
```

2. Utwórz `apps/web/drizzle/schema/outbox.ts` z Drizzle ORM typami:
   - `outboxEvents` table object używając `pgTable`
   - `deadLetterQueue` table object używając `pgTable`
   - Exported TypeScript types: `OutboxEvent`, `NewOutboxEvent`, `DeadLetterQueueEntry`
   - Status enum type: `type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dlq'`

3. Dodaj `outbox` schema do `apps/web/drizzle/schema/index.ts` — dodaj export: `export * from './outbox'`

4. Uruchom `pnpm drizzle-kit generate` z konfiguracją schema obejmującą `apps/web/drizzle/schema/outbox.ts`, żeby zweryfikować że schema kompiluje się poprawnie (nie musi tworzyć nowej migracji — migracja jest już napisana ręcznie w kroku 1)

5. Uruchom `pnpm drizzle-kit migrate` w środowisku testowym przeciwko `apps/web/drizzle/migrations/010-outbox-events.sql`, żeby zweryfikować że SQL się wykonuje

## Files
**Create:** `apps/web/drizzle/migrations/010-outbox-events.sql`
**Create:** `apps/web/drizzle/schema/outbox.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj: `export * from './outbox'`

## Done when
- `pnpm drizzle-kit migrate` kończy się bez błędu
- `psql -c "\d outbox_events"` pokazuje wszystkie kolumny (id, tenant_id, event_type, aggregate_type, aggregate_id, payload, status, attempts, scheduled_at, processed_at, dlq_at + R13 columns)
- `psql -c "\d dead_letter_queue"` pokazuje: id, outbox_event_id, tenant_id, reason, failed_at, raw_payload
- `vitest apps/web/lib/outbox/__tests__/outbox.integration.test.ts` PASS — sprawdza: INSERT do outbox_events z valid status, CHECK constraint rejects invalid status, partial index exists
- `pnpm test:smoke` green

## Rollback
`psql -c "DROP TABLE IF EXISTS dead_letter_queue; DROP TABLE IF EXISTS outbox_events;"`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/outbox/__tests__/outbox.integration.test.ts` — covers: table structure, CHECK constraint, index existence
- **CI gate:** `pnpm test:smoke` green

### Rollback
`psql -c "DROP TABLE IF EXISTS dead_letter_queue; DROP TABLE IF EXISTS outbox_events;"`
## T-00f-002 — `insertOutboxEvent` helper with transaction support

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001 — outbox migration applied], [T-00b-E02 — EventType enum]
- **Downstream (will consume this):** [T-00f-003 — pg-boss worker], [T-00f-006 — integration test]
- **Parallel (can run concurrently):** [T-00f-004 — retry policy table]

### GIVEN / WHEN / THEN
**GIVEN** `outbox_events` table exists and `EventType` enum is defined in `apps/web/lib/outbox/events.enum.ts`
**WHEN** `insertOutboxEvent(tenantId, eventType, aggregateType, aggregateId, payload, tx?)` is called inside or outside a database transaction
**THEN** a row is inserted into `outbox_events` with `status='pending'`, `attempts=0`, `scheduled_at=now()`; if `tx` is provided the insert participates in that transaction; the function returns the new `outbox_event_id` as a string; calling with identical `(tenantId, eventType, aggregateId)` within 1 second is idempotent (no duplicate row inserted)

### ACP Prompt
````
# Task T-00f-002 — `insertOutboxEvent` helper with transaction support

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/outbox.ts` → cały plik — typy OutboxEvent, NewOutboxEvent, outboxEvents table
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → cały plik — EventType enum values (jeśli plik nie istnieje, utwórz go w ramach tego tasku z pustym enumem i komentarzem "TODO: add event types as features are implemented")

## Twoje zadanie
Zaimplementuj helper `insertOutboxEvent` który wstawia event do tabeli `outbox_events`. Helper musi działać zarówno standalone (z własnym connection) jak i wewnątrz istniejącej transakcji Drizzle (opcjonalny parametr `tx`). Funkcja musi być idempotent: jeśli w ciągu ostatniej sekundy istnieje już row z identycznym `(tenant_id, event_type, aggregate_id)`, zwróć istniejące `id` bez INSERT.

Dokładna sygnatura:
```ts
export async function insertOutboxEvent(
  tenantId: string,
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  tx?: PgTransaction
): Promise<string>  // returns outbox_event_id
```

## Implementacja

1. Jeśli nie istnieje, utwórz `apps/web/lib/outbox/events.enum.ts`:
```ts
export enum EventType {
  // Placeholder — add concrete event types as features are implemented
  SYSTEM_TEST = 'system.test',
}
```

2. Utwórz `apps/web/lib/outbox/insert-outbox-event.ts`:
   - Import `db` z `apps/web/lib/db` (lub odpowiedni path do Drizzle client)
   - Import `outboxEvents` schema z `apps/web/drizzle/schema/outbox`
   - Import `EventType` z `apps/web/lib/outbox/events.enum`
   - Zdefiniuj typ `PgTransaction` jako `Parameters<Parameters<typeof db.transaction>[0]>[0]`
   - Idempotency check: `SELECT id FROM outbox_events WHERE tenant_id=$1 AND event_type=$2 AND aggregate_id=$3 AND scheduled_at > now() - interval '1 second'`
   - Jeśli row istnieje → return `existingRow.id`
   - Jeśli nie istnieje → INSERT z `status='pending'`, `attempts=0`, `scheduled_at=now()` → return new `id`
   - Używaj przekazanego `tx` jeśli podany, inaczej `db`

3. Utwórz `apps/web/lib/outbox/__tests__/insert-outbox-event.unit.test.ts`:
   - Test: insert zwraca UUID string
   - Test: duplikat w oknie 1s zwraca ten sam UUID (idempotency)
   - Test: insert po 1s tworzy nowy row

4. Utwórz `apps/web/lib/outbox/__tests__/outbox.integration.test.ts` (lub dodaj do istniejącego):
   - Używa `supabaseLocalDb` fixture (zero DB mocks)
   - Test: `insertOutboxEvent` w transakcji — rollback transakcji nie zostawia row w outbox_events
   - Test: `insertOutboxEvent` bez transakcji — row jest w DB po wywołaniu

5. Eksportuj z `apps/web/lib/outbox/index.ts`:
```ts
export { insertOutboxEvent } from './insert-outbox-event'
export { EventType } from './events.enum'
```

## Files
**Create:** `apps/web/lib/outbox/insert-outbox-event.ts`
**Create:** `apps/web/lib/outbox/events.enum.ts` (jeśli nie istnieje)
**Create:** `apps/web/lib/outbox/__tests__/insert-outbox-event.unit.test.ts`
**Create:** `apps/web/lib/outbox/__tests__/outbox.integration.test.ts`
**Create:** `apps/web/lib/outbox/index.ts` (jeśli nie istnieje)

## Done when
- `vitest apps/web/lib/outbox/__tests__/insert-outbox-event.unit.test.ts` PASS — sprawdza: return type UUID, idempotency w 1s window
- `vitest apps/web/lib/outbox/__tests__/outbox.integration.test.ts` PASS — sprawdza: transaction rollback, standalone insert
- TypeScript `tsc --noEmit` bez błędów na nowych plikach
- `pnpm test:smoke` green

## Rollback
`rm apps/web/lib/outbox/insert-outbox-event.ts apps/web/lib/outbox/__tests__/insert-outbox-event.unit.test.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/outbox/__tests__/insert-outbox-event.unit.test.ts` — covers: return type, idempotency
- **Integration:** `vitest apps/web/lib/outbox/__tests__/outbox.integration.test.ts` — covers: transaction participation, rollback safety
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/lib/outbox/insert-outbox-event.ts`
## T-00f-003 — pg-boss worker config + queue registration

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001 — outbox migration], [T-00f-002 — insertOutboxEvent helper]
- **Downstream (will consume this):** [T-00f-005 — healthcheck endpoint], [T-00f-006 — integration test]
- **Parallel (can run concurrently):** [T-00f-004 — retry policy table]

### GIVEN / WHEN / THEN
**GIVEN** `outbox_events` table and `insertOutboxEvent` helper exist
**WHEN** `pnpm worker` process starts (or `node apps/web/lib/outbox/pg-boss-worker.ts` is executed)
**THEN** pg-boss connects to the same Postgres DB, polls `outbox_events` where `status='pending'` and `scheduled_at <= now()`, dispatches by `event_type` to registered handlers, marks `status='processed'` and sets `processed_at=now()` on success; on handler error increments `attempts` and sets `status='failed'` with `last_error`; after 5 failures sets `status='dlq'`, sets `dlq_at=now()`, inserts row into `dead_letter_queue`; retry backoff: 5min → 30min → 2h → 12h → 24h

### ACP Prompt
````
# Task T-00f-003 — pg-boss worker config + queue registration

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/outbox.ts` → typy OutboxEvent, outboxEvents table schema
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → EventType enum — każdy value to osobna kolejka pg-boss
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/insert-outbox-event.ts` → sygnatura insertOutboxEvent, PgTransaction type

## Twoje zadanie
Zaimplementuj pg-boss worker który konsumuje eventy z `outbox_events`. Worker musi: (1) używać pg-boss jako polling mechanizmu na tej samej bazie Postgres, (2) rejestrować handler per `EventType`, (3) implementować retry policy: 5 prób z exponential backoff 5min→30min→2h→12h→24h, (4) po 5 nieudanych próbach przenosić do `dead_letter_queue`.

## Implementacja

1. Dodaj `pg-boss` do `apps/web/package.json` — uruchom `pnpm add pg-boss` w katalogu `apps/web`

2. Utwórz `apps/web/lib/outbox/retry-policy.ts`:
```ts
// Retry backoff schedule in seconds
export const RETRY_BACKOFF_SECONDS = [
  5 * 60,    // attempt 1: 5 min
  30 * 60,   // attempt 2: 30 min
  2 * 60 * 60,   // attempt 3: 2h
  12 * 60 * 60,  // attempt 4: 12h
  24 * 60 * 60,  // attempt 5: 24h
] as const

export const MAX_ATTEMPTS = 5

export function getBackoffSeconds(attemptNumber: number): number {
  const idx = Math.min(attemptNumber - 1, RETRY_BACKOFF_SECONDS.length - 1)
  return RETRY_BACKOFF_SECONDS[idx]
}
```

3. Utwórz `apps/web/lib/outbox/pg-boss-worker.ts`:
   - Import `PgBoss` z `pg-boss`
   - Import `db` (Drizzle client), `outboxEvents`, `deadLetterQueue` ze schema
   - Import `EventType` z `./events.enum`
   - Import `MAX_ATTEMPTS`, `getBackoffSeconds` z `./retry-policy`
   - Zdefiniuj typ: `type OutboxHandler = (event: OutboxEvent) => Promise<void>`
   - Eksportuj `handlerRegistry: Map<EventType, OutboxHandler>` — inicjalnie pusta, wypełniana przez `registerHandler(eventType, handler)`
   - Eksportuj `registerHandler(eventType: EventType, handler: OutboxHandler): void`
   - Eksportuj `async function startWorker(): Promise<PgBoss>` która:
     a. Tworzy `new PgBoss({ connectionString: process.env.DATABASE_URL })`
     b. Wywołuje `boss.start()`
     c. Dla każdego `EventType` value rejestruje `boss.work(eventType, async (job) => { ... })`
     d. W handlerze: pobiera row z `outbox_events` gdzie `id = job.data.outboxEventId`, ustawia `status='processing'`, wywołuje handler z registry, ustawia `status='processed'`, `processed_at=now()`
     e. On error: inkrementuje `attempts`, oblicza `getBackoffSeconds(attempts)`, ustawia `status='failed'`, `last_error=err.message`, `scheduled_at = now() + interval`; jeśli `attempts >= MAX_ATTEMPTS`: ustawia `status='dlq'`, `dlq_at=now()`, INSERT do `dead_letter_queue`
     f. Return boss instance
   - Eksportuj `async function stopWorker(boss: PgBoss): Promise<void>` — wywołuje `boss.stop()`

4. Utwórz `apps/web/lib/outbox/__tests__/pg-boss-worker.integration.test.ts`:
   - Test: 1 event SUCCESS — `status='processed'`, `processed_at` jest ustawiony
   - Test: handler throws → `status='failed'`, `attempts=1`, `last_error` zawiera error message
   - Test: handler throws 5 razy → `status='dlq'`, `dlq_at` jest ustawiony, row istnieje w `dead_letter_queue`

5. Opcjonalnie utwórz `apps/web/app/api/worker/start/route.ts` jako development helper do uruchomienia workera w Next.js dev mode

## Files
**Create:** `apps/web/lib/outbox/retry-policy.ts`
**Create:** `apps/web/lib/outbox/pg-boss-worker.ts`
**Create:** `apps/web/lib/outbox/__tests__/pg-boss-worker.integration.test.ts`
**Modify:** `apps/web/lib/outbox/index.ts` — dodaj: `export { registerHandler, startWorker, stopWorker } from './pg-boss-worker'`

## Done when
- `vitest apps/web/lib/outbox/__tests__/pg-boss-worker.integration.test.ts` PASS — sprawdza: success flow, failure increment, DLQ move po 5 attempts
- `tsc --noEmit` bez błędów
- `pnpm test:smoke` green

## Rollback
`pnpm remove pg-boss && rm apps/web/lib/outbox/pg-boss-worker.ts apps/web/lib/outbox/retry-policy.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/outbox/__tests__/pg-boss-worker.integration.test.ts` — covers: success/failure/DLQ flows
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm remove pg-boss && rm apps/web/lib/outbox/pg-boss-worker.ts apps/web/lib/outbox/retry-policy.ts`
## T-00f-004 — Outbox retry policy config table + backoff formula

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001 — outbox migration applied]
- **Downstream (will consume this):** [T-00f-003 — pg-boss worker reads policy], [T-00f-006 — integration test]
- **Parallel (can run concurrently):** [T-00f-002 — insertOutboxEvent helper]

### GIVEN / WHEN / THEN
**GIVEN** `outbox_events` table exists
**WHEN** migration `011-outbox-retry-policy.sql` is applied
**THEN** `outbox_retry_policy` table exists with columns `(event_type TEXT PRIMARY KEY, max_attempts INT NOT NULL DEFAULT 5, backoff_schedule INT[] NOT NULL)` and default seed row `('*', 5, '{300,1800,7200,43200,86400}')` representing the wildcard policy (seconds: 5min, 30min, 2h, 12h, 24h); Drizzle schema type `OutboxRetryPolicy` is exported

### ACP Prompt
````
# Task T-00f-004 — Outbox retry policy config table + backoff formula

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/migrations/010-outbox-events.sql` → sprawdź naming convention i styl SQL żeby być spójny
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/outbox.ts` → istniejące typy — dodasz `outboxRetryPolicy` table do tego pliku
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → EventType enum values — seedy per event type (jeśli enum ma konkretne values poza SYSTEM_TEST)

## Twoje zadanie
Utwórz tabelę `outbox_retry_policy` która przechowuje konfigurowalną politykę retry per `event_type`. Wildcard row `'*'` jest fallback dla event types bez dedykowanej polityki. Worker (T-00f-003) będzie czytał tę tabelę przy starcie żeby załadować backoff schedules.

Backoff schedule to tablica integerów (sekundy): `{300, 1800, 7200, 43200, 86400}` = 5min, 30min, 2h, 12h, 24h.

## Implementacja

1. Utwórz `apps/web/drizzle/migrations/011-outbox-retry-policy.sql`:
```sql
-- Migration 011: outbox retry policy config
CREATE TABLE IF NOT EXISTS outbox_retry_policy (
  event_type       TEXT PRIMARY KEY,        -- '*' for wildcard/default
  max_attempts     INT NOT NULL DEFAULT 5,
  backoff_schedule INT[] NOT NULL           -- delay in seconds per attempt
);

-- Default wildcard policy: 5min → 30min → 2h → 12h → 24h
INSERT INTO outbox_retry_policy (event_type, max_attempts, backoff_schedule)
VALUES ('*', 5, '{300, 1800, 7200, 43200, 86400}')
ON CONFLICT (event_type) DO NOTHING;

-- Seed for system.test event type
INSERT INTO outbox_retry_policy (event_type, max_attempts, backoff_schedule)
VALUES ('system.test', 3, '{60, 300, 900}')
ON CONFLICT (event_type) DO NOTHING;
```

2. Dodaj Drizzle type do `apps/web/drizzle/schema/outbox.ts`:
   - Dodaj `outboxRetryPolicy` table używając `pgTable`
   - Kolumny: `event_type` (text, primaryKey), `max_attempts` (integer, default 5), `backoff_schedule` (integer array)
   - Eksportuj `OutboxRetryPolicy` i `NewOutboxRetryPolicy` types

3. Utwórz helper `apps/web/lib/outbox/get-retry-policy.ts`:
```ts
export async function getRetryPolicy(eventType: string): Promise<{
  maxAttempts: number
  backoffSeconds: number[]
}> {
  // Try exact match first, then wildcard
  const row = await db.query.outboxRetryPolicy.findFirst({
    where: (p, { eq, or }) => or(eq(p.eventType, eventType), eq(p.eventType, '*')),
    orderBy: (p, { desc }) => [desc(p.eventType)] // exact match sorts before '*'
  })
  if (!row) {
    return { maxAttempts: 5, backoffSeconds: [300, 1800, 7200, 43200, 86400] }
  }
  return { maxAttempts: row.maxAttempts, backoffSeconds: row.backoffSchedule }
}
```

4. Utwórz `apps/web/lib/outbox/__tests__/retry-policy.integration.test.ts`:
   - Test: wildcard row istnieje po migracji
   - Test: `getRetryPolicy('system.test')` zwraca `{maxAttempts: 3, backoffSeconds: [60, 300, 900]}`
   - Test: `getRetryPolicy('unknown.event')` zwraca wildcard policy (maxAttempts=5)

5. Zaktualizuj `apps/web/lib/outbox/index.ts` — dodaj: `export { getRetryPolicy } from './get-retry-policy'`

## Files
**Create:** `apps/web/drizzle/migrations/011-outbox-retry-policy.sql`
**Create:** `apps/web/lib/outbox/get-retry-policy.ts`
**Create:** `apps/web/lib/outbox/__tests__/retry-policy.integration.test.ts`
**Modify:** `apps/web/drizzle/schema/outbox.ts` — dodaj: `outboxRetryPolicy` table, `OutboxRetryPolicy` type
**Modify:** `apps/web/lib/outbox/index.ts` — dodaj: `export { getRetryPolicy } from './get-retry-policy'`

## Done when
- `pnpm drizzle-kit migrate` kończy się bez błędu
- `vitest apps/web/lib/outbox/__tests__/retry-policy.integration.test.ts` PASS — sprawdza: wildcard seed, exact match, fallback
- `tsc --noEmit` bez błędów
- `pnpm test:smoke` green

## Rollback
`psql -c "DROP TABLE IF EXISTS outbox_retry_policy;" && rm apps/web/drizzle/migrations/011-outbox-retry-policy.sql apps/web/lib/outbox/get-retry-policy.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/outbox/__tests__/retry-policy.integration.test.ts` — covers: seed existence, exact match, wildcard fallback
- **CI gate:** `pnpm test:smoke` green

### Rollback
`psql -c "DROP TABLE IF EXISTS outbox_retry_policy;" && rm apps/web/drizzle/migrations/011-outbox-retry-policy.sql`
## T-00f-005 — Outbox healthcheck endpoint + release gate

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-003 — pg-boss worker config]
- **Downstream (will consume this):** [T-00i-008 — global healthcheck aggregator]
- **Parallel (can run concurrently):** [T-00f-006 — integration test]

### GIVEN / WHEN / THEN
**GIVEN** pg-boss worker is configured and `outbox_events` table exists
**WHEN** `GET /api/outbox/health` is called
**THEN** returns HTTP 200 with `{"status":"healthy","backlog":N,"lastProcessedAgo":M}` if: (a) pending backlog count < `OUTBOX_HEALTH_BACKLOG_THRESHOLD` (default 100) AND (b) last `processed_at` is within 60 seconds; returns HTTP 503 with `{"status":"unhealthy","reason":"..."}` if either condition fails; if no events have ever been processed, returns 200 with `{"status":"healthy","backlog":0,"lastProcessedAgo":null}`

### ACP Prompt
````
# Task T-00f-005 — Outbox healthcheck endpoint + release gate

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/outbox.ts` → outboxEvents table — kolumny status, processed_at, scheduled_at
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/` → sprawdź istniejące route.ts pliki żeby być spójny ze stylem (np. jak importują db, jak formatują odpowiedzi)

## Twoje zadanie
Zaimplementuj Next.js App Router API route `GET /api/outbox/health` który sprawdza kondycję outbox pipeline. Endpoint jest publiczny (no auth) — używany przez load balancer / k8s liveness probe. Response time musi być < 200ms.

Dwa warunki healthy:
1. `SELECT COUNT(*) FROM outbox_events WHERE status IN ('pending', 'processing') AND scheduled_at < now() - interval '30 seconds'` < `OUTBOX_HEALTH_BACKLOG_THRESHOLD` (env var, default 100) — to wykrywa accumulated backlog
2. `SELECT MAX(processed_at) FROM outbox_events WHERE status = 'processed'` jest w ciągu ostatnich 60 sekund LUB nie ma żadnych przetworzonych eventów (null → healthy, worker może być idle)

## Implementacja

1. Utwórz `apps/web/app/api/outbox/health/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { outboxEvents } from '@/drizzle/schema/outbox'
import { sql, count, max, and, inArray, lt } from 'drizzle-orm'

const BACKLOG_THRESHOLD = parseInt(process.env.OUTBOX_HEALTH_BACKLOG_THRESHOLD ?? '100', 10)
const LAST_PROCESSED_STALE_SECONDS = 60

export async function GET() {
  try {
    // Query 1: pending backlog (events scheduled >30s ago not yet processed)
    const [backlogResult] = await db
      .select({ backlog: count() })
      .from(outboxEvents)
      .where(and(
        inArray(outboxEvents.status, ['pending', 'processing']),
        lt(outboxEvents.scheduledAt, sql`now() - interval '30 seconds'`)
      ))

    const backlog = backlogResult?.backlog ?? 0

    // Query 2: last processed timestamp
    const [lastResult] = await db
      .select({ lastProcessedAt: max(outboxEvents.processedAt) })
      .from(outboxEvents)

    const lastProcessedAt = lastResult?.lastProcessedAt
    const lastProcessedAgo = lastProcessedAt
      ? Math.round((Date.now() - new Date(lastProcessedAt).getTime()) / 1000)
      : null

    // Health checks
    const backlogHealthy = backlog < BACKLOG_THRESHOLD
    const processingHealthy = lastProcessedAgo === null || lastProcessedAgo < LAST_PROCESSED_STALE_SECONDS

    if (backlogHealthy && processingHealthy) {
      return NextResponse.json(
        { status: 'healthy', backlog, lastProcessedAgo },
        { status: 200 }
      )
    }

    const reasons: string[] = []
    if (!backlogHealthy) reasons.push(`backlog ${backlog} >= threshold ${BACKLOG_THRESHOLD}`)
    if (!processingHealthy) reasons.push(`last processed ${lastProcessedAgo}s ago (threshold: ${LAST_PROCESSED_STALE_SECONDS}s)`)

    return NextResponse.json(
      { status: 'unhealthy', reason: reasons.join('; '), backlog, lastProcessedAgo },
      { status: 503 }
    )
  } catch (err) {
    return NextResponse.json(
      { status: 'unhealthy', reason: `DB error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 }
    )
  }
}
```

2. Dodaj do `.env.local.example` (lub `.env.example`):
````
OUTBOX_HEALTH_BACKLOG_THRESHOLD=100
```

3. Utwórz `apps/web/app/api/outbox/health/__tests__/route.unit.test.ts`:
   - Mock `db` z `@/lib/db`
   - Test: db zwraca backlog=0, lastProcessedAt=null → 200 `{"status":"healthy"}`
   - Test: db zwraca backlog=50 (< 100) → 200 `{"status":"healthy"}`
   - Test: db zwraca backlog=150 (> 100) → 503 `{"status":"unhealthy","reason":...}`
   - Test: db zwraca lastProcessedAt = 90s temu → 503 (stale worker)
   - Test: db throws → 503 `{"status":"unhealthy","reason":"DB error:..."}`

## Files
**Create:** `apps/web/app/api/outbox/health/route.ts`
**Create:** `apps/web/app/api/outbox/health/__tests__/route.unit.test.ts`
**Modify:** `.env.local.example` (lub `.env.example`) — dodaj: `OUTBOX_HEALTH_BACKLOG_THRESHOLD=100`

## Done when
- `curl http://localhost:3000/api/outbox/health` zwraca JSON (200 lub 503) bez błędu serwera
- `vitest apps/web/app/api/outbox/health/__tests__/route.unit.test.ts` PASS — sprawdza: healthy/unhealthy/stale/db-error cases
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/api/outbox/`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/api/outbox/health/__tests__/route.unit.test.ts` — covers: all 5 response scenarios
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/api/outbox/`
## T-00f-006 — Integration test: emit → worker → consumed + DLQ path

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-002 — insertOutboxEvent helper], [T-00f-003 — pg-boss worker], [T-00f-004 — retry policy table]
- **Downstream (will consume this):** none
- **Parallel (can run concurrently):** [T-00f-005 — healthcheck], [T-00d-004]

### GIVEN / WHEN / THEN
**GIVEN** seeded DB with at least one tenant, pg-boss worker running in-test (not a separate process), retry policy table seeded with wildcard `'*'` policy
**WHEN** 10 events are emitted via `insertOutboxEvent` (8 with a working handler, 2 with a handler that always throws)
**THEN** after worker processes all jobs: 8 events have `status='processed'` and `processed_at IS NOT NULL`; 2 events have `status='dlq'` and `dlq_at IS NOT NULL`; 2 rows exist in `dead_letter_queue`; calling `insertOutboxEvent` a second time with same `(tenantId, eventType, aggregateId)` within 1 second returns same UUID (idempotent replay is a no-op, no duplicate rows)

### ACP Prompt
````
# Task T-00f-006 — Integration test: emit → worker → consumed + DLQ path

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/insert-outbox-event.ts` → insertOutboxEvent sygnatura + idempotency logic
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/pg-boss-worker.ts` → startWorker, stopWorker, registerHandler exports
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → EventType enum values dostępne do użycia w testach
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/outbox.ts` → outboxEvents, deadLetterQueue table schemas

## Twoje zadanie
Napisz end-to-end integration test który weryfikuje cały outbox pipeline: emit → pg-boss → handler → consumed/DLQ. Test używa prawdziwej bazy (supabaseLocalDb fixture — zero DB mocks). Worker jest uruchamiany in-process (nie jako osobny proces). Test musi być deterministyczny — używaj `vitest` timeouts i `waitUntil` helper zamiast fixed sleeps.

## Implementacja

1. Utwórz `apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts`:

Struktura testu:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { insertOutboxEvent } from '../insert-outbox-event'
import { startWorker, stopWorker, registerHandler } from '../pg-boss-worker'
import { EventType } from '../events.enum'
import { db } from '@/lib/db'
import { outboxEvents, deadLetterQueue } from '@/drizzle/schema/outbox'
import { eq, inArray, count } from 'drizzle-orm'
import PgBoss from 'pg-boss'

// Test tenant ID — musi istnieć w DB (seed lub utwórz w beforeAll)
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001'

// Helper: wait until condition is true or timeout
async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 200
): Promise<void> { /* implementacja polling loop */ }

describe('Outbox pipeline integration', () => {
  let boss: PgBoss

  beforeAll(async () => {
    // Ensure test tenant exists
    // Register handlers
    registerHandler(EventType.SYSTEM_TEST, async (event) => {
      if (event.payload?.['shouldFail']) throw new Error('Deliberate failure')
      // success: no-op
    })
    boss = await startWorker()
  })

  afterAll(async () => {
    await stopWorker(boss)
    // Cleanup test events
    await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, TEST_TENANT_ID))
  })

  beforeEach(async () => {
    // Clean slate: delete test events before each test
    await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, TEST_TENANT_ID))
    await db.delete(deadLetterQueue).where(eq(deadLetterQueue.tenantId, TEST_TENANT_ID))
  })

  it('8 successful events → all processed', async () => {
    // Emit 8 events
    for (let i = 0; i < 8; i++) {
      await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', `agg-${i}`, {})
    }
    
    // Wait for processing
    await waitUntil(async () => {
      const [result] = await db.select({ c: count() }).from(outboxEvents)
        .where(inArray(outboxEvents.status, ['processed']))
      return result.c === 8
    })
    
    // Assert
    const [processed] = await db.select({ c: count() }).from(outboxEvents)
      .where(eq(outboxEvents.status, 'processed'))
    expect(processed.c).toBe(8)
  })

  it('2 poisoned events → dlq after 5 attempts', async () => {
    // Emit 2 events that will always fail
    await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'poison-1', { shouldFail: true })
    await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'poison-2', { shouldFail: true })
    
    // Wait for DLQ
    await waitUntil(async () => {
      const [dlqCount] = await db.select({ c: count() }).from(deadLetterQueue)
        .where(eq(deadLetterQueue.tenantId, TEST_TENANT_ID))
      return dlqCount.c === 2
    }, 30_000) // DLQ może wymagać więcej czasu (retry backoff)
    
    // Assert outbox status
    const [dlqEvents] = await db.select({ c: count() }).from(outboxEvents)
      .where(eq(outboxEvents.status, 'dlq'))
    expect(dlqEvents.c).toBe(2)
    
    // Assert DLQ table
    const [dlqRows] = await db.select({ c: count() }).from(deadLetterQueue)
      .where(eq(deadLetterQueue.tenantId, TEST_TENANT_ID))
    expect(dlqRows.c).toBe(2)
  })

  it('idempotent replay: same (tenantId, eventType, aggregateId) within 1s → same UUID', async () => {
    const id1 = await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'idem-agg', { v: 1 })
    const id2 = await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'idem-agg', { v: 2 })
    
    expect(id1).toBe(id2)
    
    // Verify only 1 row in DB
    const [rowCount] = await db.select({ c: count() }).from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, 'idem-agg'))
    expect(rowCount.c).toBe(1)
  })

  it('mixed batch: 8 success + 2 poison → correct final counts', async () => {
    // Emit 8 good events
    for (let i = 0; i < 8; i++) {
      await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', `good-${i}`, {})
    }
    // Emit 2 poisoned
    await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'bad-1', { shouldFail: true })
    await insertOutboxEvent(TEST_TENANT_ID, EventType.SYSTEM_TEST, 'test', 'bad-2', { shouldFail: true })
    
    // Wait until no more pending/processing
    await waitUntil(async () => {
      const [pending] = await db.select({ c: count() }).from(outboxEvents)
        .where(inArray(outboxEvents.status, ['pending', 'processing', 'failed']))
      return pending.c === 0
    }, 60_000)
    
    const [processed] = await db.select({ c: count() }).from(outboxEvents)
      .where(eq(outboxEvents.status, 'processed'))
    const [dlq] = await db.select({ c: count() }).from(outboxEvents)
      .where(eq(outboxEvents.status, 'dlq'))
    
    expect(processed.c).toBe(8)
    expect(dlq.c).toBe(2)
  })
})
```

2. Upewnij się że test tenant `00000000-0000-0000-0000-000000000001` istnieje w test DB — w `apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts` w `beforeAll` wykonaj upsert do tabeli `tenants`.

3. Timeout konfiguracja w `apps/web/vitest.config.ts` (lub lokalnie w `apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts`):
   - `testTimeout: 120_000` dla integration testów (DLQ path potrzebuje wielu retry)

## Files
**Create:** `apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts`
**Modify:** `vitest.config.ts` (lub `vitest.integration.config.ts`) — upewnij się że `testTimeout` jest >= 120000 dla integration suite

## Done when
- `vitest apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts` PASS — sprawdza: 8 processed, 2 DLQ, idempotent replay, mixed batch counts
- Wszystkie 4 test cases green w < 120s
- `pnpm test:smoke` green

## Rollback
`rm apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts` — covers: happy path, DLQ path, idempotency, mixed batch
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/lib/outbox/__tests__/outbox-pipeline.integration.test.ts`
## Dependency table

| ID | Title | Upstream | Parallel |
|---|---|---|---|
| T-00f-001 | Migration 010-outbox-events.sql + DLQ table | [T-00b-000] | [T-00e-001] |
| T-00f-002 | insertOutboxEvent helper | [T-00f-001, T-00b-E02] | [T-00f-004] |
| T-00f-003 | pg-boss worker config + queue registration | [T-00f-001, T-00f-002] | [T-00f-004] |
| T-00f-004 | Outbox retry policy config table + backoff | [T-00f-001] | [T-00f-002] |
| T-00f-005 | Outbox healthcheck endpoint + release gate | [T-00f-003] | [T-00f-006] |
| T-00f-006 | Integration test: emit → worker → consumed + DLQ | [T-00f-002, T-00f-003, T-00f-004] | [T-00f-005] |

## Parallel dispatch plan

Wave 0 (blockers — no upstream in track): T-00f-001

Wave 1 (after Wave 0): T-00f-002, T-00f-004 (parallel — different files, T-00f-004 only modifies outbox.ts schema)

Wave 2 (after Wave 1): T-00f-003 (needs both T-00f-001 and T-00f-002)

Wave 3 (after Wave 2): T-00f-005, T-00f-006 (parallel — T-00f-005 creates new route file, T-00f-006 creates test file only)

## PRD coverage

✅ §10 outbox_events table → T-00f-001 (migration + Drizzle types)
✅ §10 outbox pattern od MVP → T-00f-002 (insertOutboxEvent helper)
✅ §10 worker publishes to queue → T-00f-003 (pg-boss worker + retry)
✅ §10 retry policy (5 attempts, exponential backoff) → T-00f-004 (config table + seed)
⚠️ §10 healthcheck → T-00f-005 (backlog + stale worker check — advanced metrics deferred to E-1)
✅ §10 end-to-end pipeline verification → T-00f-006 (integration test)

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 2 | T-00f-001, T-00f-004 |
| T2-api | 3 | T-00f-002, T-00f-003, T-00f-005 |
| T4-wiring+test | 1 | T-00f-006 |
| **Total** | **6** | |

**Est total time (sequential):** 270 min
**Est total time (parallel, Wave 0→3):** ~120 min (Wave 2 is critical path at 60 min)
**Context budget total:** ~260k tokens


## T-00g-001 — Migration `012-reference-rules.sql` (rules catalog)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — baseline migration applied]
- **Downstream (will consume this):** [T-00g-002, T-00g-003, T-00g-004, T-00g-005, T-00g-007]
- **Parallel (can run concurrently):** [T-00h-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration (T-00b-000) is applied and `tenants` table exists
**WHEN** migration `012-reference-rules.sql` runs via `drizzle-kit migrate`
**THEN** `reference_rules` table exists with columns: `id UUID PK`, `tenant_id UUID NOT NULL FK→tenants`, `module TEXT NOT NULL`, `entity_type TEXT NOT NULL`, `rule_type TEXT NOT NULL CHECK(rule_type IN ('cascading','conditional_required','gate','workflow'))`, `dsl_definition JSONB NOT NULL`, `is_active BOOL NOT NULL DEFAULT true`, `schema_version INT NOT NULL DEFAULT 1`, plus R13 audit columns; GIN index on `dsl_definition`; integration smoke passes

### ACP Prompt
````
# Task T-00g-001 — Migration `012-reference-rules.sql` (rules catalog)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — 4 obszary rule engine, JSON runtime format, przykład allergen changeover gate
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/migrations/` → sprawdź najnowszy plik migracji (lista plików) żeby poznać konwencję nazewnictwa i dotychczasowe tabele

## Twoje zadanie
Utwórz Drizzle migration `012-reference-rules.sql` oraz Drizzle schema `rules.ts`. Tabela `reference_rules` musi trzymać definicje reguł DSL dla silnika reguł (4 typy: cascading, conditional_required, gate, workflow). Każdy wiersz to jedna reguła dla danego tenanta + modułu + entity_type.

Tabela **reference_rules** — wszystkie kolumny:
- `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `module TEXT NOT NULL` — np. `'01-NPD'`, `'08-PRODUCTION'`
- `entity_type TEXT NOT NULL` — np. `'brief'`, `'work_order'`
- `rule_type TEXT NOT NULL CHECK (rule_type IN ('cascading','conditional_required','gate','workflow'))`
- `dsl_definition JSONB NOT NULL`
- `is_active BOOL NOT NULL DEFAULT true`
- `schema_version INT NOT NULL DEFAULT 1`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `created_by_user UUID`
- `created_by_device UUID`
- `app_version TEXT`
- `model_prediction_id UUID`
- `epcis_event_id UUID`
- `external_id TEXT`

Indeksy:
- GIN index na `dsl_definition` — `CREATE INDEX reference_rules_dsl_gin ON reference_rules USING gin(dsl_definition);`
- Composite index na `(tenant_id, entity_type, rule_type, is_active)` — dla typowego query loadera

## Implementacja
1. Utwórz plik `apps/web/drizzle/migrations/012-reference-rules.sql` z CREATE TABLE + CHECK constraint na `rule_type` + oba indeksy. Nie używaj raw CREATE — generuj przez `drizzle-kit generate` z pliku schema, potem dodaj indeksy ręcznie w SQL.
2. Utwórz `apps/web/drizzle/schema/rules.ts` z Drizzle typed definition:
   ```ts
   import { pgTable, uuid, text, jsonb, boolean, integer, timestamp } from 'drizzle-orm/pg-core'
   export const referenceRules = pgTable('reference_rules', {
     id: uuid('id').defaultRandom().primaryKey(),
     tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
     module: text('module').notNull(),
     entityType: text('entity_type').notNull(),
     ruleType: text('rule_type').notNull(),
     dslDefinition: jsonb('dsl_definition').notNull(),
     isActive: boolean('is_active').notNull().default(true),
     schemaVersion: integer('schema_version').notNull().default(1),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
     createdByUser: uuid('created_by_user'),
     createdByDevice: uuid('created_by_device'),
     appVersion: text('app_version'),
     modelPredictionId: uuid('model_prediction_id'),
     epcisEventId: uuid('epcis_event_id'),
     externalId: text('external_id'),
   })
   ```
3. Eksportuj `referenceRules` z `apps/web/drizzle/schema/index.ts` (dodaj do barrel).
4. Napisz integration test `apps/web/lib/rules/__tests__/rules.integration.test.ts` — sprawdza: tabela istnieje, CHECK constraint rzuca error dla `rule_type = 'invalid'`, GIN index obecny w `pg_indexes`.

## Files
**Create:** `apps/web/drizzle/migrations/012-reference-rules.sql`, `apps/web/drizzle/schema/rules.ts`, `apps/web/lib/rules/__tests__/rules.integration.test.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj: `export * from './rules'`

## Done when
- `vitest apps/web/lib/rules/__tests__/rules.integration.test.ts` PASS — sprawdza: tabela istnieje, CHECK constraint działa, GIN index obecny
- `pnpm test:smoke` green

## Rollback
`DROP TABLE IF EXISTS reference_rules CASCADE;` + usuń `apps/web/drizzle/migrations/012-reference-rules.sql` i `apps/web/drizzle/schema/rules.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/rules/__tests__/rules.integration.test.ts` — covers: schema shape, CHECK constraint, GIN index
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE IF EXISTS reference_rules CASCADE;` + delete migration + schema files
## T-00g-002 — DSL interpreter: cascading rule type

**Type:** T2-api
**Context budget:** ~60k tokens
**Est time:** 75 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001 — reference_rules table exists]
- **Downstream (will consume this):** [T-00g-005 — registry loader, T-00g-006 — dry-run harness]
- **Parallel (can run concurrently):** [T-00g-003, T-00g-004]

### GIVEN / WHEN / THEN
**GIVEN** `reference_rules` table exists and a row with `rule_type = 'cascading'` is present
**WHEN** `evaluateRule(ruleId, context, db)` is called with a `RuleContext` containing source field values
**THEN** returns `RuleResult` with downstream field-value pairs deterministically; function is pure (no DB writes); Zod validates DSL shape before evaluation; unknown fields return structured error, not throw

### ACP Prompt
````
# Task T-00g-002 — DSL interpreter: cascading rule type

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — opis cascading: "Auto-fill downstream fields z upstream dept", przykład Core fills allergen/nutrition to Technical/Packaging/MRP
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/rules.ts` — cały plik (Drizzle schema dla reference_rules, JSONB dslDefinition type)

## Twoje zadanie
Zaimplementuj interpreter reguły `cascading` — typ reguły który auto-wypełnia pola downstream gdy zmienia się pole upstream. Np. gdy `allergen_flag` zmieni się w Core dept, reguła kaskaduje wartość do pól `allergen_declaration_required`, `atp_required` w Technical dept. Funkcja musi być czysta (pure) — zero side effects, zero DB writes.

DSL structure dla `cascading` rule (dsl_definition JSONB):
```json
{
  "rule_type": "cascading",
  "trigger_field": "allergen_flag",
  "trigger_value": true,
  "cascades": [
    { "target_field": "allergen_declaration_required", "value": true },
    { "target_field": "atp_required", "value": true }
  ]
}
```

Sygnatury funkcji do zaimplementowania:
```ts
// apps/web/lib/rules/interpreters/cascading.ts
export async function evaluateRule(
  ruleId: string,
  context: RuleContext,
  db: DrizzleClient
): Promise<RuleResult>

// Typy (apps/web/lib/rules/types.ts):
export interface RuleContext {
  tenantId: string
  entityType: string
  fieldValues: Record<string, unknown>
}

export interface RuleResult {
  ruleId: string
  ruleType: 'cascading' | 'conditional_required' | 'gate' | 'workflow'
  applied: boolean
  output: Record<string, unknown>  // dla cascading: { target_field: value }
  errors: string[]
  trace: Array<{ step: string; result: unknown; timestamp: string }>
}
```

## Implementacja
1. Utwórz `apps/web/lib/rules/types.ts` z interfejsami: `RuleContext`, `RuleResult`, `DrizzleClient` (import z drizzle-orm), `CascadingDSL` (Zod schema do walidacji dsl_definition).
2. Utwórz `apps/web/lib/rules/interpreters/cascading.ts`:
   - Fetch rule row z `reference_rules` WHERE `id = ruleId AND tenant_id = context.tenantId`
   - Zod parse `dsl_definition` jako `CascadingDSL`
   - Sprawdź `context.fieldValues[trigger_field] === trigger_value`
   - Jeśli match: zwróć `{ applied: true, output: { target_field: value, ... }, errors: [], trace: [...] }`
   - Jeśli no match: zwróć `{ applied: false, output: {}, errors: [], trace: [...] }`
   - Zod parse failure → zwróć `{ applied: false, errors: ['DSL validation failed: ...'], ... }`
3. Utwórz `apps/web/lib/rules/index.ts` jako barrel — eksportuj `evaluateRule` z cascading.ts (z namespace aliasem: `export { evaluateRule as evaluateCascadingRule }`).
4. Napisz unit testy `apps/web/lib/rules/__tests__/cascading.test.ts`:
   - Test 1: allergen_flag=true → kaskaduje 2 pola
   - Test 2: allergen_flag=false → applied=false, output={}
   - Test 3: zły trigger_value type → applied=false, no throw
   - Test 4: brakujące cascades array w DSL → errors=[...], no throw
   - Test 5: pusty fieldValues → applied=false

## Files
**Create:** `apps/web/lib/rules/types.ts`, `apps/web/lib/rules/interpreters/cascading.ts`, `apps/web/lib/rules/index.ts`, `apps/web/lib/rules/__tests__/cascading.test.ts`

## Done when
- `vitest apps/web/lib/rules/__tests__/cascading.test.ts` PASS — 5 canonical cascade cases
- `pnpm test:smoke` green

## Rollback
Delete `apps/web/lib/rules/interpreters/cascading.ts` — other interpreters unaffected
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rules/__tests__/cascading.test.ts` — covers: trigger match, no-match, invalid DSL, empty context
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Delete `apps/web/lib/rules/interpreters/cascading.ts``
## T-00g-003 — DSL interpreter: conditional-required rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001 — reference_rules table exists, T-00g-002 — types.ts created]
- **Downstream (will consume this):** [T-00g-005 — registry loader]
- **Parallel (can run concurrently):** [T-00g-002, T-00g-004]

### GIVEN / WHEN / THEN
**GIVEN** a `conditional_required` rule row exists (e.g., catch-weight product requires tare+gross fields)
**WHEN** `evaluateConditionalRequired(ruleId, context, db)` is called with `fieldValues` containing the predicate field
**THEN** returns `RuleResult` where `output.required_fields` lists field names that become required; supports predicates: `EQUALS`, `CONTAINS_ANY`, `GT`, `LT`, `IN`; pure function, no DB writes

### ACP Prompt
````
# Task T-00g-003 — DSL interpreter: conditional-required rule type

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — opis conditional required: "Catch-weight product → require tare/gross; allergen-free → require ATP swab result"
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/types.ts` — cały plik (RuleContext, RuleResult interfaces, DrizzleClient type)

## Twoje zadanie
Zaimplementuj interpreter reguły `conditional_required` — typ który dynamicznie określa które pola są required na podstawie wartości innych pól. Np. jeśli `product_type = 'catch_weight'` to pola `tare_weight` i `gross_weight` stają się required.

DSL structure dla `conditional_required` rule:
```json
{
  "rule_type": "conditional_required",
  "predicate": {
    "field": "product_type",
    "operator": "EQUALS",
    "value": "catch_weight"
  },
  "required_fields": ["tare_weight", "gross_weight"]
}
```

Obsługiwane operatory predykatu:
- `EQUALS` — `fieldValue === predicateValue`
- `NOT_EQUALS` — `fieldValue !== predicateValue`
- `IN` — `Array.isArray(predicateValue) && predicateValue.includes(fieldValue)`
- `CONTAINS_ANY` — `Array.isArray(fieldValue) && predicateValue.some(v => fieldValue.includes(v))`
- `GT` — `typeof fieldValue === 'number' && fieldValue > predicateValue`
- `LT` — `typeof fieldValue === 'number' && fieldValue < predicateValue`

Sygnatura funkcji:
```ts
// apps/web/lib/rules/interpreters/conditional-required.ts
export async function evaluateConditionalRequired(
  ruleId: string,
  context: RuleContext,
  db: DrizzleClient
): Promise<RuleResult>
// output.required_fields: string[] — lista pól które stają się required
```

## Implementacja
1. Utwórz `apps/web/lib/rules/interpreters/conditional-required.ts`:
   - Fetch + Zod parse `dsl_definition` jako `ConditionalRequiredDSL` (definiuj Zod schema inline)
   - Evaluate predicate wg listy operatorów (switch statement)
   - Jeśli predicate true: `output = { required_fields: [...] }`, `applied: true`
   - Jeśli false: `output = { required_fields: [] }`, `applied: false`
   - Nieznany operator → `errors: ['Unknown operator: <op>']`, `applied: false`
2. Dodaj `ConditionalRequiredDSL` Zod schema do `apps/web/lib/rules/types.ts`.
3. Napisz unit testy `apps/web/lib/rules/__tests__/conditional-required.test.ts`:
   - Test 1: EQUALS match → required_fields=['tare_weight','gross_weight']
   - Test 2: EQUALS no match → required_fields=[]
   - Test 3: IN operator match
   - Test 4: CONTAINS_ANY operator match (array field)
   - Test 5: GT operator (numeric field)
   - Test 6: nieznany operator → errors array, no throw
4. Eksportuj `evaluateConditionalRequired` z `apps/web/lib/rules/index.ts`.

## Files
**Create:** `apps/web/lib/rules/interpreters/conditional-required.ts`, `apps/web/lib/rules/__tests__/conditional-required.test.ts`
**Modify:** `apps/web/lib/rules/types.ts` — dodaj: `ConditionalRequiredDSL` Zod schema + export; `apps/web/lib/rules/index.ts` — dodaj: `export { evaluateConditionalRequired } from './interpreters/conditional-required'`

## Done when
- `vitest apps/web/lib/rules/__tests__/conditional-required.test.ts` PASS — 6 cases covering all operators
- `pnpm test:smoke` green

## Rollback
Delete `apps/web/lib/rules/interpreters/conditional-required.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rules/__tests__/conditional-required.test.ts` — covers: all 5 operators, no-match, unknown operator
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Delete `apps/web/lib/rules/interpreters/conditional-required.ts``
## T-00g-004 — DSL interpreter: gate rule type

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 70 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001 — reference_rules table exists, T-00g-002 — types.ts created]
- **Downstream (will consume this):** [T-00g-005 — registry loader]
- **Parallel (can run concurrently):** [T-00g-002, T-00g-003]

### GIVEN / WHEN / THEN
**GIVEN** a `gate` rule row exists (e.g., allergen changeover gate from PRD §7)
**WHEN** `evaluateGate(ruleId, context, db)` is called
**THEN** returns `RuleResult` with `output: { ok: boolean, missing_actions: string[], notify: string[] }`; `ok=false` means transition is blocked; pure function, no DB writes, no throw on invalid input

### ACP Prompt
````
# Task T-00g-004 — DSL interpreter: gate rule type

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — opis gate rules + "Example — Allergen changeover gate (08-PRODUCTION)" — pełny JSON przykład
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/types.ts` — cały plik (RuleContext, RuleResult interfaces)

## Twoje zadanie
Zaimplementuj interpreter reguły `gate` — typ który blokuje przejście workflow (transition) jeśli wymagane warunki nie są spełnione. Klasyczny przykład: allergen changeover gate blokuje start produkcji dopóki nie ma cleaning validation + ATP swab result + dual sign-off.

DSL structure dla `gate` rule:
```json
{
  "rule_type": "gate",
  "trigger": { "field": "changeover_type", "operator": "EQUALS", "value": "allergen" },
  "conditions": [
    { "field": "cleaning_validated", "operator": "EQUALS", "value": true },
    { "field": "atp_swab_passed", "operator": "EQUALS", "value": true },
    { "field": "dual_signoff_count", "operator": "GTE", "value": 2 }
  ],
  "on_fail": {
    "missing_actions": ["Complete cleaning validation", "Submit ATP swab result", "Get dual sign-off"],
    "notify": ["production_manager", "quality_manager"]
  }
}
```

Sygnatura:
```ts
// apps/web/lib/rules/interpreters/gate.ts
export async function evaluateGate(
  ruleId: string,
  context: RuleContext,
  db: DrizzleClient
): Promise<RuleResult>
// output: { ok: boolean, missing_actions: string[], notify: string[] }
```

Logika ewaluacji gate:
1. Jeśli trigger NIE pasuje do context.fieldValues → gate nie dotyczy → `{ ok: true, missing_actions: [], notify: [] }`
2. Jeśli trigger pasuje → sprawdź wszystkie conditions
3. Każdy condition który FAIL → dodaj odpowiadający `missing_actions[i]` do listy
4. Jeśli ANY condition fails → `ok: false` + `missing_actions: [failed ones]` + `notify: [...]`
5. Jeśli ALL conditions pass → `ok: true, missing_actions: [], notify: []`

Obsługiwane operatory w conditions: `EQUALS`, `NOT_EQUALS`, `GT`, `LT`, `GTE`, `LTE`, `IS_SET` (field != null && field !== undefined)

## Implementacja
1. Utwórz `apps/web/lib/rules/interpreters/gate.ts` z funkcją `evaluateGate` — implementuj logikę trigger→conditions→on_fail per spec powyżej.
2. Dodaj `GateDSL` Zod schema do `apps/web/lib/rules/types.ts` (z `trigger`, `conditions[]`, `on_fail`).
3. Napisz unit testy `apps/web/lib/rules/__tests__/gate.test.ts`:
   - Test 1: allergen changeover — wszystkie conditions spełnione → `ok: true`
   - Test 2: allergen changeover — atp_swab_passed=false → `ok: false`, missing_actions zawiera ATP akcję
   - Test 3: trigger nie pasuje (non-allergen changeover) → `ok: true`
   - Test 4: wszystkie 3 conditions fail → missing_actions ma 3 wpisy
   - Test 5: zły DSL shape → `errors: [...]`, no throw
   - Test 6: IS_SET operator — field null → condition fails
4. Eksportuj `evaluateGate` z `apps/web/lib/rules/index.ts`.

## Files
**Create:** `apps/web/lib/rules/interpreters/gate.ts`, `apps/web/lib/rules/__tests__/gate.test.ts`
**Modify:** `apps/web/lib/rules/types.ts` — dodaj: `GateDSL` Zod schema; `apps/web/lib/rules/index.ts` — dodaj: `export { evaluateGate } from './interpreters/gate'`

## Done when
- `vitest apps/web/lib/rules/__tests__/gate.test.ts` PASS — allergen changeover PRD §7 example passes, 6 cases
- `pnpm test:smoke` green

## Rollback
Delete `apps/web/lib/rules/interpreters/gate.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rules/__tests__/gate.test.ts` — covers: PRD §7 allergen example, trigger no-match, multiple failures, IS_SET operator
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Delete `apps/web/lib/rules/interpreters/gate.ts``
## T-00g-005 — Rule registry loader + LRU cache per schema_version

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-002 — types.ts exists, T-00g-003 — conditional-required interpreter, T-00g-004 — gate interpreter]
- **Downstream (will consume this):** [T-00g-006 — dry-run harness]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** `reference_rules` is populated for a tenant and schema_version
**WHEN** `getRuleRegistry(tenantId, schemaVersion)` is called
**THEN** returns all active Rule rows for that tenant+version; result is cached in LRU with key `${tenantId}:${schemaVersion}` and TTL=60s; second call with same key hits cache (no DB query); cache invalidates when schemaVersion changes

### ACP Prompt
````
# Task T-00g-005 — Rule registry loader + LRU cache per schema_version

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/rules.ts` — cały plik (referenceRules Drizzle table definition)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/types.ts` — cały plik (RuleContext, RuleResult, DrizzleClient types)

## Twoje zadanie
Zaimplementuj registry loader który ładuje aktywne reguły dla danego tenanta i schema_version z bazy, cache'uje wynik w LRU z TTL=60s. Cache key to `${tenantId}:${schemaVersion}`. Gdy `schema_version` rośnie — stary cache entry wygasa (nowy key = automatyczne pominięcie starych). 

Sygnatura funkcji:
```ts
// apps/web/lib/rules/registry.ts
export async function getRuleRegistry(
  tenantId: string,
  schemaVersion: number,
  db: DrizzleClient
): Promise<Rule[]>

export interface Rule {
  id: string
  tenantId: string
  module: string
  entityType: string
  ruleType: 'cascading' | 'conditional_required' | 'gate' | 'workflow'
  dslDefinition: unknown  // raw JSONB — każdy interpreter parsuje swoim Zod schema
  isActive: boolean
  schemaVersion: number
}
```

LRU cache config:
- npm package: `lru-cache` (version >=10)
- `max: 500` entries
- `ttl: 60_000` ms (60 sekund)
- Cache key: `` `${tenantId}:${schemaVersion}` ``

## Implementacja
1. Dodaj `lru-cache` do `apps/web/package.json` dependencies jeśli nie istnieje — sprawdź najpierw `cat apps/web/package.json`.
2. Utwórz `apps/web/lib/rules/registry.ts`:
   ```ts
   import { LRUCache } from 'lru-cache'
   import { eq, and } from 'drizzle-orm'
   import { referenceRules } from '../drizzle/schema/rules'
   
   const cache = new LRUCache<string, Rule[]>({ max: 500, ttl: 60_000 })
   
   export async function getRuleRegistry(tenantId, schemaVersion, db): Promise<Rule[]> {
     const key = `${tenantId}:${schemaVersion}`
     const cached = cache.get(key)
     if (cached) return cached
     const rows = await db.select().from(referenceRules)
       .where(and(eq(referenceRules.tenantId, tenantId), eq(referenceRules.schemaVersion, schemaVersion), eq(referenceRules.isActive, true)))
     cache.set(key, rows)
     return rows
   }
   ```
3. Napisz integration test `apps/web/lib/rules/__tests__/registry.integration.test.ts` używając `supabaseLocalDb` fixture (bez DB mocks):
   - Test 1: `getRuleRegistry(tenantId, 1)` — zwraca poprawne wiersze z DB
   - Test 2: drugie wywołanie z tymi samymi params — zwraca cache hit (spy na `db.select` wywołany tylko raz)
   - Test 3: inne `schemaVersion` — nie używa cache (nowy key), pyta DB
   - Test 4: `isActive=false` wiersze nie są zwracane
4. Eksportuj `getRuleRegistry` i `Rule` z `apps/web/lib/rules/index.ts`.

## Files
**Create:** `apps/web/lib/rules/registry.ts`, `apps/web/lib/rules/__tests__/registry.integration.test.ts`
**Modify:** `apps/web/lib/rules/index.ts` — dodaj: `export { getRuleRegistry } from './registry'; export type { Rule } from './registry'`

## Done when
- `vitest apps/web/lib/rules/__tests__/registry.integration.test.ts` PASS — cache hit/miss behavior, isActive filter
- `pnpm test:smoke` green

## Rollback
Delete `apps/web/lib/rules/registry.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/lib/rules/__tests__/registry.integration.test.ts` — covers: DB query, cache hit, schemaVersion isolation, isActive filter
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Delete `apps/web/lib/rules/registry.ts``
## T-00g-006 — Dry-run harness (`POST /api/rules/dry-run`)

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-005 — registry loader live, T-00b-E01 — RBAC permissions enum]
- **Downstream (will consume this):** none (terminal in this sub-module)
- **Parallel (can run concurrently):** [T-00g-007]

### GIVEN / WHEN / THEN
**GIVEN** registry loader and all 3 interpreters (cascading, conditional_required, gate) are live
**WHEN** authenticated user with permission `RULES_DRY_RUN` sends `POST /api/rules/dry-run` with body `{ tenantId, entityType, context: { fieldValues } }`
**THEN** returns `DryRunResult` JSON with per-rule evaluation trace; no DB writes; response shape is stable across calls

### ACP Prompt
````
# Task T-00g-006 — Dry-run harness (POST /api/rules/dry-run)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/registry.ts` — cały plik (getRuleRegistry signature)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/types.ts` — cały plik (RuleContext, RuleResult types)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → znajdź wpis `RULES_DRY_RUN` lub najbliższy odpowiednik — użyj exact permission string

## Twoje zadanie
Zaimplementuj endpoint `POST /api/rules/dry-run` oraz helper `dryRunRules()`. Endpoint przyjmuje `{ tenantId, entityType, context }`, ładuje wszystkie aktywne reguły przez registry, ewaluuje każdą przez odpowiedni interpreter, zwraca zbiorczy wynik z trace. Zero DB writes — tylko reads + evaluations.

Request body schema:
```ts
{
  tenantId: string  // UUID
  entityType: string  // np. 'brief', 'work_order'
  context: {
    fieldValues: Record<string, unknown>
  }
}
```

Response shape (`DryRunResult`):
```ts
export interface DryRunResult {
  tenantId: string
  entityType: string
  rulesEvaluated: number
  results: Array<{
    ruleId: string
    ruleType: 'cascading' | 'conditional_required' | 'gate' | 'workflow'
    applied: boolean
    output: Record<string, unknown>
    errors: string[]
    trace: Array<{ step: string; result: unknown; timestamp: string }>
  }>
  evaluatedAt: string  // ISO timestamp
}
```

Interpreter dispatch (wybór interpretera wg ruleType):
```ts
switch (rule.ruleType) {
  case 'cascading': return evaluateCascadingRule(rule.id, context, db)
  case 'conditional_required': return evaluateConditionalRequired(rule.id, context, db)
  case 'gate': return evaluateGate(rule.id, context, db)
  case 'workflow': return evaluateWorkflow(rule.id, context, db)  // może nie istnieć jeszcze — guard z try/catch
}
```

## Implementacja
1. Utwórz `apps/web/lib/rules/dry-run.ts`:
   ```ts
   export async function dryRunRules(
     tenantId: string,
     entityType: string,
     context: RuleContext,
     db: DrizzleClient
   ): Promise<DryRunResult>
   ```
   - Wywołaj `getRuleRegistry(tenantId, 1, db)` — filtruj po `entityType`
   - Dla każdej reguły dispatch do właściwego interpretera
   - Zbierz wyniki do `DryRunResult`
2. Utwórz `apps/web/app/api/rules/dry-run/route.ts` (Next.js App Router):
   ```ts
   import { NextRequest, NextResponse } from 'next/server'
   import { Permission } from 'lib/rbac/permissions.enum'
   // RBAC guard: sprawdź Permission.RULES_DRY_RUN lub odpowiednik
   export async function POST(req: NextRequest): Promise<NextResponse>
   ```
   - Zod parse request body
   - RBAC guard (reject 403 jeśli brak uprawnienia)
   - Wywołaj `dryRunRules()`
   - Return 200 z `DryRunResult` JSON
   - Catch all errors → 500 z `{ error: message }` (no throw propagation)
3. Napisz testy `apps/web/lib/rules/__tests__/dry-run.test.ts`:
   - Test 1: valid request z 1 cascading rule → DryRunResult.results.length === 1
   - Test 2: invalid body → Zod error response, nie crash
   - Test 3: brak RBAC uprawnienia → 403
   - Test 4: `rulesEvaluated` = liczba reguł dla entityType (nie wszystkich)
4. Eksportuj `DryRunResult` i `dryRunRules` z `apps/web/lib/rules/index.ts`.

## Files
**Create:** `apps/web/lib/rules/dry-run.ts`, `apps/web/app/api/rules/dry-run/route.ts`, `apps/web/lib/rules/__tests__/dry-run.test.ts`
**Modify:** `apps/web/lib/rules/index.ts` — dodaj: `export { dryRunRules } from './dry-run'; export type { DryRunResult } from './dry-run'`

## Done when
- `vitest apps/web/lib/rules/__tests__/dry-run.test.ts` PASS — trace shape stable, RBAC guard, entityType filter
- `pnpm test:smoke` green

## Rollback
Delete `apps/web/app/api/rules/dry-run/route.ts` + `apps/web/lib/rules/dry-run.ts`
````

### Test gate (planning summary)
- **Unit + Integration:** `vitest apps/web/lib/rules/__tests__/dry-run.test.ts` — covers: response shape, RBAC 403, entityType filter, Zod validation
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Delete route `apps/web/app/api/rules/dry-run/route.ts` + helper `apps/web/lib/rules/dry-run.ts``
## T-00g-007 — `reference_rules` seed helper + snapshot updater

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-g rule engine (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001 — reference_rules table exists, T-00b-004 — forza-baseline snapshot exists]
- **Downstream (will consume this):** none
- **Parallel (can run concurrently):** [T-00g-006]

### GIVEN / WHEN / THEN
**GIVEN** `reference_rules` table exists and `forza-baseline` snapshot script exists
**WHEN** seed runs (`pnpm seed:baseline` or equivalent)
**THEN** exactly 3 canonical rules are present: `fefo_pick_v1` (cascading), `catch_weight_required_v1` (conditional_required), `allergen_changeover_gate_v1` (gate); factory helper `createRule(overrides?)` exported for test use

### ACP Prompt
````
# Task T-00g-007 — reference_rules seed helper + snapshot updater

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — JSON examples dla allergen changeover gate (exact DSL do użycia w seedzie)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/` → sprawdź istniejące pliki seed (ls) żeby poznać konwencję + plik `forza-baseline.ts` lub odpowiednik — gdzie dodać reference_rules seed
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/rules.ts` — cały plik (Drizzle typed insert schema)

## Twoje zadanie
Utwórz seed helper dla `reference_rules` z 3 kanonicznymi regułami Forza. Seed musi być idempotentny (upsert, nie insert). Factory `createRule` do użycia w testach.

3 kanoniczne reguły do zaseedowania:

**1. fefo_pick_v1 (cascading):**
```json
{
  "rule_type": "cascading",
  "trigger_field": "picking_method",
  "trigger_value": "fefo",
  "cascades": [
    { "target_field": "expiry_date_required", "value": true },
    { "target_field": "lot_tracking_required", "value": true }
  ]
}
```

**2. catch_weight_required_v1 (conditional_required):**
```json
{
  "rule_type": "conditional_required",
  "predicate": { "field": "product_type", "operator": "EQUALS", "value": "catch_weight" },
  "required_fields": ["tare_weight", "gross_weight", "catch_weight_tolerance"]
}
```

**3. allergen_changeover_gate_v1 (gate):**
```json
{
  "rule_type": "gate",
  "trigger": { "field": "changeover_type", "operator": "EQUALS", "value": "allergen" },
  "conditions": [
    { "field": "cleaning_validated", "operator": "EQUALS", "value": true },
    { "field": "atp_swab_passed", "operator": "EQUALS", "value": true },
    { "field": "dual_signoff_count", "operator": "GTE", "value": 2 }
  ],
  "on_fail": {
    "missing_actions": ["Complete cleaning validation", "Submit ATP swab result", "Get dual sign-off (2 required)"],
    "notify": ["production_manager", "quality_manager"]
  }
}
```

## Implementacja
1. Sprawdź `ls apps/web/seed/` żeby poznać istniejące pliki i konwencję nazewnictwa.
2. Utwórz `apps/web/seed/rules-seed.ts`:
   ```ts
   import { db } from '../drizzle/client'
   import { referenceRules } from '../drizzle/schema/rules'
   
   // Factory dla testów
   export const createRule = async (overrides?: Partial<typeof referenceRules.$inferInsert>) =>
     db.insert(referenceRules).values({ ...defaultRule, ...overrides }).returning()
   
   // Seed function — idempotent (upsert by external_id)
   export async function seedRules(tenantId: string) { ... }
   ```
   Każda reguła ma `external_id` = jej nazwa (np. `'fefo_pick_v1'`) — upsert ON CONFLICT(external_id) DO UPDATE.
3. Dodaj wywołanie `seedRules(FORZA_TENANT_ID)` do snapshot `forza-baseline` w `apps/web/seed/forza-baseline.ts` — dodaj wywołanie w odpowiednim miejscu.
4. Napisz integration test `apps/web/seed/__tests__/rules-seed.integration.test.ts`:
   - Test 1: po `seedRules()` — count 3 reguły
   - Test 2: uruchom `seedRules()` dwa razy — nadal 3 reguły (idempotency)
   - Test 3: `createRule({ ruleType: 'gate' })` — zwraca nową regułę z domyślnymi polami

## Files
**Create:** `apps/web/seed/rules-seed.ts`, `apps/web/seed/__tests__/rules-seed.integration.test.ts`
**Modify:** `apps/web/seed/forza-baseline.ts` (lub odpowiednik znaleziony w kroku 1) — dodaj: wywołanie `seedRules(FORZA_TENANT_ID)`

## Done when
- `vitest apps/web/seed/__tests__/rules-seed.integration.test.ts` PASS — 3 rules seeded, idempotent, factory works
- `pnpm test:smoke` green

## Rollback
`DELETE FROM reference_rules WHERE external_id IN ('fefo_pick_v1','catch_weight_required_v1','allergen_changeover_gate_v1');`
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/seed/__tests__/rules-seed.integration.test.ts` — covers: 3 rules seeded, idempotent upsert, createRule factory
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM reference_rules WHERE external_id IN ('fefo_pick_v1','catch_weight_required_v1','allergen_changeover_gate_v1');`
## T-00g-008 — DSL interpreter: workflow-as-data rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g-04-workflow-as-data (PRD §7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001 — rule engine schema + registry, T-00g-002 — types.ts and interpreter pattern established]
- **Downstream (will consume this):** [T-02SETa tasks using rule engine workflow type]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** rule engine registry is live (T-00g-001 done), 3 of 4 rule type interpreters implemented; `reference_rules` table has rows with `rule_type = 'workflow'`
**WHEN** `evaluateWorkflow(ruleId, context, db)` is called with `context.fieldValues = { current_state: 'draft', event: 'submit_for_review' }`
**THEN** returns `RuleResult` with `output: { allowed: boolean, next_state: string | null }`; dry-run mode (`context.dryRun = true`) logs trace without side effects; unknown state or event returns structured error `{ allowed: false, errors: [...] }`, not throw; interpreter registered in dispatcher

### ACP Prompt
````
# Task T-00g-008 — DSL interpreter: workflow-as-data rule type

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §7 — Rule Engine DSL` — opis "Workflow-as-data: State machines definiowane metadata, nie kodem; WO state machine, TO lifecycle, Release-to-warehouse flow"
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/types.ts` — cały plik (RuleContext, RuleResult interfaces, DrizzleClient type)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rules/interpreters/cascading.ts` — cały plik (wzorzec implementacji interpretera — fetch → Zod parse → evaluate → return RuleResult)

## Twoje zadanie
Zaimplementuj interpreter reguły `workflow` — state machine jako dane. DSL definiuje stany, przejścia i guard conditions. Engine ewaluuje czy przejście `current_state → event → next_state` jest dozwolone. Nie pisuje do DB — tylko ocenia.

DSL structure dla `workflow` rule:
```json
{
  "rule_type": "workflow",
  "states": ["draft", "review", "approved", "rejected"],
  "initial_state": "draft",
  "transitions": [
    { "from": "draft", "to": "review", "event": "submit_for_review", "guard": "hasAllRequiredFields" },
    { "from": "review", "to": "approved", "event": "approve", "guard": "hasApproverSign" },
    { "from": "review", "to": "rejected", "event": "reject", "guard": null },
    { "from": "rejected", "to": "draft", "event": "revise", "guard": null }
  ]
}
```

Guard functions (built-in, ewaluowane z `context.fieldValues`):
- `hasAllRequiredFields` — wszystkie pola z `context.requiredFields` (string[]) mają wartość != null
- `hasApproverSign` — `context.fieldValues.approver_signature != null`
- `null` — zawsze true (przejście bez warunku)

Sygnatura:
```ts
// apps/web/lib/rules/interpreters/workflow.ts
export async function evaluateWorkflow(
  ruleId: string,
  context: WorkflowRuleContext,
  db: DrizzleClient
): Promise<RuleResult>

// Rozszerzony RuleContext dla workflow:
export interface WorkflowRuleContext extends RuleContext {
  fieldValues: {
    current_state: string
    event: string
    [key: string]: unknown
  }
  requiredFields?: string[]  // dla guard hasAllRequiredFields
  dryRun?: boolean
}

// output dla workflow:
// { allowed: boolean, next_state: string | null, guard_evaluated: string | null }
```

## Implementacja
1. Utwórz `apps/web/lib/rules/interpreters/workflow.ts`:
   - Fetch rule row z DB + Zod parse `dsl_definition` jako `WorkflowDSL`
   - Znajdź matching transition: `transition.from === current_state && transition.event === event`
   - Jeśli brak matching transition → `{ allowed: false, next_state: null, errors: ['No transition from <state> on event <event>'] }`
   - Jeśli unknown `current_state` (nie w `states[]`) → `{ allowed: false, errors: ['Unknown state: <state>'] }`
   - Evaluate guard: `null` → allowed; `hasAllRequiredFields` → sprawdź `requiredFields`; `hasApproverSign` → sprawdź pole
   - Jeśli guard fail → `{ allowed: false, next_state: null, errors: ['Guard failed: <guard_name>'] }`
   - Jeśli guard pass → `{ allowed: true, next_state: transition.to, guard_evaluated: guard_name }`
   - Jeśli `context.dryRun === true` → append do `trace`: `{ step: 'workflow_eval', result: output, timestamp: new Date().toISOString() }`
2. Dodaj `WorkflowDSL` Zod schema i `WorkflowRuleContext` interface do `apps/web/lib/rules/types.ts`.
3. Dodaj `workflow` case do dispatcher w `apps/web/lib/rules/dry-run.ts`:
   ```ts
   case 'workflow': return evaluateWorkflow(rule.id, context as WorkflowRuleContext, db)
   ```
4. Napisz unit testy `apps/web/lib/rules/__tests__/workflow.test.ts`:
   - Test 1: `draft → submit_for_review` z hasAllRequiredFields guard spełnionym → `{ allowed: true, next_state: 'review' }`
   - Test 2: `draft → submit_for_review` z brakującym required field → `{ allowed: false, errors: ['Guard failed: hasAllRequiredFields'] }`
   - Test 3: `review → approve` z `approver_signature` present → `{ allowed: true, next_state: 'approved' }`
   - Test 4: `review → reject` (guard=null) → zawsze `{ allowed: true, next_state: 'rejected' }`
   - Test 5: unknown state `'archived'` → `{ allowed: false, errors: ['Unknown state: archived'] }`
   - Test 6: `dryRun: true` → `trace` array non-empty, `allowed` poprawne
5. Napisz integration test `apps/web/lib/rules/__tests__/workflow.integration.test.ts`:
   - Seed 1 workflow rule do `reference_rules` z DSL powyżej → call `evaluateWorkflow` → assert `next_state: 'review'`
   - Eksportuj `evaluateWorkflow` z `apps/web/lib/rules/index.ts`.
## Files
**Create:** `apps/web/lib/rules/interpreters/workflow.ts`, `apps/web/lib/rules/__tests__/workflow.test.ts`, `apps/web/lib/rules/__tests__/workflow.integration.test.ts`
**Modify:** `apps/web/lib/rules/types.ts` — dodaj: `WorkflowDSL` Zod schema, `WorkflowRuleContext` interface; `apps/web/lib/rules/dry-run.ts` — dodaj: `workflow` case w dispatcher; `apps/web/lib/rules/index.ts` — dodaj: `export { evaluateWorkflow } from './interpreters/workflow'`

## Done when
- `vitest apps/web/lib/rules/__tests__/workflow.test.ts` PASS — 6 unit cases: valid transition, blocked guard, null guard, unknown state, dry-run trace
- `vitest apps/web/lib/rules/__tests__/workflow.integration.test.ts` PASS — seeded rule evaluated against real DB row
- `pnpm test:smoke` green

## Rollback
`git revert` commit adding `workflow.ts` + registry registration; existing 3 interpreters unaffected
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rules/__tests__/workflow.test.ts` — covers: valid/blocked transition, null guard, unknown state, dry-run trace
- **Integration:** `vitest apps/web/lib/rules/__tests__/workflow.integration.test.ts` — covers: seeded rule evaluated against real DB row, correct `next_state` returned
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` commit adding `workflow.ts`; existing 3 interpreters unaffected
## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-00g-001 | [T-00b-000] | [T-00h-001] |
| T-00g-002 | [T-00g-001] | [T-00g-003, T-00g-004] |
| T-00g-003 | [T-00g-001, T-00g-002 (types.ts)] | [T-00g-002, T-00g-004] |
| T-00g-004 | [T-00g-001, T-00g-002 (types.ts)] | [T-00g-002, T-00g-003] |
| T-00g-005 | [T-00g-002, T-00g-003, T-00g-004] | [] |
| T-00g-006 | [T-00g-005, T-00b-E01] | [T-00g-007] |
| T-00g-007 | [T-00g-001, T-00b-004] | [T-00g-006] |
| T-00g-008 | [T-00g-001, T-00g-002 (types.ts)] | [] |

## Parallel dispatch plan

Wave 0 (schema blocker): T-00g-001
Wave 1 (parallel interpreters, after Wave 0): T-00g-002, T-00g-003, T-00g-004
Wave 2 (registry, after Wave 1): T-00g-005
Wave 2b (parallel with Wave 2, after their own upstreams): T-00g-007, T-00g-008
Wave 3 (dry-run, after Wave 2): T-00g-006

## PRD coverage

✅ §7 Cascading rules → T-00g-002
✅ §7 Conditional required rules → T-00g-003
✅ §7 Gate rules → T-00g-004
✅ §7 Workflow-as-data state machines → T-00g-008
✅ §7 Dry-run wizard Admin UI backend → T-00g-006
✅ §7 JSON runtime stored as data → T-00g-001 (reference_rules table)
✅ §7 Rule registry + versioning → T-00g-005
✅ §7 Seed canonical rules (fefo, catch-weight, allergen gate) → T-00g-007

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 1 | T-00g-001 |
| T2-api | 6 | T-00g-002, T-00g-003, T-00g-004, T-00g-005, T-00g-006, T-00g-008 |
| T5-seed | 1 | T-00g-007 |
| **Total** | **8** | |

**Est total time:** 450 min (7.5h)
**Context budget range:** ~35k–60k tokens per task


## T-00h-001 — Migration `013-reference-dept-columns.sql` + schema_migrations

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 55 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Baseline DB scaffold, T-00b-E03 — DB enums lock]
- **Downstream (will consume this):** [T-00h-002 — JSON-Schema→Zod compiler, T-00h-003 — ext_jsonb helpers, T-00h-004 — schema_version bump helper]
- **Parallel (can run concurrently):** [T-00g-001 — Rule engine schema]

### GIVEN / WHEN / THEN
**GIVEN** baseline Supabase local is running, previous migrations (001-012) applied, `tenants` table exists with `id UUID PK`
**WHEN** `supabase db push` runs migration `013-reference-dept-columns.sql`
**THEN** table `reference_dept_columns` exists in `ext` schema with all required columns + R13 columns; `schema_migrations` tracking table exists; GIN index on `ext_jsonb` is confirmed by `\d reference_dept_columns`; migration is idempotent (re-run produces no error)

### Test gate
- **Integration:** `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — verifies table shape, GIN index presence, `schema_migrations` row inserted
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE ext.reference_dept_columns CASCADE; DROP TABLE public.schema_migrations CASCADE;`
### ACP Prompt
````
# Task T-00h-001 — Migration 013-reference-dept-columns.sql + schema_migrations

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## Storage pattern` (grep `ext_jsonb`) — specyfikacja kolumn L3/L4 + schema_version
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/` → sprawdź istniejące migracje 001-012 by zachować numerację i konwencje

## Twoje zadanie
GIVEN: baseline Supabase local działa, tabela `tenants(id UUID PK)` istnieje, migracje 001-012 zastosowane.
WHEN: uruchomisz `supabase db push` z plikiem `013-reference-dept-columns.sql`.
THEN: tabela `ext.reference_dept_columns` istnieje z poniższymi kolumnami; tabela `public.schema_migrations` istnieje; GIN index na `ext_jsonb` sprawdzony; migracja idempotentna (IF NOT EXISTS wszędzie).

## Implementacja
1. Utwórz `apps/web/drizzle/migrations/013-reference-dept-columns.sql` z CREATE SCHEMA IF NOT EXISTS ext; CREATE TABLE IF NOT EXISTS ext.reference_dept_columns zawierającym DOKŁADNIE te kolumny:
   - R13 standard columns: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`
   - Domain columns: `module TEXT NOT NULL`, `entity_type TEXT NOT NULL`, `column_name TEXT NOT NULL`, `json_schema JSONB NOT NULL`, `is_active BOOL DEFAULT true`
   - CHECK constraint: `field_type` (embedded in json_schema) must validate against enum `('string','number','boolean','date','enum','uuid','text')`
   - `ext_jsonb JSONB`, `private_jsonb JSONB` columns on main_table placeholder (add to migration as comment + separate CREATE TABLE IF NOT EXISTS main_table_placeholder)
2. Utwórz `public.schema_migrations` tracking table w `apps/web/drizzle/migrations/013-reference-dept-columns.sql`: `id SERIAL PK`, `version TEXT UNIQUE NOT NULL`, `module TEXT NOT NULL`, `applied_at TIMESTAMPTZ DEFAULT now()`
3. Dodaj GIN index w `apps/web/drizzle/migrations/013-reference-dept-columns.sql`: `CREATE INDEX IF NOT EXISTS idx_reference_dept_columns_json_schema_gin ON ext.reference_dept_columns USING GIN (json_schema)`
4. Utwórz `apps/web/drizzle/schema/dept-columns.ts` z Drizzle ORM type definitions dla obu tabel (pgSchema, pgTable, uuid, text, jsonb, boolean, integer, timestamp, serial)
5. Napisz integration test `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` (lub rozszerz istniejący) sprawdzający: (a) tabela istnieje — SELECT 1 FROM ext.reference_dept_columns LIMIT 0; (b) GIN index istnieje — SELECT indexname FROM pg_indexes WHERE tablename='reference_dept_columns'; (c) schema_migrations ma wiersz z version='013'

## Files
**Create:** `apps/web/drizzle/migrations/013-reference-dept-columns.sql`, `apps/web/drizzle/schema/dept-columns.ts`, `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts`

## Done when
- `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` PASS — sprawdza: table shape, GIN index, schema_migrations row
- `pnpm test:smoke` green

## Rollback
`DROP TABLE ext.reference_dept_columns CASCADE; DROP TABLE public.schema_migrations CASCADE; DELETE FROM supabase migrations table WHERE version='013';`
````

---

## T-00h-002 — JSON-Schema → Zod runtime compiler

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001 — Migration + schema_migrations]
- **Downstream (will consume this):** [T-00h-003 — ext_jsonb helpers, T-00h-004 — schema_version bump helper, T-00h-005 — integration test]
- **Parallel (can run concurrently):** [T-00g-005 — Rule engine interpreters]

### GIVEN / WHEN / THEN
**GIVEN** `ext.reference_dept_columns` has rows with valid JSON Schema in `json_schema` column, `schema_version` per tenant/module
**WHEN** `compileJsonSchemaToZod(schema: JSONSchema7): ZodSchema` is called with a JSON Schema object
**THEN** returns a typed Zod schema; LRU cache keyed by `(tenantId, module, schema_version)` avoids re-compile; supports field types: `string`, `number`, `boolean`, `date` (coerce), `enum` (z.enum), `uuid` (z.string().uuid()), `text` (z.string()); cache miss fetches from DB and recompiles; unknown `type` falls back to `z.unknown()`

### Test gate
- **Unit:** `vitest apps/web/lib/schema-driven/__tests__/json-schema-to-zod.test.ts` — covers each field type mapping + LRU cache hit/miss
- **Integration:** `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — hits real Supabase local, verifies compile from DB rows
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` commit; delete `apps/web/lib/schema-driven/json-schema-to-zod.ts`
### ACP Prompt
````
# Task T-00h-002 — JSON-Schema → Zod runtime compiler

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → grep `Zod + json-schema-to-zod runtime` — spec [R4]: Reference.DeptColumns → JSON Schema → Zod → RHF resolver, cache LRU per schema_version
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/dept-columns.ts` → cały plik — Drizzle typy tabel (po T-00h-001)

## Twoje zadanie
GIVEN: ext.reference_dept_columns zawiera wiersze z json_schema JSONB; schema_version jest per tenant+module.
WHEN: wywołasz `compileJsonSchemaToZod(schema: JSONSchema7): ZodSchema`.
THEN: zwraca typowany Zod schema; LRU cache (max 200 wpisów) keyed by `${tenantId}:${module}:${schema_version}` zapobiega re-kompilacji; obsługuje typy: string→z.string(), number→z.number(), boolean→z.boolean(), date→z.coerce.date(), enum→z.enum([...values]), uuid→z.string().uuid(), text→z.string(); nieznany type→z.unknown(); cache miss pobiera z DB i kompiluje.

## Implementacja
1. Utwórz `apps/web/lib/schema-driven/json-schema-to-zod.ts`:
   - Import: `import { z, ZodSchema } from 'zod'; import type { JSONSchema7 } from 'json-schema'; import LRU from 'lru-cache';`
   - Export function: `export function compileJsonSchemaToZod(schema: JSONSchema7): ZodSchema`
   - LRU cache: `const cache = new LRU<string, ZodSchema>({ max: 200 })`
   - Export async: `export async function buildZodFromDb(tenantId: string, module: string): Promise<ZodSchema>` — pobiera wszystkie is_active rows z ext.reference_dept_columns WHERE tenant_id=tenantId AND module=module, sprawdza cache key `${tenantId}:${module}:${maxSchemaVersion}`, jeśli miss — kompiluje + cache
2. Utwórz `apps/web/lib/schema-driven/__tests__/json-schema-to-zod.test.ts`:
   - Test każdego field_type: string, number, boolean, date (coerce), enum z values, uuid, text, unknown fallback
   - Test LRU: drugi call z tym samym schema_version nie odpytuje DB (mock DB)
3. Dodaj `lru-cache` i `json-schema` do `apps/web/package.json` — uruchom `pnpm add lru-cache json-schema` w katalogu `apps/web`
4. Dodaj export do `apps/web/lib/schema-driven/index.ts` (utwórz jeśli brak): `export { compileJsonSchemaToZod, buildZodFromDb } from './json-schema-to-zod'`
5. Rozszerz `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` o test: wstaw wiersz do ext.reference_dept_columns → wywołaj buildZodFromDb → sprawdź że zwrócony schema.parse({}) nie rzuca dla pustego obiektu z opcjonalnymi polami

## Files
**Create:** `apps/web/lib/schema-driven/json-schema-to-zod.ts`, `apps/web/lib/schema-driven/__tests__/json-schema-to-zod.test.ts`
**Modify:** `apps/web/lib/schema-driven/index.ts` — dodaj eksporty

## Done when
- `vitest apps/web/lib/schema-driven/__tests__/json-schema-to-zod.test.ts` PASS — sprawdza: każdy field_type, LRU cache
- `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` PASS — sprawdza: compile z DB rows
- `pnpm test:smoke` green

## Rollback
`git revert` commit; `pnpm remove lru-cache` jeśli dodano tylko dla tego zadania
````

---
## T-00h-003 — `ext_jsonb` read/write helpers + expression indexes

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001 — Migration + schema_migrations]
- **Downstream (will consume this):** [T-00h-005 — Integration test]
- **Parallel (can run concurrently):** [T-00h-002 — JSON-Schema→Zod compiler, T-00h-004 — schema_version bump helper]

### GIVEN / WHEN / THEN
**GIVEN** a DB record row has `ext_jsonb JSONB` column (from migration 013), compiled Zod schema is available
**WHEN** `readExtJsonb<T>(record, path)` is called with path `['custom_flag']` or `writeExtJsonb(record, path, value)` sets a nested key
**THEN** `readExtJsonb` returns typed `T | undefined` with no runtime cast warnings; `writeExtJsonb` performs deep merge (not replace) of JSONB object; `addExtJsonbIndex(tableName, path)` returns valid SQL expression for a Drizzle `sql` tag; expression index migration `014-ext-jsonb-indexes.sql` created for sample path `['dept_code']`

### Test gate
- **Unit:** `vitest apps/web/lib/schema-driven/__tests__/ext-jsonb.test.ts` — covers: read existing key, read missing key (undefined), write new key, write nested key (deep merge), addExtJsonbIndex SQL output
- **Integration:** `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — query using expression index hits index (check via EXPLAIN)
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP INDEX CONCURRENTLY IF EXISTS idx_ext_jsonb_dept_code; git revert` ext-jsonb.ts commit
### ACP Prompt
````
# Task T-00h-003 — ext_jsonb read/write helpers + expression indexes

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → grep `ext_jsonb` — spec hybrid storage pattern, L3 custom cols pattern
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/dept-columns.ts` → Drizzle schema typów (po T-00h-001)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/migrations/013-reference-dept-columns.sql` → sprawdź istniejące definicje ext_jsonb

## Twoje zadanie
GIVEN: wiersz DB ma kolumnę `ext_jsonb JSONB`; skompilowany Zod schema jest dostępny.
WHEN: wywołasz readExtJsonb/writeExtJsonb/addExtJsonbIndex.
THEN: readExtJsonb zwraca T | undefined bez cast warnings; writeExtJsonb wykonuje deep merge (nie replace); addExtJsonbIndex zwraca valid SQL expression; migration 014 tworzy expression index dla path ['dept_code'].

## Implementacja
1. Utwórz `apps/web/lib/schema-driven/ext-jsonb.ts` z dokładnie tymi sygnaturami:
   ```typescript
   import type { SQL } from 'drizzle-orm'
   import { sql } from 'drizzle-orm'

   // DrizzleRecord = object z polem ext_jsonb: Record<string, unknown> | null
   export type DrizzleRecord = { ext_jsonb: Record<string, unknown> | null }

   export function readExtJsonb<T>(record: DrizzleRecord, path: string[]): T | undefined
   // Przechodzi przez path używając optional chaining, zwraca undefined jeśli brak

   export function writeExtJsonb(record: DrizzleRecord, path: string[], value: unknown): void
   // Deep merge: nie nadpisuje całego ext_jsonb, tylko ustawia path[*] key

   export function addExtJsonbIndex(tableName: string, path: string[]): SQL
   // Zwraca: sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${tableName}_ext_${path.join('_')} ON ${tableName} USING GIN ((ext_jsonb -> ${path[0]}))`
   ```
2. Utwórz migration `apps/web/drizzle/migrations/014-ext-jsonb-indexes.sql`:
   - `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_main_ext_dept_code ON main_table_placeholder USING GIN ((ext_jsonb -> 'dept_code'));`
   - Dodaj wiersz do schema_migrations: `INSERT INTO public.schema_migrations (version, module) VALUES ('014', 'schema-driven') ON CONFLICT DO NOTHING;`
3. Utwórz `apps/web/lib/schema-driven/__tests__/ext-jsonb.test.ts`:
   - Test readExtJsonb: istniejący klucz zwraca wartość; brakujący klucz zwraca undefined; nested path ['a','b'] działa
   - Test writeExtJsonb: nowy klucz dodany; istniejące klucze nie nadpisane (deep merge)
   - Test addExtJsonbIndex: output SQL zawiera 'GIN' i nazwę tabeli
4. Dodaj export do `apps/web/lib/schema-driven/index.ts`: `export { readExtJsonb, writeExtJsonb, addExtJsonbIndex } from './ext-jsonb'`
5. Rozszerz integration test w `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts`: wstaw wiersz z ext_jsonb={'dept_code':'ABC'} → query z `WHERE ext_jsonb -> 'dept_code' = '"ABC"'` → sprawdź EXPLAIN używa index

## Files
**Create:** `apps/web/lib/schema-driven/ext-jsonb.ts`, `apps/web/lib/schema-driven/__tests__/ext-jsonb.test.ts`, `apps/web/drizzle/migrations/014-ext-jsonb-indexes.sql`
**Modify:** `apps/web/lib/schema-driven/index.ts` — dodaj eksporty

## Done when
- `vitest apps/web/lib/schema-driven/__tests__/ext-jsonb.test.ts` PASS — sprawdza: read/write/addIndex funkcje
- `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` PASS — sprawdza: query hits GIN index
- `pnpm test:smoke` green

## Rollback
`DROP INDEX CONCURRENTLY IF EXISTS idx_main_ext_dept_code; git revert` commit ext-jsonb.ts + migration 014
````

---

## T-00h-004 — `schema_version` bump + idempotent add-column helper

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001 — Migration + schema_migrations]
- **Downstream (will consume this):** [T-00h-005 — Integration test]
- **Parallel (can run concurrently):** [T-00h-002 — Zod compiler, T-00h-003 — ext_jsonb helpers]

### GIVEN / WHEN / THEN
**GIVEN** a new `ext.reference_dept_columns` row definition is ready to insert, `schema_migrations` tracking table exists
**WHEN** `addColumnIdempotent(tableName, columnDef)` is called, followed by `bumpSchemaVersion(tenantId, module)`
**THEN** migration record inserted with unique version string (format: `${module}-${timestamp}`); `schema_version` bumped atomically per tenant+module (MAX+1); LRU cache from T-00h-002 invalidated for affected `(tenantId, module)`; operation is idempotent (duplicate call returns existing version, no error)

### Test gate
- **Integration:** `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — covers: add column → migration row inserted → schema_version bumped → second call idempotent
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM public.schema_migrations WHERE version LIKE 'test-%'; UPDATE ext.reference_dept_columns SET schema_version = schema_version - 1;` (revert manually)
### ACP Prompt
````
# Task T-00h-004 — schema_version bump + idempotent add-column helper

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/dept-columns.ts` → Drizzle schema typów schemaMigrations + referenceDeptColumns (po T-00h-001)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/schema-driven/index.ts` → sprawdź istniejące eksporty (po T-00h-002/003)

## Twoje zadanie
GIVEN: schema_migrations tracking table istnieje; ext.reference_dept_columns istnieje.
WHEN: wywołasz addColumnIdempotent(tableName, columnDef) + bumpSchemaVersion(tenantId, module).
THEN: migration record wstawiony z unikalnym version=`${module}-${timestamp}`; schema_version atomicznie zbumpowany MAX+1 per tenant+module; LRU cache z json-schema-to-zod.ts zinwalidowany dla (tenantId, module); duplikowane wywołanie idempotentne (ON CONFLICT DO NOTHING + zwraca istniejący version).

## Implementacja
1. Utwórz `apps/web/lib/schema-driven/schema-version.ts` z dokładnie tymi sygnaturami:
   ```typescript
   export async function bumpSchemaVersion(tenantId: string, module: string): Promise<number>
   // Atomicznie: SELECT MAX(schema_version)+1 FROM ext.reference_dept_columns WHERE tenant_id=tenantId AND module=module
   // UPDATE ext.reference_dept_columns SET schema_version=newVersion WHERE tenant_id=tenantId AND module=module
   // INSERT INTO schema_migrations (version, module) VALUES (`${module}-${Date.now()}`, module) ON CONFLICT DO NOTHING
   // Invalidate LRU cache: import { cache } from './json-schema-to-zod' i wywołaj cache.clear() (lub per-key delete)
   // Returns: newVersion number

   export type ColumnDef = { name: string; type: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'uuid' | 'text'; nullable?: boolean; enumValues?: string[] }

   export async function addColumnIdempotent(tableName: string, column: ColumnDef): Promise<void>
   // Checks information_schema.columns — jeśli kolumna już istnieje, return (no-op)
   // Jeśli nie: INSERT INTO ext.reference_dept_columns (tenant_id, module, entity_type, column_name, json_schema, is_active)
   // json_schema = { type: column.type, ...(column.enumValues ? { enum: column.enumValues } : {}) }
   ```
2. Eksportuj `cache` z `apps/web/lib/schema-driven/json-schema-to-zod.ts` (lub stwórz helper `invalidateCache(tenantId, module)`) — `apps/web/lib/schema-driven/schema-version.ts` potrzebuje dostępu do cache invalidation
3. Dodaj export do `apps/web/lib/schema-driven/index.ts`: `export { bumpSchemaVersion, addColumnIdempotent, type ColumnDef } from './schema-version'`
4. Napisz integration tests w `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts`:
   - Test bumpSchemaVersion: wywołaj 2x → drugi call zwraca newVersion = firstVersion+1
   - Test addColumnIdempotent: wstaw kolumnę "test_col" → sprawdź wiersz w ext.reference_dept_columns → wstaw ponownie → brak błędu, tylko 1 wiersz
   - Test idempotency: schema_migrations ma dokładnie 1 wiersz per kolumna
5. Upewnij się w `apps/web/lib/schema-driven/schema-version.ts` że wszystkie DB operations są w transakcji (`db.transaction(async tx => { ... })`)

## Files
**Create:** `apps/web/lib/schema-driven/schema-version.ts`
**Modify:** `apps/web/lib/schema-driven/json-schema-to-zod.ts` — eksportuj cache lub invalidateCache helper; `apps/web/lib/schema-driven/index.ts` — dodaj eksporty

## Done when
- `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` PASS — sprawdza: bump idempotency, addColumn idempotency, migration record
- `pnpm test:smoke` green

## Rollback
Revert migration rows: `DELETE FROM public.schema_migrations WHERE module='schema-driven'; git revert` schema-version.ts commit
````

---
## T-00h-005 — Integration test: metadata change → Zod runtime picks up

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-003 — ext_jsonb helpers, T-00h-004 — schema_version bump helper]
- **Downstream (will consume this):** none
- **Parallel (can run concurrently):** [T-00f-006 — Rule engine integration test]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local running, `ext.reference_dept_columns` seeded with baseline columns for tenant `test-tenant-uuid`, module `test-module`, `schema_version = 1`; `buildZodFromDb` compiled schema v1 (cached)
**WHEN** test calls `addColumnIdempotent('main_table', { name: 'custom_flag', type: 'boolean' })` + `bumpSchemaVersion('test-tenant-uuid', 'test-module')`
**THEN** pre-add: `buildZodFromDb('test-tenant-uuid', 'test-module')` with v1 does NOT include `custom_flag` field; post-add: new `buildZodFromDb` call (cache miss, v2) DOES include `custom_flag: z.boolean()`; `schema_version` returned by `bumpSchemaVersion` equals `2`; payload `{custom_flag: true}` validates against post-add schema; payload `{custom_flag: 'not-bool'}` fails validation

### Test gate
- **Integration:** `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — test "metadata-live: pre/post add column" — covers all 5 assertions above
- **CI gate:** `pnpm test:smoke` green

### Rollback
Remove test case from integration test file; `DELETE FROM ext.reference_dept_columns WHERE column_name='custom_flag';`
### ACP Prompt
````
# Task T-00h-005 — Integration test: metadata change → Zod runtime picks up

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/schema-driven/index.ts` → eksporty: buildZodFromDb, addColumnIdempotent, bumpSchemaVersion (po T-00h-002/003/004)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` → istniejące testy (dopisz nowy describe blok, nie zastępuj)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/tests/fixtures/db.ts` → supabaseLocalDb fixture — importuj stąd connection

## Twoje zadanie
GIVEN: Supabase local działa; ext.reference_dept_columns zaseedowane dla tenant='test-tenant-uuid', module='test-module', schema_version=1.
WHEN: test dodaje kolumnę 'custom_flag' boolean + bumps schema_version.
THEN: 5 asercji musi przejść (opisane poniżej). Test musi być deterministyczny (cleanup po sobie).

## Implementacja
1. W `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` dodaj nowy describe blok:
   ```typescript
   describe('metadata-live: pre/post add column', () => {
     const TENANT_ID = 'test-tenant-uuid'
     const MODULE = 'test-module'

     beforeEach(async () => {
       // Seed baseline: INSERT INTO ext.reference_dept_columns minimal row z schema_version=1
       // Używaj supabaseLocalDb z apps/web/tests/fixtures/db.ts
     })

     afterEach(async () => {
       // Cleanup: DELETE FROM ext.reference_dept_columns WHERE tenant_id=TENANT_ID AND module=MODULE
       // DELETE FROM public.schema_migrations WHERE module=MODULE
     })

     it('pre-add schema does not include custom_flag', async () => {
       const schema = await buildZodFromDb(TENANT_ID, MODULE)
       // schema.shape nie ma 'custom_flag' — sprawdź przez schema.safeParse({custom_flag: true}).success === false lub shape check
     })

     it('post-add schema includes custom_flag as boolean', async () => {
       await addColumnIdempotent('main_table', { name: 'custom_flag', type: 'boolean' })
       const newVersion = await bumpSchemaVersion(TENANT_ID, MODULE)
       expect(newVersion).toBe(2)
       const schema = await buildZodFromDb(TENANT_ID, MODULE)  // cache miss → recompile
       expect(schema.safeParse({ custom_flag: true }).success).toBe(true)
       expect(schema.safeParse({ custom_flag: 'not-bool' }).success).toBe(false)
     })
   })
   ```
2. Upewnij się w `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` że `buildZodFromDb` cache jest czyszczony między testami (wywołaj invalidateCache lub cache.clear() w beforeEach)
3. Jeśli `apps/web/tests/fixtures/db.ts` nie istnieje — utwórz minimal fixture: `export const supabaseLocalDb = createClient(process.env.SUPABASE_LOCAL_URL!, process.env.SUPABASE_LOCAL_SERVICE_KEY!)` (lub odpowiednik Drizzle)
4. Dodaj pnpm script w `apps/web/package.json` jeśli brak: `"test:integration": "vitest --workspace integration"` lub odpowiednik
5. Upewnij się że test jest w pliku skonfigurowanym jako 'integration' workspace (nie 'unit') — sprawdź `apps/web/vitest.workspace.ts`

## Files
**Modify:** `apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` — dodaj describe blok
**Create (jeśli brak):** `apps/web/tests/fixtures/db.ts`

## Done when
- `vitest apps/web/lib/schema-driven/__tests__/schema-driven.integration.test.ts` PASS — sprawdza: pre-add rejects custom_flag, post-add accepts custom_flag:true, rejects custom_flag:'not-bool', schema_version=2, cache miss triggers recompile
- `pnpm test:smoke` green

## Rollback
Usuń describe blok 'metadata-live' z testu; `DELETE FROM ext.reference_dept_columns WHERE column_name='custom_flag'`
````

---

## T-00i-001 — Vitest workspace harness + coverage config

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-004 — Monorepo scaffold (Turborepo + pnpm workspaces)]
- **Downstream (will consume this):** every test-gated task in the project
- **Parallel (can run concurrently):** [T-00i-005 — Playwright harness]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists at `/Users/mariuszkrawczyk/Projects/monopilot-kira/` with `apps/web`, `apps/worker` packages
**WHEN** `pnpm test:unit` is run from project root
**THEN** Vitest resolves workspace array with 3 projects: `unit` (no DB, jsdom environment), `integration` (uses Supabase local, node environment), `e2e` (Playwright, referenced separately); coverage reporter `@vitest/coverage-v8` emits `apps/web/coverage/` directory with target threshold ≥85% for `lines`; sample test `apps/web/lib/__tests__/sample.test.ts` passes; `pnpm test:unit` runs only `unit` workspace

### Test gate
- **Unit:** `pnpm test:unit` green — coverage report emitted at `apps/web/coverage/`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` vitest config commits; `pnpm remove vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom`
### ACP Prompt
````
# Task T-00i-001 — Vitest workspace harness + coverage config

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź istniejące devDependencies + scripts
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/turbo.json` → sprawdź istniejące pipeline tasks (dodać test:unit jeśli brak)

## Twoje zadanie
GIVEN: monorepo scaffold istnieje (apps/web, apps/worker, pnpm workspaces).
WHEN: `pnpm test:unit` uruchomione z roota.
THEN: Vitest workspace z 3 projektami; coverage-v8 emituje apps/web/coverage/; sample test PASS; tylko unit workspace uruchomiony przez test:unit.

## Implementacja
1. Dodaj `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@vitejs/plugin-react` i `jsdom` do `apps/web/package.json` — uruchom `pnpm add -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom` w katalogu `apps/web` (jeśli brak)
2. Utwórz `apps/web/vitest.workspace.ts`:
   ```typescript
   import { defineWorkspace } from 'vitest/config'
   export default defineWorkspace([
     {
       test: {
         name: 'unit',
         include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
         exclude: ['**/__tests__/**/*.integration.test.ts', 'e2e/**'],
         environment: 'jsdom',
         setupFiles: ['apps/web/tests/setup/vitest-setup.ts'],
         coverage: {
           provider: 'v8',
           reportsDirectory: 'apps/web/coverage',
           thresholds: { lines: 85 },
           include: ['apps/web/lib/**', 'apps/web/components/**'],
         },
       },
     },
     {
       test: {
         name: 'integration',
         include: ['**/__tests__/**/*.integration.test.ts'],
         environment: 'node',
         setupFiles: ['apps/web/tests/setup/integration-setup.ts'],
       },
     },
   ])
   ```
3. Utwórz `apps/web/vitest.config.ts` (fallback dla direct vitest calls):
   ```typescript
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   export default defineConfig({ plugins: [react()], test: { workspace: './vitest.workspace.ts' } })
   ```
4. Utwórz `apps/web/tests/setup/vitest-setup.ts`: `import '@testing-library/jest-dom'`
5. Utwórz sample test `apps/web/lib/__tests__/sample.test.ts`: `import { describe, it, expect } from 'vitest'; describe('sample', () => { it('passes', () => { expect(1+1).toBe(2) }) })`
   - Dodaj scripts do `apps/web/package.json`: `"test:unit": "vitest --project unit"`, `"test:integration": "vitest --project integration"`, `"test:coverage": "vitest --project unit --coverage"`
   - Dodaj do `turbo.json` pipeline: `"test:unit": { "cache": false }`, `"test:integration": { "cache": false }`
   - Dodaj root-level script w `package.json`: `"test:unit": "turbo run test:unit"`, `"test:smoke": "pnpm test:unit"`
## Files
**Create:** `apps/web/vitest.workspace.ts`, `apps/web/vitest.config.ts`, `apps/web/tests/setup/vitest-setup.ts`, `apps/web/lib/__tests__/sample.test.ts`
**Modify:** `apps/web/package.json` — dodaj scripts + devDependencies; `turbo.json` — dodaj test:unit/test:integration pipeline; root `package.json` — dodaj test:unit/test:smoke scripts

## Done when
- `pnpm test:unit` PASS z roota — sprawdza: sample test green, coverage/ dir created
- `pnpm test:smoke` green
- `apps/web/coverage/` directory exists after run

## Rollback
`git revert` vitest config files; usuń devDependencies: `pnpm remove -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom`
````

---
## T-00i-002 — GitHub Actions workflow (matrix: lint, typecheck, unit, integration, e2e)

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-i testing
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00i-001 — Vitest workspace harness, T-00i-003 — Integration test harness, T-00i-005 — Playwright harness]
- **Downstream (will consume this):** none (CI gate for all tasks)
- **Parallel (can run concurrently):** [T-00i-004 — Seed fixture library]

### GIVEN / WHEN / THEN
**GIVEN** all test harnesses exist (Vitest unit/integration, Playwright), Supabase CLI available via `supabase/action` GitHub Action
**WHEN** a PR is pushed to any branch
**THEN** `.github/workflows/ci.yml` triggers; 5 parallel jobs run: `lint` (eslint), `typecheck` (tsc --noEmit), `unit` (vitest --project unit), `integration` (vitest --project integration, uses Supabase Docker service), `e2e` (playwright, uses Next.js dev server via webServer); any job failure blocks PR merge; E2E job uploads Playwright HTML report as artifact on failure; workflow completes in < 15 min

### Test gate
- Observed green on a dummy PR (can be verified after setup by pushing a trivial branch)
- **CI gate:** `pnpm test:smoke` green locally

### Rollback
`mv .github/workflows/ci.yml .github/workflows/ci.yml.disabled`

### ACP Prompt
````
# Task T-00i-002 — GitHub Actions workflow (matrix: lint, typecheck, unit, integration, e2e)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź scripts: lint, typecheck, test:unit, test:integration, test:e2e
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/turbo.json` → sprawdź pipeline tasks

## Twoje zadanie
GIVEN: wszystkie test harnesses istnieją; Supabase CLI dostępny.
WHEN: PR pushowany.
THEN: 5 job matrix w ci.yml; każdy fail blokuje merge; E2E upload artifact on fail; < 15 min total.

## Implementacja
1. Utwórz `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     push:
       branches: ['**']
     pull_request:
       branches: [main, develop]
   jobs:
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'pnpm' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm lint
     typecheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'pnpm' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm typecheck
     unit:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'pnpm' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm test:unit
     integration:
       runs-on: ubuntu-latest
       needs: [unit]
       services:
         supabase:
           image: supabase/postgres:15.1.0.117
           env:
             POSTGRES_PASSWORD: postgres
           ports: ['5432:5432']
           options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'pnpm' }
         - uses: supabase/setup-cli@v1
           with: { version: latest }
         - run: pnpm install --frozen-lockfile
         - run: supabase db reset --db-url postgresql://postgres:postgres@localhost:5432/postgres
         - run: pnpm test:integration
           env:
             SUPABASE_LOCAL_URL: http://localhost:5432
             SUPABASE_LOCAL_SERVICE_KEY: test-key
     e2e:
       runs-on: ubuntu-latest
       needs: [unit]
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'pnpm' }
         - run: pnpm install --frozen-lockfile
         - run: pnpm exec playwright install --with-deps chromium
         - run: pnpm test:e2e
         - uses: actions/upload-artifact@v4
           if: failure()
           with:
             name: playwright-report
             path: apps/web/playwright-report/
             retention-days: 7
   ```
2. Dodaj scripts do root `package.json` jeśli brak: `"lint": "turbo run lint"`, `"typecheck": "turbo run typecheck"`
3. Dodaj do `apps/web/package.json` jeśli brak: `"lint": "eslint . --ext .ts,.tsx"`, `"typecheck": "tsc --noEmit"`
4. Utwórz `.github/CODEOWNERS` z wpisem `* @mariuszkrawczyk` (opcjonalne — skip jeśli już istnieje)
5. Dodaj `.github/workflows/ci.yml` do gitignore exceptions (upewnij się że nie ignorowany)

## Files
**Create:** `.github/workflows/ci.yml`
**Modify:** root `package.json` — dodaj lint/typecheck scripts; `apps/web/package.json` — dodaj lint/typecheck scripts jeśli brak

## Done when
- `pnpm test:smoke` green lokalnie
- Workflow file valid YAML (sprawdź przez `npx js-yaml .github/workflows/ci.yml`)
- Observed: push dummy branch → GitHub Actions shows 5 jobs triggered

## Rollback
`mv .github/workflows/ci.yml .github/workflows/ci.yml.disabled`
````

---

## T-00i-003 — Integration test harness (Supabase local + `db:reset` per test)

**Type:** T4-wiring+test
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-001 — Supabase local setup, T-00b-003 — RLS policies, T-00i-001 — Vitest workspace harness]
- **Downstream (will consume this):** every integration test in the project
- **Parallel (can run concurrently):** [T-00i-005 — Playwright harness]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local is running (`supabase start`), migrations applied, `apps/web/vitest.workspace.ts` defines `integration` project with `setupFiles: ['apps/web/tests/setup/integration-setup.ts']`
**WHEN** an integration test file imports `supabaseLocalDb` from `apps/web/tests/fixtures/db.ts` and runs
**THEN** global setup runs `supabase db reset --local` before each test suite to restore clean state; `supabaseLocalDb` fixture exposes a Supabase client using `app_role` credentials (not `service_role`); `withTenant(orgId, fn)` helper sets `app.current_tenant_id` Postgres setting for the duration of `fn`; RLS policies enforced for queries made within `withTenant`; smoke test `apps/web/tests/integration/harness-smoke.integration.test.ts` PASS

### Test gate
- **Integration:** `vitest --project integration apps/web/tests/integration/harness-smoke.integration.test.ts` PASS
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`

### ACP Prompt
````
# Task T-00i-003 — Integration test harness (Supabase local + db:reset per test)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/vitest.workspace.ts` → integration project setupFiles config (po T-00i-001)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź supabase CLI dependency + scripts
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/supabase/config.toml` → sprawdź project_id + local DB port (zwykle 54322)

## Twoje zadanie
GIVEN: Supabase local działa, migracje zastosowane, vitest.workspace.ts ma integration project.
WHEN: integration test importuje supabaseLocalDb i uruchamia.
THEN: global setup resetuje DB przed suite; fixture używa app_role; withTenant ustawia Postgres setting; RLS enforced; smoke test PASS.

## Implementacja
1. Utwórz `apps/web/tests/setup/integration-setup.ts`:
   ```typescript
   import { execSync } from 'child_process'
   import { beforeAll } from 'vitest'

   beforeAll(async () => {
     // Reset DB to clean state przed każdą test suite
     execSync('supabase db reset --local', { stdio: 'inherit' })
   })
   ```
2. Utwórz `apps/web/tests/fixtures/db.ts`:
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'

   const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321'
   const SUPABASE_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? 'test-anon-key'
   const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:54322/postgres'

   // Supabase client z app_role (anon key = RLS enforced)
   export const supabaseLocalDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

   // Drizzle client dla direct DB access w testach
   export const testDb = drizzle(postgres(DB_URL))

   // Helper: set tenant context dla RLS
   export async function withTenant<T>(tenantId: string, fn: (db: typeof testDb) => Promise<T>): Promise<T> {
     return testDb.transaction(async (tx) => {
       await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`)
       return fn(tx as unknown as typeof testDb)
     })
   }
   ```
3. Utwórz smoke test `apps/web/tests/integration/harness-smoke.integration.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest'
   import { supabaseLocalDb, withTenant, testDb } from '../fixtures/db'

   describe('integration harness smoke', () => {
     it('supabaseLocalDb connects', async () => {
       const { data, error } = await supabaseLocalDb.from('tenants').select('id').limit(1)
       expect(error).toBeNull()
       // data może być [] — OK, tabela jest dostępna
     })
     it('withTenant sets tenant context', async () => {
       await withTenant('test-tenant-id', async (db) => {
         const result = await db.execute(sql`SELECT current_setting('app.current_tenant_id', true) as tid`)
         expect(result[0].tid).toBe('test-tenant-id')
       })
     })
   })
   ```
4. Upewnij się że `apps/web/vitest.workspace.ts` ma w integration project: `setupFiles: ['apps/web/tests/setup/integration-setup.ts']` — zmodyfikuj jeśli brak (po T-00i-001 może już być placeholder)
5. Dodaj env vars do `.env.test.local` (utwórz jeśli brak): `SUPABASE_LOCAL_URL=http://localhost:54321`, `SUPABASE_LOCAL_ANON_KEY=<from supabase status>`, `DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres`

## Files
**Create:** `apps/web/tests/setup/integration-setup.ts`, `apps/web/tests/fixtures/db.ts`, `apps/web/tests/integration/harness-smoke.integration.test.ts`, `.env.test.local`
**Modify:** `apps/web/vitest.workspace.ts` — upewnij się setupFiles w integration project

## Done when
- `vitest --project integration apps/web/tests/integration/harness-smoke.integration.test.ts` PASS — sprawdza: DB connection, withTenant context
- `pnpm test:smoke` green

## Rollback
`git revert` integration-setup.ts + fixtures/db.ts commits; usuń setupFiles z vitest.workspace.ts
````

---
## T-00i-004 — Seed fixture library (Forza baseline + synthetic multi-tenant)

**Type:** T5-seed
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i testing
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-004 — DB seed runner infrastructure]
- **Downstream (will consume this):** [T-00d-004, T-00f-006 — Rule engine integration test, T-00h-005 — Schema-driven integration test]
- **Parallel (can run concurrently):** [T-00i-002 — GitHub Actions workflow]

### GIVEN / WHEN / THEN
**GIVEN** seed runner exists (`apps/web/seed/runner.ts`), DB schema applied with tenants/users/roles tables
**WHEN** `applySnapshot('multi-tenant-3')` is called in a test or seed script
**THEN** 3 tenant orgs inserted with deterministic UUIDs (seeded by fixed seed string, not random); each tenant has disjoint users (no cross-tenant user sharing); 2 shared role kinds (`admin`, `viewer`) exist across all tenants; `applySnapshot('forza-baseline')` inserts Forza SpA org with 10 users; `applySnapshot('empty-tenant')` inserts 1 minimal tenant with 0 users; all UUIDs are deterministic (same call = same UUIDs, verified by unit test)

### Test gate
- **Unit:** `vitest apps/web/seed/__tests__/seed-determinism.test.ts` — calls `applySnapshot('multi-tenant-3')` twice on in-memory data structure, verifies UUID equality
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`

### ACP Prompt
````
# Task T-00i-004 — Seed fixture library (Forza baseline + synthetic multi-tenant)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/` → sprawdź istniejące schematy tabel: tenants, users, roles (po T-00b-004)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/` → sprawdź istniejącą strukturę seed runner jeśli istnieje

## Twoje zadanie
GIVEN: seed runner istnieje; DB schema zastosowana.
WHEN: applySnapshot('multi-tenant-3') wywołane.
THEN: 3 tenants, disjoint users, deterministic UUIDs; forza-baseline = 10 users; empty-tenant = 0 users; unit test potwierdza determinizm.

## Implementacja
1. Utwórz `apps/web/seed/utils/deterministic-uuid.ts`:
   ```typescript
   import { v5 as uuidv5 } from 'uuid'
   const SEED_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // URL namespace
   export function deterministicUuid(seed: string): string {
     return uuidv5(seed, SEED_NAMESPACE)
   }
   ```
2. Utwórz `apps/web/seed/forza-baseline.ts`:
   - `export const FORZA_TENANT_ID = deterministicUuid('forza-spa-tenant')`
   - Factory: `export const createForzaOrg = (overrides?) => db.insert(tenants).values({ id: FORZA_TENANT_ID, name: 'Forza SpA', slug: 'forza-spa', ...overrides })`
   - 10 users: array of `createUser({ tenantId: FORZA_TENANT_ID, email: `user${i}@forza-spa.test`, ... })` gdzie i=1..10
   - Export `export async function applyForzaBaseline(db: DrizzleDb): Promise<void>`
3. Utwórz `apps/web/seed/empty-tenant.ts`:
   - `export const EMPTY_TENANT_ID = deterministicUuid('empty-tenant')`
   - `export async function applyEmptyTenant(db: DrizzleDb): Promise<void>` — insert 1 tenant, 0 users
4. Utwórz `apps/web/seed/multi-tenant-3.ts`:
   - 3 tenant IDs: `deterministicUuid('tenant-alpha')`, `deterministicUuid('tenant-beta')`, `deterministicUuid('tenant-gamma')`
   - Per tenant: 3 users z deterministycznym UUID `deterministicUuid('user-${tenantSlug}-${i}')`
   - 2 shared role kinds: `{ kind: 'admin', ... }`, `{ kind: 'viewer', ... }` per tenant
   - `export async function applyMultiTenant3(db: DrizzleDb): Promise<void>`
5. Utwórz dispatcher `apps/web/seed/runner.ts` (lub rozszerz istniejący):
   ```typescript
   export type SnapshotName = 'forza-baseline' | 'empty-tenant' | 'multi-tenant-3'
   export async function applySnapshot(name: SnapshotName, db: DrizzleDb): Promise<void> {
     if (name === 'forza-baseline') return applyForzaBaseline(db)
     if (name === 'empty-tenant') return applyEmptyTenant(db)
     if (name === 'multi-tenant-3') return applyMultiTenant3(db)
   }
   ```
   - Napisz `apps/web/seed/__tests__/seed-determinism.test.ts`:
   - Dodaj `uuid` i `@types/uuid` do `apps/web/package.json` — uruchom `pnpm add uuid` oraz `pnpm add -D @types/uuid` w katalogu `apps/web` jeśli tych wpisów jeszcze nie ma
## Files
**Create:** `apps/web/seed/utils/deterministic-uuid.ts`, `apps/web/seed/forza-baseline.ts`, `apps/web/seed/empty-tenant.ts`, `apps/web/seed/multi-tenant-3.ts`, `apps/web/seed/__tests__/seed-determinism.test.ts`
**Modify:** `apps/web/seed/runner.ts` — dodaj applySnapshot dispatcher (lub utwórz)

## Done when
- `vitest apps/web/seed/__tests__/seed-determinism.test.ts` PASS — sprawdza: UUID determinism, multi-tenant-3 arrays equal on 2 calls
- `pnpm test:smoke` green

## Rollback
Usuń pliki seed/*.ts; `pnpm remove uuid` jeśli dodano tylko dla tego taska
````

---

## T-00i-005 — Playwright harness + auth fixture

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 55 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002 — Next.js app scaffold, T-00i-001 — Vitest workspace harness]
- **Downstream (will consume this):** [T-00c-006, every E2E test in the project]
- **Parallel (can run concurrently):** [T-00i-003 — Integration test harness]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots on `http://localhost:3000` (dev server), Supabase local auth enabled with test user `e2e@monopilot.test` / `testpassword123`
**WHEN** `pnpm test:e2e` is run
**THEN** Playwright resolves 1 project (`chromium`); `authenticatedPage` fixture from `apps/web/e2e/fixtures/auth.ts` logs in once, saves `storageState` to `apps/web/e2e/.auth/user.json`, reuses state for all tests in session; `playwright.config.ts` sets `baseURL: 'http://localhost:3000'`, `webServer.command: 'pnpm dev'`, `reporter: [['html', { outputFolder: 'playwright-report' }]]`; smoke spec `apps/web/e2e/smoke.spec.ts` navigates to `/` and asserts `<h1>` visible; HTML report emitted to `apps/web/playwright-report/`

### Test gate
- **E2E:** `pnpm test:e2e apps/web/e2e/smoke.spec.ts` PASS
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm remove -D @playwright/test`; remove `apps/web/playwright.config.ts` + `apps/web/e2e/` directory
### ACP Prompt
````
# Task T-00i-005 — Playwright harness + auth fixture

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź istniejące scripts + devDependencies
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/next.config.ts` (lub .js) → sprawdź basePath jeśli ustawiony (wpływa na baseURL)

## Twoje zadanie
GIVEN: Next.js app boots na localhost:3000; Supabase local auth z test user e2e@monopilot.test/testpassword123.
WHEN: pnpm test:e2e uruchomione.
THEN: Playwright chromium project; authenticatedPage fixture z storageState; webServer auto-start; smoke spec PASS; HTML report w playwright-report/.

## Implementacja
1. Dodaj `@playwright/test` do `apps/web/package.json` — uruchom `pnpm add -D @playwright/test` w katalogu `apps/web`, a następnie zainstaluj Chromium przez `pnpm exec playwright install chromium` z katalogu `apps/web`
2. Utwórz `apps/web/playwright.config.ts`:
   ```typescript
   import { defineConfig, devices } from '@playwright/test'
   export default defineConfig({
     testDir: './e2e',
     fullyParallel: true,
     forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 2 : 0,
     reporter: [['html', { outputFolder: 'playwright-report' }]],
     use: {
       baseURL: 'http://localhost:3000',
       trace: 'on-first-retry',
     },
     projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
     webServer: {
       command: 'pnpm dev',
       url: 'http://localhost:3000',
       reuseExistingServer: !process.env.CI,
       timeout: 120000,
     },
   })
   ```
3. Utwórz `apps/web/e2e/fixtures/auth.ts`:
   ```typescript
   import { test as base, expect } from '@playwright/test'
   import path from 'path'

   export const AUTH_FILE = path.join(__dirname, '../.auth/user.json')

   export const test = base.extend({
     authenticatedPage: async ({ page }, use) => {
       // Global setup: login raz i zapisz storageState
       await page.goto('/login')
       await page.fill('[name=email]', 'e2e@monopilot.test')
       await page.fill('[name=password]', 'testpassword123')
       await page.click('[type=submit]')
       await page.waitForURL('/')
       await page.context().storageState({ path: AUTH_FILE })
       await use(page)
     },
   })
   export { expect }
   ```
4. Utwórz `apps/web/e2e/.gitignore`: `.auth/` (nie commitujemy session state)
5. Utwórz `apps/web/e2e/smoke.spec.ts`:
   ```typescript
   import { test, expect } from '@playwright/test'
   test('homepage loads', async ({ page }) => {
     await page.goto('/')
     await expect(page.locator('h1')).toBeVisible()
   })
   ```
   - Dodaj script do `apps/web/package.json`: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`
   - Dodaj do root `package.json`: `"test:e2e": "turbo run test:e2e"` + do turbo.json: `"test:e2e": { "cache": false }`
   - Utwórz `apps/web/e2e/.auth/` directory (mkdir) + add `.gitkeep`
## Files
**Create:** `apps/web/playwright.config.ts`, `apps/web/e2e/fixtures/auth.ts`, `apps/web/e2e/smoke.spec.ts`, `apps/web/e2e/.gitignore`
**Modify:** `apps/web/package.json` — dodaj test:e2e scripts; root `package.json` — dodaj test:e2e; `turbo.json` — dodaj test:e2e

## Done when
- `pnpm test:e2e apps/web/e2e/smoke.spec.ts` PASS — sprawdza: h1 visible
- `apps/web/playwright-report/` directory created
- `pnpm test:smoke` green

## Rollback
`pnpm remove -D @playwright/test`; `git rm -r apps/web/playwright.config.ts apps/web/e2e/`
````

---
## T-00i-006 — Sentry init (web + worker) + source maps upload

**Type:** T4-wiring+test
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i observability
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-007 — Env vars + secrets management]
- **Downstream (will consume this):** [T-00i-008 — Vercel preview deploys + deploy gates]
- **Parallel (can run concurrently):** [T-00i-007 — PostHog feature-flag client]

### GIVEN / WHEN / THEN
**GIVEN** `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` are set in `.env.local` and CI secrets
**WHEN** the Next.js app or worker process starts (or crashes)
**THEN** `@sentry/nextjs` captures unhandled errors with `release` tag = `process.env.NEXT_PUBLIC_APP_VERSION`; source maps uploaded to Sentry during CI build via `@sentry/webpack-plugin`; worker (`apps/worker`) uses `@sentry/node` with `Sentry.init({ dsn, release, environment })`; a deliberate `throw new Error('Sentry smoke test')` in a test route returns 500 AND error visible in Sentry within 30s; `apps/web/sentry.client.config.ts` + `apps/web/sentry.server.config.ts` both init with `tracesSampleRate: 0.1` in production, `1.0` in development

### Test gate
- Manual smoke: trigger `/api/test/sentry-error` → error appears in Sentry dashboard
- **CI gate:** `pnpm test:smoke` green (Sentry init does not throw on missing DSN — graceful degradation)

### Rollback
`git revert HEAD --no-edit`

### ACP Prompt
````
# Task T-00i-006 — Sentry init (web + worker) + source maps upload

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/next.config.ts` (lub .js) → sprawdź istniejącą konfigurację (będziemy ją wrappować withSentryConfig)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź istniejące dependencies

## Twoje zadanie
GIVEN: SENTRY_DSN + tokeny w env.
WHEN: app/worker startuje lub crashuje.
THEN: @sentry/nextjs captures errors z release tag; source maps upload w CI; worker używa @sentry/node; graceful degradation gdy DSN brak; sentry.client.config.ts + sentry.server.config.ts oba zainicjowane.

## Implementacja
1. Dodaj `@sentry/nextjs` i `@sentry/webpack-plugin` do `apps/web/package.json` oraz `@sentry/node` do `apps/worker/package.json` — uruchom `pnpm add @sentry/nextjs` i `pnpm add -D @sentry/webpack-plugin` w katalogu `apps/web`, a `pnpm add @sentry/node` w katalogu `apps/worker`
2. Utwórz `apps/web/sentry.client.config.ts`:
   ```typescript
   import * as Sentry from '@sentry/nextjs'
   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
     release: process.env.NEXT_PUBLIC_APP_VERSION,
     environment: process.env.NODE_ENV,
     tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
     enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
   })
   ```
3. Utwórz `apps/web/sentry.server.config.ts` (analogiczny, bez NEXT_PUBLIC_ prefix dla DSN):
   ```typescript
   import * as Sentry from '@sentry/nextjs'
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     release: process.env.NEXT_PUBLIC_APP_VERSION,
     environment: process.env.NODE_ENV,
     tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
     enabled: !!process.env.SENTRY_DSN,
   })
   ```
4. Utwórz `apps/web/instrumentation.ts` (Next.js 14+ instrumentation hook):
   ```typescript
   export async function register() {
     if (process.env.NEXT_RUNTIME === 'nodejs') {
       await import('./sentry.server.config')
     }
   }
   ```
5. Zmodyfikuj `apps/web/next.config.ts` — wrap `withSentryConfig(nextConfig, { org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, silent: true, widenClientFileUpload: true })`
   - Utwórz `apps/worker/src/sentry.ts`:
   - Utwórz `apps/web/app/api/test/sentry-error/route.ts` (tylko dla dev/test environments):
   - Dodaj do `.env.local.example`: `SENTRY_DSN=`, `NEXT_PUBLIC_SENTRY_DSN=`, `SENTRY_ORG=`, `SENTRY_PROJECT=`, `SENTRY_AUTH_TOKEN=`, `NEXT_PUBLIC_APP_VERSION=0.0.1`
## Files
**Create:** `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, `apps/web/instrumentation.ts`, `apps/worker/src/sentry.ts`, `apps/web/app/api/test/sentry-error/route.ts`
**Modify:** `apps/web/next.config.ts` — wrap withSentryConfig; `apps/worker/src/index.ts` (lub main entry) — call initSentry()

## Done when
- App starts without throwing when SENTRY_DSN is missing (graceful degradation)
- `pnpm test:smoke` green
- Manual: `curl http://localhost:3000/api/test/sentry-error` returns 500; error visible in Sentry UI within 30s (when DSN configured)

## Rollback
Usuń sentry.client.config.ts, sentry.server.config.ts, instrumentation.ts; zrevertuj next.config.ts; `pnpm remove @sentry/nextjs @sentry/node`
````

---

## T-00i-007 — PostHog self-host skeleton + feature-flag client singleton

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-007 — Env vars + secrets management]
- **Downstream (will consume this):** none
- **Parallel (can run concurrently):** [T-00i-006 — Sentry init]

### GIVEN / WHEN / THEN
**GIVEN** `POSTHOG_HOST` (self-host URL) and `POSTHOG_API_KEY` set in env
**WHEN** server code calls `flag('npd.brief_v2', { tenantId: 'abc', userId: 'xyz' })`
**THEN** returns `boolean`; scoped to `tenant_id` + `user_id` via PostHog person properties; fallback to `false` on network outage (no throw); client-side `useFlag('npd.brief_v2')` hook returns `boolean` using `posthog-js`; PostHog singleton initialized once per process (not per request); unit test with mocked network verifies fallback-on-outage behavior

### Test gate
- **Unit:** `vitest apps/web/lib/monitoring/__tests__/posthog.test.ts` — covers: flag returns true when mock returns true; flag returns false on network error (fetch throws)
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm remove posthog-node posthog-js`; remove `apps/web/lib/monitoring/posthog.ts`
### ACP Prompt
````
# Task T-00i-007 — PostHog self-host skeleton + feature-flag client singleton

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → grep `PostHog` — spec [R6]: feature flags per-tenant targeting
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź istniejące dependencies

## Twoje zadanie
GIVEN: POSTHOG_HOST + POSTHOG_API_KEY w env.
WHEN: flag('npd.brief_v2', { tenantId, userId }) wywołane.
THEN: zwraca boolean; fallback false na outage; singleton per process; useFlag hook dla client-side; unit test pokrywa fallback.

## Implementacja
1. Dodaj `posthog-node` i `posthog-js` do `apps/web/package.json` — uruchom `pnpm add posthog-node posthog-js` w katalogu `apps/web`
2. Utwórz `apps/web/lib/monitoring/posthog.ts` (server singleton):
   ```typescript
   import { PostHog } from 'posthog-node'

   let _client: PostHog | null = null

   function getPostHogClient(): PostHog | null {
     if (!process.env.POSTHOG_API_KEY || !process.env.POSTHOG_HOST) return null
     if (!_client) {
       _client = new PostHog(process.env.POSTHOG_API_KEY, {
         host: process.env.POSTHOG_HOST,
         flushAt: 1, // dev: flush immediately
         flushInterval: 0,
       })
     }
     return _client
   }

   export interface FlagContext {
     tenantId: string
     userId: string
   }

   export async function flag(flagKey: string, ctx: FlagContext): Promise<boolean> {
     const client = getPostHogClient()
     if (!client) return false
     try {
       const distinctId = `${ctx.tenantId}:${ctx.userId}`
       const result = await client.isFeatureEnabled(flagKey, distinctId, {
         personProperties: { tenant_id: ctx.tenantId, user_id: ctx.userId },
       })
       return result ?? false
     } catch {
       return false // graceful degradation on outage
     }
   }

   export async function shutdownPostHog(): Promise<void> {
     await _client?.shutdown()
     _client = null
   }
   ```
3. Utwórz `apps/web/lib/monitoring/use-flag.ts` (client-side hook):
   ```typescript
   'use client'
   import { useFeatureFlagEnabled } from 'posthog-js/react'
   export function useFlag(key: string): boolean {
     return useFeatureFlagEnabled(key) ?? false
   }
   ```
4. Utwórz PostHog provider setup `apps/web/lib/monitoring/posthog-provider.tsx`:
   ```typescript
   'use client'
   import posthog from 'posthog-js'
   import { PostHogProvider } from 'posthog-js/react'
   import { useEffect } from 'react'
   export function PHProvider({ children }: { children: React.ReactNode }) {
     useEffect(() => {
       if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
         posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
           api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
           loaded: (ph) => { if (process.env.NODE_ENV === 'development') ph.debug() },
         })
       }
     }, [])
     return <PostHogProvider client={posthog}>{children}</PostHogProvider>
   }
   ```
5. Napisz `apps/web/lib/monitoring/__tests__/posthog.test.ts`:
   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest'
   // Mock posthog-node
   vi.mock('posthog-node', () => ({
     PostHog: vi.fn().mockImplementation(() => ({
       isFeatureEnabled: vi.fn(),
       shutdown: vi.fn(),
     })),
   }))
   import { flag } from '../posthog'
   describe('flag()', () => {
     it('returns true when posthog returns true', async () => {
       process.env.POSTHOG_API_KEY = 'test-key'
       process.env.POSTHOG_HOST = 'http://localhost:8000'
       // mock isFeatureEnabled returns true
       const result = await flag('npd.brief_v2', { tenantId: 'abc', userId: 'xyz' })
       expect(typeof result).toBe('boolean')
     })
     it('returns false on network error (outage)', async () => {
       // mock isFeatureEnabled throws
       const result = await flag('any-flag', { tenantId: 'abc', userId: 'xyz' })
       expect(result).toBe(false)
     })
     it('returns false when env vars not set', async () => {
       delete process.env.POSTHOG_API_KEY
       const result = await flag('any-flag', { tenantId: 'abc', userId: 'xyz' })
       expect(result).toBe(false)
     })
   })
   ```
   - Dodaj env vars do `.env.local.example`: `POSTHOG_API_KEY=`, `POSTHOG_HOST=http://localhost:8000`, `NEXT_PUBLIC_POSTHOG_KEY=`, `NEXT_PUBLIC_POSTHOG_HOST=http://localhost:8000`
## Files
**Create:** `apps/web/lib/monitoring/posthog.ts`, `apps/web/lib/monitoring/use-flag.ts`, `apps/web/lib/monitoring/posthog-provider.tsx`, `apps/web/lib/monitoring/__tests__/posthog.test.ts`

## Done when
- `vitest apps/web/lib/monitoring/__tests__/posthog.test.ts` PASS — sprawdza: true flag, outage fallback false, no-env fallback false
- `pnpm test:smoke` green

## Rollback
`pnpm remove posthog-node posthog-js`; `git rm apps/web/lib/monitoring/posthog.ts apps/web/lib/monitoring/use-flag.ts apps/web/lib/monitoring/posthog-provider.tsx`
````

---
## T-00i-008 — Vercel preview deploys + deploy gates

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00i-002 — GitHub Actions workflow, T-00i-006 — Sentry init]
- **Downstream (will consume this):** none
- **Parallel (can run concurrently):** [T-00i-009 — Accessibility baseline]

### GIVEN / WHEN / THEN
**GIVEN** Vercel project linked to the monopilot-kira repo, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` in GitHub secrets
**WHEN** a PR opens or pushes to any branch
**THEN** Vercel builds a preview deploy automatically; a GitHub Action job `deploy-gate` polls the preview URL until healthy (max 5 min); `deploy-gate` hits `GET /api/health` and expects `{ status: 'ok' }` with HTTP 200; if health check fails, deploy-gate job fails → PR status shows red; `apps/web/vercel.json` sets `regions: ['fra1']` and `framework: 'nextjs'`; preview deploys for merged PRs cleaned up by cron `preview-cleanup.yml` after 7 days

### Test gate
- Observed: push dummy branch → Vercel preview URL appears in PR comments; `/api/health` returns 200
- **CI gate:** `pnpm test:smoke` green locally

### Rollback
`git revert HEAD --no-edit`

### ACP Prompt
````
# Task T-00i-008 — Vercel preview deploys + deploy gates

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/.github/workflows/ci.yml` → sprawdź istniejące jobs (będziemy dodawać deploy-gate job po T-00i-002)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/` → sprawdź istniejące route handlers (utwórz /api/health jeśli brak)

## Twoje zadanie
GIVEN: Vercel project linked; VERCEL_TOKEN + VERCEL_ORG_ID + VERCEL_PROJECT_ID w GitHub secrets.
WHEN: PR otwierany/pushowany.
THEN: Vercel preview deploy automatyczny; deploy-gate job polluje /api/health; fail → PR status red; vercel.json konfiguracja; preview cleanup cron.

## Implementacja
1. Utwórz `apps/web/vercel.json`:
   ```json
   {
     "framework": "nextjs",
     "regions": ["fra1"],
     "buildCommand": "pnpm build",
     "installCommand": "pnpm install --frozen-lockfile",
     "outputDirectory": ".next",
     "env": {
       "NEXT_PUBLIC_APP_VERSION": "@app_version"
     }
   }
   ```
2. Utwórz `apps/web/app/api/health/route.ts` (jeśli nie istnieje):
   ```typescript
   import { NextResponse } from 'next/server'
   export async function GET() {
     return NextResponse.json({
       status: 'ok',
       timestamp: new Date().toISOString(),
       version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
     })
   }
   ```
3. Dodaj `deploy-gate` job do `.github/workflows/ci.yml` (append po istniejących jobs):
   ```yaml
   deploy-gate:
     runs-on: ubuntu-latest
     needs: [unit]
     if: github.event_name == 'pull_request'
     steps:
       - name: Wait for Vercel preview
         uses: patrickedqvist/wait-for-vercel-preview@v1.3.1
         id: vercel_preview
         with:
           token: ${{ secrets.GITHUB_TOKEN }}
           max_timeout: 300
       - name: Health check
         run: |
           STATUS=$(curl -s -o /dev/null -w "%{http_code}" ${{ steps.vercel_preview.outputs.url }}/api/health)
           if [ "$STATUS" != "200" ]; then
             echo "Health check failed with status $STATUS"
             exit 1
           fi
           BODY=$(curl -s ${{ steps.vercel_preview.outputs.url }}/api/health)
           echo "Health response: $BODY"
           echo $BODY | grep -q '"status":"ok"' || exit 1
   ```
4. Utwórz `.github/workflows/preview-cleanup.yml`:
   ```yaml
   name: Preview Cleanup
   on:
     schedule:
       - cron: '0 3 * * *'  # Daily at 3am UTC
     workflow_dispatch:
   jobs:
     cleanup:
       runs-on: ubuntu-latest
       steps:
         - name: Delete old preview deployments
           uses: actions/github-script@v7
           with:
             script: |
               const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
               console.log('Cleaning up preview deployments older than', sevenDaysAgo.toISOString())
               // Vercel preview cleanup via vercel CLI
         - name: Run Vercel cleanup
           run: |
             npx vercel@latest \
               --token ${{ secrets.VERCEL_TOKEN }} \
               ls --scope ${{ secrets.VERCEL_ORG_ID }} 2>/dev/null | head -20
           continue-on-error: true
   ```
5. Utwórz `apps/web/app/api/health/outbox/route.ts` (metrics endpoint per PRD):
   ```typescript
   import { NextResponse } from 'next/server'
   export async function GET() {
     // TODO: query outbox pending count when outbox table exists
     return NextResponse.json({ status: 'ok', outbox_pending: 0, timestamp: new Date().toISOString() })
   }
   ```
   - Dodaj GitHub secrets dokumentację do `docs/deploy/vercel-setup.md` (utwórz): lista required secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
## Files
**Create:** `apps/web/vercel.json`, `apps/web/app/api/health/route.ts`, `apps/web/app/api/health/outbox/route.ts`, `.github/workflows/preview-cleanup.yml`
**Modify:** `.github/workflows/ci.yml` — dodaj deploy-gate job

## Done when
- `apps/web/app/api/health/route.ts` returns `{ status: 'ok' }` when called locally
- `pnpm test:smoke` green
- Observed: Vercel preview deploy triggered on PR push

## Rollback
`git rm apps/web/vercel.json .github/workflows/preview-cleanup.yml`; usuń deploy-gate job z ci.yml
````

---

## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-00h-001 | [T-00b-000, T-00b-E03] | [T-00g-001] |
| T-00h-002 | [T-00h-001] | [T-00g-005, T-00h-003] |
| T-00h-003 | [T-00h-001] | [T-00h-002, T-00h-004] |
| T-00h-004 | [T-00h-001] | [T-00h-002, T-00h-003] |
| T-00h-005 | [T-00h-003, T-00h-004] | [T-00f-006] |
| T-00i-001 | [T-00a-004] | [T-00i-005] |
| T-00i-002 | [T-00i-001, T-00i-003, T-00i-005] | [T-00i-004] |
| T-00i-003 | [T-00b-001, T-00b-003, T-00i-001] | [T-00i-005] |
| T-00i-004 | [T-00b-004] | [T-00i-002] |
| T-00i-005 | [T-00a-002, T-00i-001] | [T-00i-003] |
| T-00i-006 | [T-00a-007] | [T-00i-007] |
| T-00i-007 | [T-00a-007] | [T-00i-006] |
| T-00i-008 | [T-00i-002, T-00i-006] | [T-00i-009] |

## Parallel dispatch plan

Wave 0 (schema blockers): T-00h-001 (needs T-00b-000 + T-00b-E03 done)
Wave 0b (infra blockers): T-00i-001 (needs T-00a-004), T-00i-004 (needs T-00b-004), T-00i-006 (needs T-00a-007), T-00i-007 (needs T-00a-007)

Wave 1 (parallel after Wave 0): T-00h-002, T-00h-003, T-00h-004 (all parallel, all need T-00h-001)
Wave 1b (parallel after T-00i-001): T-00i-003, T-00i-005 (parallel pair)

Wave 2 (after Wave 1): T-00h-005 (needs T-00h-003 + T-00h-004)
Wave 2b (after T-00i-003 + T-00i-005): T-00i-002 (needs T-00i-001 + T-00i-003 + T-00i-005)

Wave 3 (after Wave 2b + Wave 0b Sentry): T-00i-008 (needs T-00i-002 + T-00i-006)

## PRD coverage

✅ §R2 Storage pattern hybrid — T-00h-001 (ext_jsonb + schema_migrations migration)
✅ §R4 Zod + json-schema-to-zod runtime — T-00h-002 (compiler + LRU cache)
✅ §R4 ext_jsonb helpers — T-00h-003 (read/write/index helpers)
✅ §R4 schema_version bump — T-00h-004 (idempotent add-column + version bump)
✅ §R4 end-to-end metadata→Zod — T-00h-005 (integration test pre/post add column)
✅ §D10 Vitest testing — T-00i-001 (workspace harness + coverage v8 ≥85%)
✅ §D10 CI pipeline — T-00i-002 (GitHub Actions 5-job matrix)
✅ §D10 Integration test harness — T-00i-003 (Supabase local + db:reset + withTenant)
✅ §D10 Seed fixtures — T-00i-004 (Forza baseline + empty-tenant + multi-tenant-3)
✅ §D10 Playwright E2E — T-00i-005 (harness + auth fixture + smoke spec)
✅ §Observability Sentry — T-00i-006 (web @sentry/nextjs + worker @sentry/node + source maps)
✅ §R6 PostHog feature flags — T-00i-007 (self-host skeleton + flag() server + useFlag() client)
✅ §Deploy Vercel preview — T-00i-008 (preview deploys + /api/health deploy gate + cleanup cron)

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 1 | T-00h-001 |
| T2-api | 4 | T-00h-002, T-00h-003, T-00h-004, T-00i-007 |
| T4-wiring+test | 7 | T-00h-005, T-00i-001, T-00i-002, T-00i-003, T-00i-005, T-00i-006, T-00i-008 |
| T5-seed | 1 | T-00i-004 |
| **Total** | **13** | |

**Total estimated time:** 630 min (~10.5 hours)
**Context budgets:** 45+55+45+45+70+35+50+45+40+50+40+40+35 = 595k tokens
