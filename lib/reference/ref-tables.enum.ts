export const RefTables = {
  DeptColumns: 'Reference.DeptColumns',
  FieldTypes: 'Reference.FieldTypes',
  Formulas: 'Reference.Formulas',
  Rules: 'Reference.Rules',
  Departments: 'Reference.Departments',
  DeptOverrides: 'Reference.DeptOverrides',
  ManufacturingOperations: 'Reference.ManufacturingOperations',
  CodePrefixes: 'Reference.CodePrefixes',
} as const;

export type RefTableName = (typeof RefTables)[keyof typeof RefTables];

export const ALL_REFERENCE_TABLES = Object.values(RefTables) as readonly RefTableName[];

const canonicalRefTables = new Set<string>(ALL_REFERENCE_TABLES);

export function isRefTableName(input: unknown): input is RefTableName {
  return typeof input === 'string' && canonicalRefTables.has(input);
}

export function assertRefTableName(input: unknown): asserts input is RefTableName {
  if (!isRefTableName(input)) {
    throw new Error(`Not a valid RefTableName: ${JSON.stringify(input)}`);
  }
}
