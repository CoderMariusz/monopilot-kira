import type { Pool } from 'pg';

export type QueueAllergenCascadeRebuildInput = {
  orgId: string;
  sessionToken: string;
  sourceEventId: string;
  ingredientCodes: string[];
  processNames: string[];
  sourceEventType?:
    | 'reference.allergens_by_rm.bulk_changed'
    | 'reference.allergens_added_by_process.bulk_changed';
};

export type QueuedAllergenCascadeRebuild = {
  productCode: string;
  jobId: string;
  sourceEventId: string;
  inserted: boolean;
};

type QueueRow = {
  product_code: string;
  job_id: string;
  source_event_id: string;
  inserted: boolean;
};

export async function queueAllergenCascadeRebuild(
  pool: Pool,
  input: QueueAllergenCascadeRebuildInput,
): Promise<QueuedAllergenCascadeRebuild[]> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
      input.sessionToken,
      input.orgId,
    ]);

    const result = await client.query<QueueRow>(
      `select product_code, job_id, source_event_id, inserted
       from app.queue_allergen_cascade_rebuild($1::uuid, $2::text[], $3::text[], $4::uuid, $5::text)`,
      [
        input.orgId,
        input.ingredientCodes,
        input.processNames,
        input.sourceEventId,
        input.sourceEventType ?? 'reference.allergens_by_rm.bulk_changed',
      ],
    );

    await client.query('commit');

    return result.rows.map((row) => ({
      productCode: row.product_code,
      jobId: row.job_id,
      sourceEventId: row.source_event_id,
      inserted: row.inserted,
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
