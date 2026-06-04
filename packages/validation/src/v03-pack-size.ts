export type QueryClient = {
  query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type V03PackSizeResult =
  | {
      status: 'PASS';
    }
  | {
      status: 'FAIL';
      message: string;
    };

export type V03PackSizeInput = {
  orgId: string;
  value: string | null | undefined;
};

type PackSizeRow = {
  value: string;
};

export async function validatePackSize(
  db: QueryClient,
  input: V03PackSizeInput,
): Promise<V03PackSizeResult> {
  const value = input.value?.trim() ?? '';

  const result = await db.query<PackSizeRow>(
    `select value
       from "Reference"."PackSizes"
      where org_id = $1
        and value = $2
      limit 1`,
    [input.orgId, value],
  );

  if (result.rows.length > 0) {
    return { status: 'PASS' };
  }

  return {
    status: 'FAIL',
    message: `Unknown pack size: ${value}`,
  };
}
