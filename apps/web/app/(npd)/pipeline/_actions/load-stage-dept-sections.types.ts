export const STAGE_DEPT_SECTIONS_READ_PERMISSION = 'npd.fa.read';

export type StageDeptField = {
  code: string;
  label: string;
  dataType: 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'dropdown' | 'formula' | 'json';
  required: boolean;
  deptCode: string;
  displayOrder: number;
  value: unknown;
  readOnly: boolean;
  auto?: boolean;
  autoSourceField?: string;
  dropdownOptions?: string[];
};

export type StageDeptSection = {
  key: string;
  label: string;
  deptCode: string;
  /** PascalCase dept value for closeDeptSection (e.g. Core, MRP). */
  closeDeptValue: string;
  readOnly: boolean;
  no_fg_linked?: true;
  /** True when every required field in this section has a value (or none are required). */
  allRequiredFilled?: boolean;
  fields: StageDeptField[];
};

export type StageDeptSectionsResult = {
  ok: true;
  projectId: string;
  stage: string;
  productCode: string | null;
  no_fg_linked?: true;
  sections: StageDeptSection[];
};

export type StageRequiredFieldsStatus = {
  requiredTotal: number;
  requiredFilled: number;
  missing: Array<{ deptCode: string; fieldCode: string; label: string }>;
};
