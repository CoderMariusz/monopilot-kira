import pg from 'pg';

const { Pool } = pg;

const apexOrgId = '00000000-0000-0000-0000-000000000002';

export const apexBriefFieldMappings = [
  ['C1', 'fa.product_name', '1:1', 'UNIVERSAL'],
  ['C2', 'fa.volume', '1:1', 'EVOLVING;APEX-CONFIG'],
  ['C3', 'fa.dev_code', '1:1', 'UNIVERSAL'],
  [
    'C4',
    'prod_detail.manufacturing_operation_1..4 + recipe_components',
    "Per-component per Reference.Templates + org's Reference.ManufacturingOperations",
    'ORG-CONFIG',
  ],
  ['C5', 'prod_detail.slice_count', 'Per-component', 'EVOLVING'],
  ['C6', 'fa.supplier / prod_detail.supplier', 'TBD Phase B.2 start', 'EVOLVING'],
  ['C7', 'fa.ingredient_codes', 'RM + digits from brief.code', 'APEX-CONFIG'],
  ['C8', 'fa.price_brief', 'TEXT or NUMERIC', 'EVOLVING'],
  ['C9', 'fa.weights + prod_detail.component_weight', '1:1', 'EVOLVING'],
  ['C10', 'fa.primary_ingredient_pct', '1:1', 'APEX-CONFIG'],
  ['C11', 'fa.packs_per_case', '1:1', 'EVOLVING'],
  ['C12', 'fa.comments', '1:1', 'EVOLVING'],
  ['C13', 'fa.benchmark', '1:1', 'EVOLVING'],
  ['C14', 'fa.box / fa.mrp_box context', 'Partial mapping', 'APEX-CONFIG'],
  ['C15', 'fa.mrp_cartons / pallet', 'Partial', 'APEX-CONFIG'],
  ['C16', 'fa.web', '1:1', 'APEX-CONFIG'],
  ['C17', 'MRP or Procurement field', 'NEW', 'EVOLVING'],
  ['C18', 'MRP metadata', 'NEW', 'EVOLVING'],
  ['C19', 'fa.mrp_sleeves / fa.mrp_cartons', '1:1', 'APEX-CONFIG'],
  ['C20', 'Procurement-related field', 'NEW', 'EVOLVING'],
] as const;

export async function seedBriefFieldMappingApex(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const values = apexBriefFieldMappings.map(([briefCol, faTarget, transform, marker]) => [
      apexOrgId,
      briefCol,
      faTarget,
      transform,
      marker,
      1,
    ]);

    await pool.query(
      `
        insert into "Reference"."BriefFieldMapping" (
          org_id,
          brief_col,
          fa_target,
          transform,
          marker,
          schema_version
        )
        select *
        from unnest(
          $1::uuid[],
          $2::text[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::integer[]
        )
        on conflict (org_id, brief_col) do nothing
      `,
      [
        values.map((row) => row[0]),
        values.map((row) => row[1]),
        values.map((row) => row[2]),
        values.map((row) => row[3]),
        values.map((row) => row[4]),
        values.map((row) => row[5]),
      ],
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_OWNER or DATABASE_URL is required');
  }
  await seedBriefFieldMappingApex(connectionString);
}
