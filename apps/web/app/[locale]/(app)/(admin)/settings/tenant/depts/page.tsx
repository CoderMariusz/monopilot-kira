import { getTranslations } from 'next-intl/server';

import { getTenantVariations } from '../../../../../../../actions/tenant/get';
import { setDepartmentOverride } from '../../../../../../../actions/tenant/set-dept';
import DeptTaxonomyScreen, {
  type Department,
  type DeptOverridePayload,
  type DeptSubmitResult,
  type DeptTaxonomyLabels,
  type PageState,
  type SourceColumn,
} from './dept-taxonomy-screen.client';

export const dynamic = 'force-dynamic';

type DeptTaxonomyPageProps = {
  params?: Promise<{ locale: string }>;
  departments?: Department[];
  sourceColumns?: SourceColumn[];
  selectedDeptCode?: string;
  canEdit?: boolean;
  state?: PageState;
  submitDeptOverride?: (payload: DeptOverridePayload) => Promise<DeptSubmitResult>;
};

const DEFAULT_LABELS: DeptTaxonomyLabels = {
  title: 'Department Taxonomy',
  subtitle: 'Customize department structure for your organization. Changes affect column ownership and rule routing.',
  warning: 'Dept changes affect how columns and rules are grouped. Review the impact before saving.',
  currentDeptList: 'Current dept list',
  addCustomDept: '+ Add Custom Dept',
  operations: 'Operations',
  sourceDept: 'Source dept',
  sourceDepts: 'Source depts',
  splitOption: 'Split technical into two departments',
  mergeOption: 'Merge selected depts into one',
  addOption: 'Add new department',
  targetDept1Name: 'Target Dept 1 name',
  targetDept1Code: 'Target Dept 1 code',
  targetDept2Name: 'Target Dept 2 name',
  targetDept2Code: 'Target Dept 2 code',
  targetDeptName: 'Target dept name',
  targetDeptCode: 'Target dept code',
  columnMapping: 'Column mapping',
  saveChanges: 'Save Changes',
  saving: 'Saving…',
  discard: 'Discard',
  code: 'Code',
  namePl: 'Name PL',
  nameEn: 'Name EN',
  displayOrder: 'Display Order',
  loading: 'Loading department taxonomy…',
  empty: 'No departments are configured for this workspace.',
  error: 'Unable to load department taxonomy.',
  permissionDenied: 'You do not have permission to edit tenant department taxonomy.',
  confirmationTitle: 'Confirm department change',
  confirmationBody: 'Saved to tenant_variations.dept_overrides for this organization.',
  settingsBreadcrumb: 'Settings / Tenant config',
  deptListProvenance: 'Baseline departments plus tenant_variations.dept_overrides.',
  assignedColumns: '{count} assigned columns',
  operationType: 'Operation type',
  chooseTargetDept: 'Choose target dept',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof DeptTaxonomyLabels>;
const LABEL_TRANSLATION_KEYS: Partial<Record<keyof DeptTaxonomyLabels, string>> = {
  title: 'dept_taxonomy_title',
};

// Baseline Apex department taxonomy from SET-061; live tenant variations are merged over it at render time.
const BASELINE_DEPARTMENTS: Department[] = [
  { code: 'core', name: 'Core', assignedColumnCount: 12, order: 10, provenance: 'baseline' },
  { code: 'technical', name: 'Technical', assignedColumnCount: 3, order: 20, provenance: 'baseline' },
  { code: 'packaging', name: 'Packaging', assignedColumnCount: 5, order: 30, provenance: 'baseline' },
  { code: 'mrp', name: 'MRP', assignedColumnCount: 8, order: 40, provenance: 'baseline' },
  { code: 'planning', name: 'Planning', assignedColumnCount: 9, order: 50, provenance: 'baseline' },
  { code: 'production', name: 'Production', assignedColumnCount: 14, order: 60, provenance: 'baseline' },
  { code: 'price', name: 'Price', assignedColumnCount: 2, order: 70, provenance: 'baseline' },
];

// Project-shaped fallback source columns until the schema metadata loader supplies live owner_department rows.
const DEFAULT_SOURCE_COLUMNS: SourceColumn[] = [
  { code: 'tech.allergen_statement', label: 'Allergen statement', departmentCode: 'technical' },
  { code: 'tech.lab_release_rule', label: 'Lab release rule', departmentCode: 'technical' },
  { code: 'tech.food_safety_owner', label: 'Food safety owner', departmentCode: 'technical' },
];

async function buildLabels(locale: string): Promise<DeptTaxonomyLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.tenant' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translationKey = LABEL_TRANSLATION_KEYS[key] ?? key;
        const translated = t(translationKey);
        labels[key] = translated === translationKey ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as DeptTaxonomyLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function loadDefaultDepartments(): Promise<{ departments: Department[]; state: PageState }> {
  const result = await getTenantVariations();
  if ('error' in result) {
    return { departments: BASELINE_DEPARTMENTS, state: result.error === 'forbidden' ? 'permission_denied' : 'error' };
  }
  return { departments: mergeTenantDeptOverrides(BASELINE_DEPARTMENTS, result.data.deptOverrides), state: 'ready' };
}

function mergeTenantDeptOverrides(base: Department[], deptOverrides: unknown): Department[] {
  const merged = [...base];
  const addActions = readAddActions(deptOverrides);
  for (const action of addActions) {
    if (merged.some((dept) => dept.code === action.code)) continue;
    merged.push({
      code: action.code,
      name: action.label ?? titleizeCode(action.code),
      assignedColumnCount: 0,
      order: 80 + merged.length,
      provenance: 'tenant_variations.dept_overrides',
    });
  }
  return merged.sort((a, b) => a.order - b.order);
}

function readAddActions(value: unknown): Array<{ code: string; label?: string }> {
  if (!value || typeof value !== 'object') return [];
  const actions = (value as { actions?: unknown }).actions;
  if (!actions || typeof actions !== 'object') return [];
  const add = (actions as { add?: unknown }).add;
  if (!add || typeof add !== 'object') return [];
  return Object.values(add as Record<string, unknown>).flatMap((entry): Array<{ code: string; label?: string }> => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as { code?: unknown; label?: unknown };
    if (typeof row.code !== 'string') return [];
    const label = typeof row.label === 'string' ? row.label : undefined;
    return label ? [{ code: row.code, label }] : [{ code: row.code }];
  });
}

function titleizeCode(code: string): string {
  return code
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function defaultSubmitDeptOverride(payload: DeptOverridePayload): Promise<DeptSubmitResult> {
  'use server';

  const result =
    payload.action === 'add'
      ? await setDepartmentOverride({
          action: 'add',
          newDepartmentCode: payload.code,
          label: payload.nameEn,
          auditReason: `SET-061 add department ${payload.code}`,
        })
      : payload.action === 'merge'
        ? await setDepartmentOverride({
            action: 'merge',
            sourceDepartmentCodes: payload.sources,
            targetDepartmentCode: payload.target,
            auditReason: `SET-061 merge departments into ${payload.target}`,
          })
        : await setDepartmentOverride({
            action: 'split',
            departmentCode: payload.source,
            targetDepartmentCodes: payload.targets,
            auditReason: `SET-061 split department ${payload.source}`,
          });

  if (!result.ok) return result;
  return { ok: true, data: { storage: 'tenant_variations.dept_overrides', deptOverrides: result.data.deptOverrides } };
}

export default async function DeptTaxonomyPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as DeptTaxonomyPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const loaded = props.departments ? { departments: props.departments, state: props.state ?? 'ready' } : await loadDefaultDepartments();

  return (
    <DeptTaxonomyScreen
      labels={labels}
      departments={loaded.departments}
      sourceColumns={props.sourceColumns ?? DEFAULT_SOURCE_COLUMNS}
      selectedDeptCode={props.selectedDeptCode ?? 'technical'}
      canEdit={props.canEdit ?? loaded.state !== 'permission_denied'}
      state={props.state ?? loaded.state}
      submitDeptOverrideAction={props.submitDeptOverride ?? defaultSubmitDeptOverride}
    />
  );
}
