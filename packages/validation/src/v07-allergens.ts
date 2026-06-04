import type { QueryClient } from './v03-pack-size.js';

export type V07AllergensInput = {
  orgId: string;
  productCode: string;
};

export type V07AllergensDetail =
  | {
      code: 'CASCADE_MISSING';
      productCode: string;
    }
  | {
      code: 'OVERRIDE_REASON_TOO_SHORT';
      id: string;
      productCode: string;
      allergenCode: string;
      reasonLength: number;
    };

export type V07AllergensResult =
  | {
      status: 'PASS';
    }
  | {
      status: 'WARN';
      details: V07AllergensDetail[];
    };

type CascadeRow = {
  product_code: string;
};

type InvalidOverrideRow = {
  id: string;
  product_code: string;
  allergen_code: string;
  reason_length: number | string;
};

export async function validateAllergensV07(
  db: QueryClient,
  input: V07AllergensInput,
): Promise<V07AllergensResult> {
  const cascade = await db.query<CascadeRow>(
    `select product_code
       from public.fa_allergen_cascade
      where org_id = $1::uuid
        and product_code = $2
      limit 1`,
    [input.orgId, input.productCode],
  );

  if (cascade.rows.length === 0) {
    return {
      status: 'WARN',
      details: [{ code: 'CASCADE_MISSING', productCode: input.productCode }],
    };
  }

  const invalidOverrides = await db.query<InvalidOverrideRow>(
    `select id::text,
            product_code,
            allergen_code,
            length(coalesce(reason, '')) as reason_length
       from public.fa_allergen_overrides
      where org_id = $1::uuid
        and product_code = $2
        and length(coalesce(reason, '')) < 10
      order by created_at asc, id asc`,
    [input.orgId, input.productCode],
  );

  if (invalidOverrides.rows.length === 0) {
    return { status: 'PASS' };
  }

  return {
    status: 'WARN',
    details: invalidOverrides.rows.map((row) => ({
      code: 'OVERRIDE_REASON_TOO_SHORT',
      id: row.id,
      productCode: row.product_code,
      allergenCode: row.allergen_code,
      reasonLength: Number(row.reason_length),
    })),
  };
}
