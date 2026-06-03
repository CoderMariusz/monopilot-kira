import pg from 'pg';

const { Pool } = pg;

const apexOrgId = '00000000-0000-0000-0000-000000000002';

export const apexD365Constants = [
  ['PRODUCTIONSITEID', 'FNOR', 'Apex Production Site'],
  ['APPROVERPERSONNELNUMBER', 'APX100048', 'Approver ID (Jane or default)'],
  ['CONSUMPTIONWAREHOUSEID', 'ApexDG', 'Warehouse code'],
  ['PRODUCTGROUPID_FG', 'FinGoods', 'Finished Goods group'],
  ['PRODUCTGROUPID_PR', null, 'PR intermediates group; TBD until configured'],
  [
    'COSTINGOPERATIONRESOURCEID_DEFAULT',
    'APXProd01',
    'Default resource (override per Line in Phase C)',
  ],
  ['FLUSHINGPRINCIPLE', 'Finish', 'Materials consumed at Finish'],
  ['LINETYPE', 'Item', 'Default line type'],
  ['CONSUMPTIONTYPE', 'Variable', 'Default consumption type'],
  ['CONSUMPTIONCALCULATIONFORMULA', 'Formula0', 'Default consumption calculation formula'],
  ['OPERATIONPRIORITY', 'Primary', 'Default operation priority'],
  [
    'NEXTOPERATIONLINKTYPE_TERMINAL',
    'None',
    'Terminal operation link type for final operation',
  ],
] as const;

export async function seedD365ConstantsApex(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const values = apexD365Constants.map(([key, value, description]) => [
      apexOrgId,
      key,
      value,
      description,
      'LEGACY-D365;APEX-CONFIG',
      1,
    ]);

    await pool.query(
      `
        insert into "Reference"."D365_Constants" (
          org_id,
          constant_key,
          constant_value,
          description,
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
        on conflict (org_id, constant_key) do nothing
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
  await seedD365ConstantsApex(connectionString);
}
