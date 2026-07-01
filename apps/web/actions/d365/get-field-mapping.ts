'use server';

import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import {
  D365_FIELD_MAPPING_MANIFEST,
  D365_FIELD_MAPPING_TABLE_CODE,
  type D365FieldMappingRow,
  type D365MappingDirection,
} from './field-mapping-manifest';

const VIEW_PERMISSION = 'settings.d365.view';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

type ReferenceRow = { row_key: string; row_data: Record<string, unknown> };

export type GetD365FieldMappingResult =
  | { ok: true; data: D365FieldMappingRow[]; source: 'reference_tables' | 'manifest' }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

const DIRECTIONS: readonly D365MappingDirection[] = ['incoming', 'outgoing', 'both'];

function coerceRow(rowData: Record<string, unknown>): D365FieldMappingRow | null {
  const d365_field = typeof rowData.d365_field === 'string' ? rowData.d365_field : null;
  const monopilot_field = typeof rowData.monopilot_field === 'string' ? rowData.monopilot_field : null;
  const direction = DIRECTIONS.includes(rowData.direction as D365MappingDirection)
    ? (rowData.direction as D365MappingDirection)
    : null;
  if (!d365_field || !monopilot_field || !direction) return null;
  return {
    d365_field,
    direction,
    monopilot_field,
    type: typeof rowData.type === 'string' ? rowData.type : 'text',
    transform: typeof rowData.transform === 'string' ? rowData.transform : 'none',
    unmapped: rowData.unmapped === true,
  };
}

/**
 * Reads the org's D365 field mapping. Per-org override rows live in
 * reference_tables (table_code `d365_field_mapping`); when none exist the
 * CI/CD-deployed manifest is the source of truth. RLS-scoped via withOrgContext.
 */
export async function getD365FieldMapping(): Promise<GetD365FieldMappingResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<GetD365FieldMappingResult> => {
      const allowed = await hasPermission({ userId, orgId, client }, VIEW_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<ReferenceRow>(
        `select row_key, row_data
           from public.reference_tables
          where org_id = app.current_org_id()
            and table_code = $1
            and is_active = true
          order by display_order, row_key`,
        [D365_FIELD_MAPPING_TABLE_CODE],
      );

      const overrides = rows.map((row) => coerceRow(row.row_data)).filter((row): row is D365FieldMappingRow => row !== null);
      if (overrides.length > 0) return { ok: true, data: overrides, source: 'reference_tables' };
      return { ok: true, data: [...D365_FIELD_MAPPING_MANIFEST], source: 'manifest' };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
