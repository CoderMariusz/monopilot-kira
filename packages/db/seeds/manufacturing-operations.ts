export type ManufacturingIndustryCode = 'bakery' | 'pharma' | 'fmcg';

export type ManufacturingOperationSeed = {
  operationName: string;
  processSuffix: string;
  description: string;
  operationSeq: number;
};

export type ManufacturingOperationsSeedDb = {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

export const manufacturingOperationSeeds = {
  bakery: [
    {
      operationName: 'Mix',
      processSuffix: 'MX',
      description: 'Ingredient mixing stage',
      operationSeq: 1,
    },
    {
      operationName: 'Knead',
      processSuffix: 'KN',
      description: 'Dough kneading stage',
      operationSeq: 2,
    },
    {
      operationName: 'Proof',
      processSuffix: 'PR',
      description: 'Dough proofing / fermentation',
      operationSeq: 3,
    },
    {
      operationName: 'Bake',
      processSuffix: 'BK',
      description: 'Oven baking stage',
      operationSeq: 4,
    },
  ],
  pharma: [
    {
      operationName: 'Synthesis',
      processSuffix: 'SY',
      description: 'API synthesis reaction',
      operationSeq: 1,
    },
    {
      operationName: 'Separation',
      processSuffix: 'SE',
      description: 'Phase separation / extraction',
      operationSeq: 2,
    },
    {
      operationName: 'Crystallization',
      processSuffix: 'CZ',
      description: 'Crystallization and filtration',
      operationSeq: 3,
    },
    {
      operationName: 'Drying',
      processSuffix: 'DR',
      description: 'Final drying and sizing',
      operationSeq: 4,
    },
  ],
  fmcg: [
    {
      operationName: 'Mix',
      processSuffix: 'MX',
      description: 'Blending and mixing',
      operationSeq: 1,
    },
    {
      operationName: 'Fill',
      processSuffix: 'FL',
      description: 'Container filling',
      operationSeq: 2,
    },
    {
      operationName: 'Seal',
      processSuffix: 'SL',
      description: 'Container sealing / capping',
      operationSeq: 3,
    },
    {
      operationName: 'Label',
      processSuffix: 'LB',
      description: 'Label application',
      operationSeq: 4,
    },
  ],
} as const satisfies Record<ManufacturingIndustryCode, readonly ManufacturingOperationSeed[]>;

export async function seedManufacturingOperations(
  db: ManufacturingOperationsSeedDb,
  params: { orgId: string; industryCode: ManufacturingIndustryCode },
): Promise<void> {
  const seeds = manufacturingOperationSeeds[params.industryCode];

  for (const seed of seeds) {
    await db.query(
      `
        insert into "Reference"."ManufacturingOperations"
          (org_id, operation_name, process_suffix, description, operation_seq,
           industry_code, is_active, marker)
        values ($1, $2, $3, $4, $5, $6, true, 'APEX-CONFIG')
        on conflict (org_id, operation_name) do update
          set process_suffix = excluded.process_suffix,
              description = excluded.description,
              operation_seq = excluded.operation_seq,
              industry_code = excluded.industry_code,
              is_active = true,
              marker = 'APEX-CONFIG'
      `,
      [
        params.orgId,
        seed.operationName,
        seed.processSuffix,
        seed.description,
        seed.operationSeq,
        params.industryCode,
      ],
    );
  }
}
