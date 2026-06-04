'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

export type FactoryReleaseStatusValue =
  | 'pending_npd_release'
  | 'pending_technical_approval'
  | 'approved_for_factory'
  | 'released_to_factory'
  | 'blocked';

export type ReleaseBlocker = {
  type: string;
  message: string;
  remediationHref: string;
};

export type FactoryReleaseStatus = {
  id: string;
  orgId: string;
  projectId: string;
  productCode: string;
  releaseStatus: FactoryReleaseStatusValue;
  factoryAvailableAt: string | null;
  factoryApprovedBy: string | null;
  releaseEventId: number | null;
  activeBomHeaderId: string | null;
  activeFactorySpecId: string | null;
  releaseBlockers: ReleaseBlocker[];
  requestedBy: string | null;
  requestedAt: string | null;
};

type ReleaseRow = {
  id: string;
  org_id: string;
  project_id: string;
  product_code: string;
  release_status: FactoryReleaseStatusValue;
  factory_available_at: Date | string | null;
  factory_approved_by: string | null;
  release_event_id: number | string | null;
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
  release_blockers: ReleaseBlocker[] | null;
  requested_by: string | null;
  requested_at: Date | string | null;
};

const UuidSchema = z.string().uuid();

const BundleInputSchema = z.object({
  projectId: UuidSchema,
  productCode: z.string().min(1),
  activeBomHeaderId: UuidSchema,
  activeFactorySpecId: UuidSchema,
});

const D365ExportInputSchema = z.object({
  projectId: UuidSchema,
  productCode: z.string().min(1),
  d365ExportRunId: z.string().min(1),
});

const GetInputSchema = z.object({
  projectId: UuidSchema,
  productCode: z.string().min(1),
});

const BlockerSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
  remediationHref: z.string().min(1),
});

const BlockInputSchema = BundleInputSchema.extend({
  blockers: z.array(BlockerSchema).min(1),
});

export type BundleInput = z.infer<typeof BundleInputSchema>;
export type BlockInput = z.infer<typeof BlockInputSchema>;
export type D365ExportInput = z.infer<typeof D365ExportInputSchema>;

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapReleaseRow(row: ReleaseRow): FactoryReleaseStatus {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    productCode: row.product_code,
    releaseStatus: row.release_status,
    factoryAvailableAt: toIso(row.factory_available_at),
    factoryApprovedBy: row.factory_approved_by,
    releaseEventId: row.release_event_id === null ? null : Number(row.release_event_id),
    activeBomHeaderId: row.active_bom_header_id,
    activeFactorySpecId: row.active_factory_spec_id,
    releaseBlockers: row.release_blockers ?? [],
    requestedBy: row.requested_by,
    requestedAt: toIso(row.requested_at),
  };
}

async function assertProjectBundle(
  client: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[] }> },
  input: BundleInput,
): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `
      select true as ok
      from public.npd_projects project
      join public.product product
        on product.product_code = project.product_code
      join public.bom_headers bom
        on bom.id = $3::uuid
       and bom.org_id = project.org_id
      where project.id = $1::uuid
        and project.product_code = $2
        and product.product_code = $2
        and bom.product_id = $2
        and (bom.npd_project_id is null or bom.npd_project_id = project.id)
      limit 1
    `,
    [input.projectId, input.productCode, input.activeBomHeaderId],
  );
  if (rows.length !== 1) {
    throw new Error('factory release bundle not found for current org');
  }
}

async function insertOutboxEvent(
  client: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[] }> },
  input: {
    orgId: string;
    eventType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    dedupKey?: string;
  },
): Promise<number> {
  const { rows } = await client.query<{ id: number | string }>(
    `
      insert into public.outbox_events
        (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
      values ($1::uuid, $2, 'factory_release_status', $3, $4::jsonb, 't-097', $5)
      on conflict (org_id, dedup_key) where dedup_key is not null
      do nothing
      returning id
    `,
    [
      input.orgId,
      input.eventType,
      input.aggregateId,
      JSON.stringify(input.payload),
      input.dedupKey ?? null,
    ],
  );
  let id = rows[0]?.id;
  if (id === undefined && input.dedupKey) {
    const existing = await client.query<{ id: number | string }>(
      `
        select id
        from public.outbox_events
        where org_id = $1::uuid
          and dedup_key = $2
        limit 1
      `,
      [input.orgId, input.dedupKey],
    );
    id = existing.rows[0]?.id;
  }
  const numericId = typeof id === 'string' ? Number(id) : id;
  if (typeof numericId !== 'number' || !Number.isFinite(numericId)) {
    throw new Error(`failed to emit ${input.eventType}`);
  }
  return numericId;
}

async function fetchReleaseRow(
  client: { query: <T>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[] }> },
  projectId: string,
  productCode: string,
): Promise<FactoryReleaseStatus | null> {
  const { rows } = await client.query<ReleaseRow>(
    `
      select id,
             org_id,
             project_id,
             product_code,
             release_status,
             factory_available_at,
             factory_approved_by,
             release_event_id,
             active_bom_header_id,
             active_factory_spec_id,
             release_blockers,
             requested_by,
             requested_at
      from public.factory_release_status
      where project_id = $1::uuid
        and product_code = $2
    `,
    [projectId, productCode],
  );
  return rows[0] ? mapReleaseRow(rows[0]) : null;
}

export async function getFactoryReleaseStatus(rawInput: z.infer<typeof GetInputSchema>): Promise<FactoryReleaseStatus | null> {
  const input = GetInputSchema.parse(rawInput);
  return withOrgContext(async ({ client }) => fetchReleaseRow(client, input.projectId, input.productCode));
}

export async function requestFactoryRelease(rawInput: BundleInput): Promise<FactoryReleaseStatus> {
  const input = BundleInputSchema.parse(rawInput);

  return withOrgContext(async ({ client, orgId, userId }) => {
    await assertProjectBundle(client, input);

    await insertOutboxEvent(client, {
      orgId,
      eventType: 'npd.project.release_requested',
      aggregateId: input.projectId,
      dedupKey: `t097:${input.projectId}:release-requested`,
      payload: {
        projectId: input.projectId,
        productCode: input.productCode,
        requestedBy: userId,
      },
    });
    const releasedRecordsEventId = await insertOutboxEvent(client, {
      orgId,
      eventType: 'npd.builder.released_records_created',
      aggregateId: input.projectId,
      dedupKey: `t097:${input.projectId}:builder-records:${input.activeBomHeaderId}:${input.activeFactorySpecId}`,
      payload: {
        projectId: input.projectId,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
      },
    });

    const { rows } = await client.query<ReleaseRow>(
      `
        insert into public.factory_release_status
          (org_id, project_id, product_code, release_status, active_bom_header_id, active_factory_spec_id,
           release_blockers, requested_by, requested_at, release_event_id)
        values ($1::uuid, $2::uuid, $3, 'pending_technical_approval', $4::uuid, $5::uuid,
                '[]'::jsonb, $6::uuid, now(), $7)
        on conflict (org_id, project_id, product_code)
        do update set release_status = 'pending_technical_approval',
                      active_bom_header_id = excluded.active_bom_header_id,
                      active_factory_spec_id = excluded.active_factory_spec_id,
                      release_blockers = '[]'::jsonb,
                      requested_by = excluded.requested_by,
                      requested_at = excluded.requested_at,
                      release_event_id = excluded.release_event_id,
                      factory_available_at = null,
                      factory_approved_by = null
        returning id,
                  org_id,
                  project_id,
                  product_code,
                  release_status,
                  factory_available_at,
                  factory_approved_by,
                  release_event_id,
                  active_bom_header_id,
                  active_factory_spec_id,
                  release_blockers,
                  requested_by,
                  requested_at
      `,
      [
        orgId,
        input.projectId,
        input.productCode,
        input.activeBomHeaderId,
        input.activeFactorySpecId,
        userId,
        releasedRecordsEventId,
      ],
    );
    return mapReleaseRow(rows[0] as ReleaseRow);
  });
}

export async function recordTechnicalFactoryApproval(rawInput: BundleInput): Promise<FactoryReleaseStatus> {
  const input = BundleInputSchema.parse(rawInput);

  return withOrgContext(async ({ client, orgId, userId }) => {
    await assertProjectBundle(client, input);

    await insertOutboxEvent(client, {
      orgId,
      eventType: 'technical.factory_spec.approved',
      aggregateId: input.projectId,
      dedupKey: `t097:${input.projectId}:technical-approved:${input.activeBomHeaderId}:${input.activeFactorySpecId}`,
      payload: {
        projectId: input.projectId,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
        approvedBy: userId,
      },
    });
    const releaseEventId = await insertOutboxEvent(client, {
      orgId,
      eventType: 'fg.released_to_factory',
      aggregateId: input.projectId,
      dedupKey: `t097:${input.projectId}:released-to-factory:${input.activeBomHeaderId}:${input.activeFactorySpecId}`,
      payload: {
        projectId: input.projectId,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
        factoryApprovedBy: userId,
      },
    });

    const { rows } = await client.query<ReleaseRow>(
      `
        insert into public.factory_release_status
          (org_id, project_id, product_code, release_status, factory_available_at, factory_approved_by,
           release_event_id, active_bom_header_id, active_factory_spec_id, release_blockers)
        values ($1::uuid, $2::uuid, $3, 'released_to_factory', now(), $4::uuid,
                $5, $6::uuid, $7::uuid, '[]'::jsonb)
        on conflict (org_id, project_id, product_code)
        do update set release_status = 'released_to_factory',
                      factory_available_at = excluded.factory_available_at,
                      factory_approved_by = excluded.factory_approved_by,
                      release_event_id = excluded.release_event_id,
                      active_bom_header_id = excluded.active_bom_header_id,
                      active_factory_spec_id = excluded.active_factory_spec_id,
                      release_blockers = '[]'::jsonb
        returning id,
                  org_id,
                  project_id,
                  product_code,
                  release_status,
                  factory_available_at,
                  factory_approved_by,
                  release_event_id,
                  active_bom_header_id,
                  active_factory_spec_id,
                  release_blockers,
                  requested_by,
                  requested_at
      `,
      [
        orgId,
        input.projectId,
        input.productCode,
        userId,
        releaseEventId,
        input.activeBomHeaderId,
        input.activeFactorySpecId,
      ],
    );
    return mapReleaseRow(rows[0] as ReleaseRow);
  });
}

export async function blockFactoryRelease(rawInput: BlockInput): Promise<FactoryReleaseStatus> {
  const input = BlockInputSchema.parse(rawInput);

  return withOrgContext(async ({ client, orgId }) => {
    await assertProjectBundle(client, input);

    const releaseEventId = await insertOutboxEvent(client, {
      orgId,
      eventType: 'fg.release_blocked',
      aggregateId: input.projectId,
      dedupKey: `t097:${input.projectId}:release-blocked:${input.activeBomHeaderId}:${input.activeFactorySpecId}`,
      payload: {
        projectId: input.projectId,
        productCode: input.productCode,
        activeBomHeaderId: input.activeBomHeaderId,
        activeFactorySpecId: input.activeFactorySpecId,
        blockers: input.blockers,
      },
    });

    const { rows } = await client.query<ReleaseRow>(
      `
        insert into public.factory_release_status
          (org_id, project_id, product_code, release_status, release_event_id, active_bom_header_id,
           active_factory_spec_id, release_blockers, factory_available_at, factory_approved_by)
        values ($1::uuid, $2::uuid, $3, 'blocked', $4, $5::uuid, $6::uuid, $7::jsonb, null, null)
        on conflict (org_id, project_id, product_code)
        do update set release_status = 'blocked',
                      release_event_id = excluded.release_event_id,
                      active_bom_header_id = excluded.active_bom_header_id,
                      active_factory_spec_id = excluded.active_factory_spec_id,
                      release_blockers = excluded.release_blockers,
                      factory_available_at = null,
                      factory_approved_by = null
        returning id,
                  org_id,
                  project_id,
                  product_code,
                  release_status,
                  factory_available_at,
                  factory_approved_by,
                  release_event_id,
                  active_bom_header_id,
                  active_factory_spec_id,
                  release_blockers,
                  requested_by,
                  requested_at
      `,
      [
        orgId,
        input.projectId,
        input.productCode,
        releaseEventId,
        input.activeBomHeaderId,
        input.activeFactorySpecId,
        JSON.stringify(input.blockers),
      ],
    );
    return mapReleaseRow(rows[0] as ReleaseRow);
  });
}

export async function recordD365Export(rawInput: D365ExportInput): Promise<{ ok: true; canonicalStatusChanged: false }> {
  D365ExportInputSchema.parse(rawInput);
  return { ok: true, canonicalStatusChanged: false };
}
