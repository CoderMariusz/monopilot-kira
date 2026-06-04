export const V08_MANDATORY_FIELDS = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'C9',
  'C10',
  'C11',
  'C12',
  'C13',
] as const;

export const V08_OPTIONAL_FIELDS = ['C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'] as const;

export type V08AuditRow = {
  fieldName: string;
  applied: boolean;
};

export type V08BriefMappingDetail =
  | {
      code: 'MANDATORY_MAPPING_NOT_APPLIED';
      fieldName: string;
    }
  | {
      code: 'OPTIONAL_MAPPING_NOT_APPLIED';
      fieldName: string;
    };

export type V08BriefMappingResult = {
  status: 'PASS' | 'WARN' | 'FAIL';
  details: V08BriefMappingDetail[];
};

export function validateBriefMappingV08(rows: V08AuditRow[]): V08BriefMappingResult {
  const appliedByField = new Map(rows.map((row) => [row.fieldName, row.applied]));

  const missingMandatory = V08_MANDATORY_FIELDS.filter((fieldName) => appliedByField.get(fieldName) !== true);
  if (missingMandatory.length > 0) {
    return {
      status: 'FAIL',
      details: missingMandatory.map((fieldName) => ({
        code: 'MANDATORY_MAPPING_NOT_APPLIED',
        fieldName,
      })),
    };
  }

  const missingOptional = V08_OPTIONAL_FIELDS.filter((fieldName) => appliedByField.get(fieldName) !== true);
  if (missingOptional.length > 0) {
    return {
      status: 'WARN',
      details: missingOptional.map((fieldName) => ({
        code: 'OPTIONAL_MAPPING_NOT_APPLIED',
        fieldName,
      })),
    };
  }

  return { status: 'PASS', details: [] };
}
