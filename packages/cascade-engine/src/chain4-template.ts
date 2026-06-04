import pg from 'pg';

import { getAppConnection } from '@monopilot/db/clients.js';
import { recomputeOperationInTransaction, type HandleOperationChangeResult } from './chain2-operations.js';

export type HandleTemplateChangeOptions = {
  pool?: pg.Pool;
  sessionToken?: string;
  orgId?: string;
};

export type HandleTemplateChangeResult = {
  productCode: string;
  templateName: string;
  affectedCount: number;
  recomputed: HandleOperationChangeResult[];
};

type TemplateRow = {
  operation_1_name: string | null;
  operation_2_name: string | null;
  operation_3_name: string | null;
  operation_4_name: string | null;
};

type ProdDetailIdRow = {
  id: string;
};

let defaultPool: pg.Pool | null = null;

function getDefaultPool(): pg.Pool {
  defaultPool ??= getAppConnection();
  return defaultPool;
}

export class TemplateNotFoundError extends Error {
  constructor(templateName: string) {
    super(`template_not_found:${templateName}`);
    this.name = 'TemplateNotFoundError';
  }
}

async function setOrgContextIfProvided(
  client: pg.PoolClient,
  options: HandleTemplateChangeOptions,
): Promise<void> {
  if (options.sessionToken && options.orgId) {
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
      options.sessionToken,
      options.orgId,
    ]);
  }
}

function templateOperations(template: TemplateRow): [string, string, string, string] {
  const operations = [
    template.operation_1_name,
    template.operation_2_name,
    template.operation_3_name,
    template.operation_4_name,
  ];

  if (operations.some((operation) => !operation || operation.trim().length === 0)) {
    throw new Error('template_operation_missing');
  }

  return operations as [string, string, string, string];
}

async function emitTemplateAppliedEvent(
  client: pg.PoolClient,
  productCode: string,
  templateName: string,
  affectedCount: number,
) {
  await client.query(
    `
      insert into public.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, payload, app_version
      )
      values (app.current_org_id(), 'fa.template_applied', 'fa', $1, $2::jsonb, 't013-chain4')
    `,
    [
      productCode,
      JSON.stringify({
        product_code: productCode,
        template_name: templateName,
        affected_count: affectedCount,
      }),
    ],
  );
}

export async function handleTemplateChange(
  productCode: string,
  newTemplate: string,
  options: HandleTemplateChangeOptions = {},
): Promise<HandleTemplateChangeResult> {
  const pool = options.pool ?? getDefaultPool();
  const client = await pool.connect();

  try {
    await client.query('begin');
    await setOrgContextIfProvided(client, options);

    const template = await client.query<TemplateRow>(
      `
        select operation_1_name, operation_2_name, operation_3_name, operation_4_name
        from "Reference"."Templates"
        where template_name = $1
        limit 1
      `,
      [newTemplate],
    );

    const templateRow = template.rows[0];
    if (!templateRow) {
      throw new TemplateNotFoundError(newTemplate);
    }

    const operations = templateOperations(templateRow);
    const details = await client.query<ProdDetailIdRow>(
      `
        select id::text
        from public.prod_detail
        where product_code = $1
        order by component_index, created_at, id
        for update
      `,
      [productCode],
    );

    const recomputed: HandleOperationChangeResult[] = [];
    for (const detail of details.rows) {
      for (const [index, operation] of operations.entries()) {
        recomputed.push(
          await recomputeOperationInTransaction(client, detail.id, index + 1, operation),
        );
      }
    }

    await emitTemplateAppliedEvent(client, productCode, newTemplate, details.rowCount);
    await client.query('commit');

    return {
      productCode,
      templateName: newTemplate,
      affectedCount: details.rowCount,
      recomputed,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
