'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type SchemaRow = {
  id: string;
  table_code: string;
  column_code: string;
  data_type: string;
  tier: string;
  storage: string;
  dropdown_source?: string | null;
  validation_json?: Record<string, unknown> | null;
  presentation_json?: Record<string, unknown> | null;
  schema_version: number | string;
  deprecated_at?: string | null;
};

type EditColumnInput = {
  tableCode?: unknown;
  columnCode?: unknown;
  expectedSchemaVersion?: unknown;
  patch?: unknown;
};

type ParsedEditColumnInput = {
  tableCode: string;
  columnCode: string;
  expectedSchemaVersion: number;
  patch: {
    dataType?: string;
    dropdownSource?: string | null;
    validationJson?: Record<string, unknown>;
    presentationJson?: Record<string, unknown>;
  };
};

export type EditColumnResult =
  | { ok: true; data: { tableCode: string; columnCode: string; schemaVersion: number } }
  | {
      ok: false;
      error: 'INVALID_INPUT' | 'DROPDOWN_SOURCE_FK_VIOLATION' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONCURRENT_EDIT' | 'PERSISTENCE_FAILED';
      data?: { currentSchemaVersion: number; diff: Record<string, unknown> };
    };

const FORBIDDEN = 'forbidden' as const;
const ALLOWED_DATA_TYPES = new Set(['text', 'number', 'date', 'enum', 'formula', 'relation']);
const CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;

export async function editColumn(rawInput: EditColumnInput): Promise<EditColumnResult> {
  const input = parseEditColumnInput(rawInput);
  if (!input) return { ok: false, error: 'INVALID_INPUT' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requireSchemaEditor({ client, userId, orgId });

      const existing = await findSchemaColumn({ client, tableCode: input.tableCode, columnCode: input.columnCode });
      if (!existing) return { ok: false, error: 'NOT_FOUND' };

      const currentVersion = Number(existing.schema_version);
      if (currentVersion !== input.expectedSchemaVersion) {
        return {
          ok: false,
          error: 'CONCURRENT_EDIT',
          data: {
            currentSchemaVersion: currentVersion,
            diff: conflictDiff(existing, input.patch),
          },
        };
      }

      const nextDataType = input.patch.dataType ?? existing.data_type;
      const nextDropdownSource = input.patch.dropdownSource !== undefined ? input.patch.dropdownSource : (existing.dropdown_source ?? null);
      if ((nextDataType === 'enum' || nextDataType === 'relation') && !nextDropdownSource) {
        return { ok: false, error: 'DROPDOWN_SOURCE_FK_VIOLATION' };
      }
      if (nextDropdownSource) {
        const sourceExists = await referenceTableExists({ client, tableCode: nextDropdownSource });
        if (!sourceExists) return { ok: false, error: 'DROPDOWN_SOURCE_FK_VIOLATION' };
      }

      const updated = await client.query<{ schema_version: number | string }>(
        `update public.reference_schemas
            set data_type = $3,
                dropdown_source = $4,
                validation_json = coalesce($5::jsonb, validation_json),
                presentation_json = coalesce($6::jsonb, presentation_json),
                schema_version = schema_version + 1
          where org_id = app.current_org_id()
            and table_code = $1
            and column_code = $2
            and schema_version = $7
        returning schema_version`,
        [
          input.tableCode,
          input.columnCode,
          nextDataType,
          nextDropdownSource,
          input.patch.validationJson === undefined ? null : JSON.stringify(input.patch.validationJson),
          input.patch.presentationJson === undefined ? null : JSON.stringify(input.patch.presentationJson),
          input.expectedSchemaVersion,
        ],
      );

      // 0 rows updated means the optimistic `schema_version = $7` guard did not
      // match — a concurrent edit bumped the version between our read and write.
      // Surface it as a conflict instead of fabricating `currentVersion + 1` and
      // reporting a write that never landed.
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        return {
          ok: false,
          error: 'CONCURRENT_EDIT',
          data: {
            currentSchemaVersion: currentVersion,
            diff: conflictDiff(existing, input.patch),
          },
        };
      }

      const nextVersion = Number(updatedRow.schema_version);
      revalidatePath('/settings/schema');
      return { ok: true, data: { tableCode: input.tableCode, columnCode: input.columnCode, schemaVersion: nextVersion } };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'FORBIDDEN' };
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
}

function parseEditColumnInput(input: EditColumnInput | null | undefined): ParsedEditColumnInput | null {
  if (!input || typeof input !== 'object') return null;
  const tableCode = normalizeCode(input.tableCode);
  const columnCode = normalizeCode(input.columnCode);
  const expectedSchemaVersion = integerOrNull(input.expectedSchemaVersion);
  if (!tableCode || !columnCode || expectedSchemaVersion === null || !input.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) {
    return null;
  }

  const patchInput = input.patch as Record<string, unknown>;
  const patch: ParsedEditColumnInput['patch'] = {};
  if (patchInput.dataType !== undefined) {
    const dataType = typeof patchInput.dataType === 'string' ? patchInput.dataType.trim().toLowerCase() : '';
    if (!ALLOWED_DATA_TYPES.has(dataType)) return null;
    patch.dataType = dataType;
  }
  if (patchInput.dropdownSource !== undefined) patch.dropdownSource = normalizeCode(patchInput.dropdownSource);
  if (patchInput.validationJson !== undefined) {
    const validationJson = plainObject(patchInput.validationJson);
    if (!validationJson) return null;
    patch.validationJson = validationJson;
  }
  if (patchInput.presentationJson !== undefined) {
    const presentationJson = plainObject(patchInput.presentationJson);
    if (!presentationJson) return null;
    patch.presentationJson = presentationJson;
  }
  if (Object.keys(patch).length === 0) return null;

  return { tableCode, columnCode, expectedSchemaVersion, patch };
}

async function requireSchemaEditor({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.permissions ? $3
          or r.code = any($4::text[])
          or r.slug = any($4::text[])
        )
      limit 1`,
    [userId, orgId, 'settings.schema.edit', ['owner', 'admin', 'org_admin']],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function findSchemaColumn({ client, tableCode, columnCode }: { client: QueryClient; tableCode: string; columnCode: string }): Promise<SchemaRow | null> {
  const { rows } = await client.query<SchemaRow>(
    `select id, table_code, column_code, data_type, tier, storage, dropdown_source,
            validation_json, presentation_json, schema_version, deprecated_at
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and column_code = $2
      limit 1`,
    [tableCode, columnCode],
  );
  return rows[0] ?? null;
}

async function referenceTableExists({ client, tableCode }: { client: QueryClient; tableCode: string }): Promise<boolean> {
  const { rows } = await client.query<{ table_code: string }>(
    `select table_code
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and is_active = true
      limit 1`,
    [tableCode],
  );
  return rows.length > 0;
}

function conflictDiff(existing: SchemaRow, patch: ParsedEditColumnInput['patch']): Record<string, unknown> {
  return {
    expectedSchemaVersion: 'stale',
    current: {
      dataType: existing.data_type,
      dropdownSource: existing.dropdown_source ?? null,
      validationJson: existing.validation_json ?? {},
      presentationJson: existing.presentation_json ?? {},
      deprecatedAt: existing.deprecated_at ?? null,
    },
    attemptedPatch: patch,
  };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

function integerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
