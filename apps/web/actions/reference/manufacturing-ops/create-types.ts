type IndustryCode = 'bakery' | 'pharma' | 'fmcg' | 'generic' | 'custom';

export type ManufacturingOperation = {
  id: string;
  org_id: string;
  operation_name: string;
  process_suffix: string;
  description: string | null;
  operation_seq: number;
  industry_code: IndustryCode;
  is_active: boolean;
  marker: 'ORG-CONFIG';
  created_at?: string;
};

export type CreateManufacturingOperationResult =
  | { ok: true; data: ManufacturingOperation }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'duplicate_operation_name'
        | 'duplicate_process_suffix'
        | 'already_exists'
        | 'persistence_failed';
    };
