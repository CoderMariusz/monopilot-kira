import { createElement as h } from 'react';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import SchemaBrowserScreen, {
  type SchemaBrowserLabels,
  type SchemaColumnRow,
  type SchemaState,
  type Tier,
  type UserRole,
} from './schema-browser-screen.client';

export const dynamic = 'force-dynamic';

type PageSearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
};
type HarnessProps = PageProps & {
  columns?: SchemaColumnRow[];
  state?: SchemaState;
  userRole?: UserRole;
  openModal?: (modalId: 'schemaView' | 'promoteToL2', payload?: { col: SchemaColumnRow }) => void;
  onEditColumn?: (columnCode: string) => void;
};
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
type SchemaReadResult = { columns: SchemaColumnRow[]; userRole: UserRole };
type RoleRow = { is_admin: boolean };
type SchemaDbRow = {
  column_code: string;
  label: string | null;
  table_code: string;
  dept_code: string | null;
  data_type: string;
  tier: string;
  storage: string;
  required_for_done: boolean;
  status: string;
  schema_version: number;
};

const DEFAULT_LABELS: SchemaBrowserLabels = {
  title: 'Schema browser',
  subtitle: 'Read-only inspector for all column definitions, across L1/L2/L3 tiers.',
  exportSchemaCsv: 'Export schema CSV',
  promotionNotice:
    'Columns scoped L1 are read-only here — raise an L1 tier-promotion request via the schema promotion wizard (SM-05). L2/L3 columns can be edited.',
  promotionWizard: 'schema promotion wizard (SM-05)',
  tableFilter: 'Table',
  tierFilter: 'Tier',
  allTables: 'All tables',
  allTiers: 'All tiers',
  searchColumns: 'Search column code or label…',
  columnCount: '{count} columns',
  columnDefinitions: 'Column definitions',
  columnCode: 'Column code',
  label: 'Label',
  table: 'Table',
  dept: 'Dept',
  type: 'Type',
  tier: 'Tier',
  storage: 'Storage',
  required: 'Req',
  status: 'Status',
  version: 'v',
  actions: 'Actions',
  view: 'View →',
  edit: 'Edit →',
  loading: 'Loading schema columns…',
  empty: 'No schema columns found.',
  error: 'Unable to load schema columns.',
  usePromotionRequest: 'Use Promotion Request',
  close: 'Close',
};

const FALLBACK_COLUMNS: SchemaColumnRow[] = [
  {
    col: 'reference_schema_id',
    label: 'Reference schema identifier',
    table: 'reference_schemas',
    dept: 'Settings',
    type: 'uuid',
    tier: 'L1',
    storage: 'Postgres uuid',
    req: true,
    status: 'active',
    version: 1,
  },
];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function searchParams(raw: PageSearchParams | undefined): Record<string, string | undefined> {
  return { table: one(raw?.table), tier: one(raw?.tier), search: one(raw?.search) };
}

function tier(value: string): Tier {
  return value === 'L1' || value === 'L2' || value === 'L3' || value === 'L4' ? value : 'L3';
}

function status(value: string): SchemaColumnRow['status'] {
  return value === 'draft' || value === 'deprecated' ? value : 'active';
}

function titleize(code: string) {
  return code
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

async function labels(locale: string): Promise<SchemaBrowserLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.schema_browser' });
    return (Object.keys(DEFAULT_LABELS) as Array<keyof SchemaBrowserLabels>).reduce((acc, key) => {
      try {
        acc[key] = t(key);
      } catch {
        acc[key] = DEFAULT_LABELS[key];
      }
      return acc;
    }, { ...DEFAULT_LABELS });
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function readSchemaData(): Promise<SchemaReadResult> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;
    const [schemaResult, roleResult] = await Promise.all([
      queryClient.query<SchemaDbRow>(
        `select rs.column_code,
                coalesce(rs.presentation_json->>'label', rs.column_code) as label,
                rs.table_code,
                rs.dept_code,
                rs.data_type,
                rs.tier,
                rs.storage,
                rs.required_for_done,
                case when rs.deprecated_at is not null then 'deprecated' else 'active' end as status,
                rs.schema_version
           from public.reference_schemas rs
          order by rs.table_code asc, rs.column_code asc`,
      ),
      queryClient.query<RoleRow>(
        `select exists (
            select 1
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
              left join public.role_permissions rp on rp.role_id = r.id
             where ur.user_id = $1::uuid
               and ur.org_id = $2::uuid
               and (
                 lower(r.code) in ('owner', 'admin', 'org_admin')
                 or rp.permission in ('settings.schema.admin', 'settings.schema.edit', 'settings.schema.manage')
                 or coalesce(r.permissions, '[]'::jsonb) ?| array['settings.schema.admin', 'settings.schema.edit', 'settings.schema.manage']
               )
          ) as is_admin`,
        [userId, orgId],
      ),
    ]);

    return {
      userRole: roleResult.rows[0]?.is_admin ? 'Admin' : 'Operator',
      columns: schemaResult.rows.map((row) => ({
        col: row.column_code,
        label: row.label && row.label !== row.column_code ? row.label : titleize(row.column_code),
        table: row.table_code,
        dept: row.dept_code ?? 'Settings',
        type: row.data_type,
        tier: tier(row.tier),
        storage: row.storage,
        req: row.required_for_done,
        status: status(row.status),
        version: row.schema_version,
      })),
    };
  });
}

export default async function SchemaBrowserPage(props: PageProps) {
  const harness = props as HarnessProps;
  const { locale = 'en' } = props.params ? await props.params : { locale: 'en' };
  const query = searchParams(props.searchParams ? await props.searchParams : {});
  const text = await labels(locale);
  let resolvedState = harness.state ?? 'ready';
  let resolvedColumns = harness.columns;
  let resolvedUserRole = harness.userRole;

  if (!resolvedColumns && resolvedState === 'ready') {
    try {
      const data = await readSchemaData();
      resolvedColumns = data.columns;
      resolvedUserRole = data.userRole;
      if (resolvedColumns.length === 0) resolvedState = 'empty';
    } catch {
      resolvedColumns = FALLBACK_COLUMNS;
      resolvedUserRole = 'Viewer';
      resolvedState = 'error';
    }
  }

  return h(SchemaBrowserScreen, {
    labels: text,
    columns: resolvedColumns ?? [],
    initialSearchParams: query,
    state: resolvedState,
    userRole: resolvedUserRole ?? 'Viewer',
    openModal: harness.openModal,
    onEditColumn: harness.onEditColumn,
  });
}
