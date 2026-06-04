import pg from 'pg';

import { getAppConnection } from '@monopilot/db/clients.js';
import { validateSuffixMatchV06, type V06SuffixMatchResult } from '@monopilot/validation';

export type OperationIndex = 1 | 2 | 3 | 4;

export type HandleOperationChangeOptions = {
  pool?: pg.Pool;
  sessionToken?: string;
  orgId?: string;
};

export type HandleOperationChangeResult = {
  prodDetailId: string;
  operationIndex: OperationIndex;
  intermediateCodeP: string;
  intermediateCodeFinal: string | null;
  validations: V06SuffixMatchResult[];
};

type ProdDetailRow = {
  id: string;
  recipe_components: string | null;
  intermediate_code_p1: string | null;
  intermediate_code_p2: string | null;
  intermediate_code_p3: string | null;
  intermediate_code_p4: string | null;
};

type OperationRow = {
  process_suffix: string;
};

const operationColumns = {
  1: {
    operation: 'manufacturing_operation_1',
    intermediate: 'intermediate_code_p1',
  },
  2: {
    operation: 'manufacturing_operation_2',
    intermediate: 'intermediate_code_p2',
  },
  3: {
    operation: 'manufacturing_operation_3',
    intermediate: 'intermediate_code_p3',
  },
  4: {
    operation: 'manufacturing_operation_4',
    intermediate: 'intermediate_code_p4',
  },
} as const satisfies Record<OperationIndex, { operation: string; intermediate: string }>;

let defaultPool: pg.Pool | null = null;
let counter = 0;

function getDefaultPool(): pg.Pool {
  defaultPool ??= getAppConnection();
  return defaultPool;
}

function assertOperationIndex(n: number): asserts n is OperationIndex {
  if (![1, 2, 3, 4].includes(n)) {
    throw new Error(`invalid_operation_index:${n}`);
  }
}

function nextSeq7(): string {
  counter = (counter + 1) % 10_000_000;
  const seed = (Date.now() * 1000 + counter) % 10_000_000;
  return String(seed).padStart(7, '0');
}

function extractProcessSuffix(code: string | null): string | null {
  const parts = code?.split('-') ?? [];
  if (parts.length < 3 || parts[0] !== 'WIP') return null;
  return parts[1] || null;
}

function composeFinalCode(row: ProdDetailRow): string | null {
  const suffixes = [
    extractProcessSuffix(row.intermediate_code_p1),
    extractProcessSuffix(row.intermediate_code_p2),
    extractProcessSuffix(row.intermediate_code_p3),
    extractProcessSuffix(row.intermediate_code_p4),
  ];

  if (suffixes.some((suffix) => !suffix)) {
    return null;
  }

  return `WIP-${suffixes.join('-')}-${nextSeq7()}`;
}

async function setOrgContextIfProvided(
  client: pg.PoolClient,
  options: HandleOperationChangeOptions,
): Promise<void> {
  if (options.sessionToken && options.orgId) {
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
      options.sessionToken,
      options.orgId,
    ]);
  }
}

export async function handleOperationChange(
  prodDetailId: string,
  n: number,
  newOpName: string,
  options: HandleOperationChangeOptions = {},
): Promise<HandleOperationChangeResult> {
  assertOperationIndex(n);

  const pool = options.pool ?? getDefaultPool();
  const client = await pool.connect();

  try {
    await client.query('begin');
    await setOrgContextIfProvided(client, options);
    const result = await recomputeOperationInTransaction(client, prodDetailId, n, newOpName);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recomputeOperationInTransaction(
  client: pg.PoolClient,
  prodDetailId: string,
  n: number,
  newOpName: string,
): Promise<HandleOperationChangeResult> {
  assertOperationIndex(n);

  const columns = operationColumns[n];
  const operation = await client.query<OperationRow>(
    `select process_suffix
       from "Reference"."ManufacturingOperations"
      where operation_name = $1
        and is_active = true
      order by operation_seq asc
      limit 1`,
    [newOpName],
  );

  const processSuffix = operation.rows[0]?.process_suffix;
  if (!processSuffix) {
    throw new Error('operation_not_found');
  }

  const intermediateCodeP = `WIP-${processSuffix}-${nextSeq7()}`;
  const updated = await client.query<ProdDetailRow>(
    `update public.prod_detail detail
        set ${columns.operation} = $2,
            ${columns.intermediate} = $3
       from public.product product
      where detail.id = $1::uuid
        and product.product_code = detail.product_code
      returning detail.id::text,
                product.recipe_components,
                detail.intermediate_code_p1,
                detail.intermediate_code_p2,
                detail.intermediate_code_p3,
                detail.intermediate_code_p4`,
    [prodDetailId, newOpName, intermediateCodeP],
  );

  const row = updated.rows[0];
  if (!row) {
    throw new Error('prod_detail_not_found');
  }

  const intermediateCodeFinal = composeFinalCode(row);
  if (intermediateCodeFinal) {
    await client.query(
      `update public.prod_detail
          set intermediate_code_final = $2
        where id = $1::uuid`,
      [prodDetailId, intermediateCodeFinal],
    );
  }

  const v06 = validateSuffixMatchV06({
    recipeComponents: row.recipe_components,
    intermediateCodeFinal,
  });

  return {
    prodDetailId,
    operationIndex: n,
    intermediateCodeP,
    intermediateCodeFinal,
    validations: v06.status === 'WARN' ? [v06] : [],
  };
}
