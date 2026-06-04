import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { JobRegistry } from '../registry.js';

const JOB_NAME = 'allergen-cascade-rebuild';
const DEFAULT_EVERY_MS = 5_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DEBOUNCE_MS = 5 * 60 * 1000;
const MAX_PRODUCTS_PER_RUN = 10_000;

const SOURCE_EVENT_TYPES = [
  'reference.allergens_by_rm.bulk_changed',
  'reference.allergens_added_by_process.bulk_changed',
] as const;

type SourceEventType = (typeof SOURCE_EVENT_TYPES)[number];

export type AllergenCascadeRebuildOptions = {
  everyMs?: number;
  batchSize?: number;
  debounceMs?: number;
};

type SourceEventRow = {
  id: string;
  org_id: string;
  event_type: SourceEventType;
  aggregate_id: string;
  payload: {
    source_event_id?: unknown;
    ingredient_codes?: unknown;
    process_names?: unknown;
  };
};

type PendingOrgRow = {
  org_id: string;
};

type JobRow = {
  id: string;
  org_id: string;
  product_code: string;
  source_event_id: string;
};

type OverrideDiffRow = {
  product_code: string;
  derived_allergens: string[];
  published_allergens: string[];
  override_add: string[];
  override_remove: string[];
};

export function registerAllergenCascadeRebuild(
  registry: JobRegistry,
  options: AllergenCascadeRebuildOptions = {},
): void {
  registry.register(
    JOB_NAME,
    { kind: 'interval', everyMs: options.everyMs ?? DEFAULT_EVERY_MS },
    async ({ pool, logger }) => {
      await queueReferenceEvents(pool, options.batchSize ?? DEFAULT_BATCH_SIZE);
      const completed = await processDueJobs(pool, {
        batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
        debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      });

      if (completed > 0) {
        logger.info('allergen cascade rebuild completed', { org_batches: completed });
      }
    },
  );
}

async function queueReferenceEvents(pool: pg.Pool, batchSize: number): Promise<void> {
  const sourceEvents = await pool.query<SourceEventRow>(
    `select id::text, org_id::text, event_type, aggregate_id, payload
     from public.outbox_events
     where consumed_at is null
       and dead_lettered_at is null
       and event_type = any($1::text[])
     order by org_id, created_at
     limit $2`,
    [SOURCE_EVENT_TYPES, batchSize],
  );

  for (const event of sourceEvents.rows) {
    await queueOneSourceEvent(pool, event);
    await pool.query(
      `update public.outbox_events
       set consumed_at = pg_catalog.now()
       where id = $1
         and consumed_at is null`,
      [event.id],
    );
  }
}

async function queueOneSourceEvent(pool: pg.Pool, event: SourceEventRow): Promise<void> {
  const sourceEventId = readUuid(event.payload.source_event_id, event.aggregate_id);
  const ingredientCodes = readStringArray(event.payload.ingredient_codes);
  const processNames = readStringArray(event.payload.process_names);
  const sessionToken = randomUUID();
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, event.org_id],
    );
    await client.query('set local role app_user');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
      sessionToken,
      event.org_id,
    ]);
    await client.query(
      `select *
       from app.queue_allergen_cascade_rebuild($1::uuid, $2::text[], $3::text[], $4::uuid, $5::text)`,
      [event.org_id, ingredientCodes, processNames, sourceEventId, event.event_type],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function processDueJobs(
  pool: pg.Pool,
  opts: { batchSize: number; debounceMs: number },
): Promise<number> {
  const orgs = await pool.query<PendingOrgRow>(
    `select distinct org_id::text
     from public.allergen_cascade_rebuild_jobs
     where processed_at is null
       and run_after <= pg_catalog.now()
     order by org_id`,
  );

  let completed = 0;
  for (const org of orgs.rows) {
    if (await processOrgJobs(pool, org.org_id, opts)) {
      completed += 1;
    }
  }

  return completed;
}

async function processOrgJobs(
  pool: pg.Pool,
  orgId: string,
  opts: { batchSize: number; debounceMs: number },
): Promise<boolean> {
  const started = Date.now();
  const sessionToken = randomUUID();
  const limit = Math.min(MAX_PRODUCTS_PER_RUN, Math.max(opts.batchSize, MAX_PRODUCTS_PER_RUN));
  const client = await pool.connect();

  try {
    await client.query('begin');
    const lock = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext($1)) as locked`,
      [`npd.allergen_rebuild:${orgId}`],
    );

    if (!lock.rows[0]?.locked) {
      await client.query('rollback');
      return false;
    }

    await client.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1::uuid, $2::uuid)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionToken, orgId],
    );
    await client.query('set local role app_user');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);

    const jobs = await client.query<JobRow>(
      `select id::text, org_id::text, product_code, source_event_id::text
       from public.allergen_cascade_rebuild_jobs
       where org_id = $1::uuid
         and processed_at is null
         and run_after <= pg_catalog.now()
       order by created_at, product_code
       limit $2
       for update skip locked`,
      [orgId, limit],
    );

    if (jobs.rows.length === 0) {
      await client.query('commit');
      return false;
    }

    const productCodes = uniqueSorted(jobs.rows.map((job) => job.product_code));
    const sourceEventIds = uniqueSorted(jobs.rows.map((job) => job.source_event_id));
    for (let index = 0; index < productCodes.length; index += opts.batchSize) {
      const batch = productCodes.slice(index, index + opts.batchSize);
      for (const productCode of batch) {
        await client.query(`select * from public.update_fa_allergen_set($1)`, [productCode]);
      }
    }

    const diffs = await client.query<OverrideDiffRow>(
      `select product_code,
              derived_allergens,
              published_allergens,
              coalesce(
                array(
                  select value
                  from unnest(published_allergens) value
                  except
                  select value
                  from unnest(derived_allergens) value
                  order by value
                ),
                '{}'::text[]
              ) as override_add,
              coalesce(
                array(
                  select value
                  from unnest(derived_allergens) value
                  except
                  select value
                  from unnest(published_allergens) value
                  order by value
                ),
                '{}'::text[]
              ) as override_remove
       from public.fa_allergen_cascade
       where product_code = any($1::text[])
       order by product_code`,
      [productCodes],
    );

    await client.query(
      `update public.allergen_cascade_rebuild_jobs
       set status = 'processed',
           processed_at = pg_catalog.now()
       where id = any($1::uuid[])`,
      [jobs.rows.map((job) => job.id)],
    );

    for (const diff of diffs.rows) {
      await client.query(
        `insert into public.audit_events (
           org_id,
           actor_type,
           action,
           resource_type,
           resource_id,
           after_state,
           request_id,
           retention_class
         )
         values (
           $1::uuid,
           'system',
           'ALLERGEN_CASCADE_REBUILD',
           'allergen_cascade_rebuild',
           $2,
           $3::jsonb,
           gen_random_uuid(),
           'standard'
         )`,
        [
          orgId,
          diff.product_code,
          JSON.stringify({
            source_event_ids: sourceEventIds,
            derived_allergens: diff.derived_allergens,
            published_allergens: diff.published_allergens,
            override_diff: {
              add: diff.override_add,
              remove: diff.override_remove,
            },
          }),
        ],
      );
    }

    await client.query(
      `insert into public.outbox_events (
         org_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload,
         app_version,
         dedup_key
       )
       values ($1::uuid, 'npd.allergens.bulk_rebuild_completed', 'npd.allergens', $2, $3::jsonb, 't099-worker', $4)
       on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
      [
        orgId,
        sourceEventIds[0] ?? randomUUID(),
        JSON.stringify({
          org_id: orgId,
          source_event_id: sourceEventIds[0] ?? null,
          source_event_ids: sourceEventIds,
          affected_count: productCodes.length,
          duration_ms: Date.now() - started,
          dropped_count: 0,
        }),
        `allergen-cascade-completed:${orgId}:${sourceEventIds.join(',')}`,
      ],
    );

    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function readUuid(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
