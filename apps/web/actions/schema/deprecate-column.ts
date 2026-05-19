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
  schema_version: number | string;
  deprecated_at?: string | null;
};

type DeprecateColumnInput = {
  tableCode?: unknown;
  columnCode?: unknown;
  expectedSchemaVersion?: unknown;
  reason?: unknown;
};

type ParsedDeprecateColumnInput = {
  tableCode: string;
  columnCode: string;
  expectedSchemaVersion: number;
  reason: string;
};

export type DeprecateColumnResult =
  | { ok: true; data: { tableCode: string; columnCode: string; schemaVersion: number; deprecatedAt: string } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'schema_version_conflict' | 'persistence_failed';
      data?: { currentSchemaVersion: number; diff: Record<string, unknown> };
    };

const FORBIDDEN = 'forbidden' as const;
const CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;

export async function deprecateColumn(rawInput: DeprecateColumnInput): Promise<DeprecateColumnResult> {
  const input = parseDeprecateColumnInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requireSchemaEditor({ client, userId, orgId });

      const existing = await findSchemaColumn({ client, tableCode: input.tableCode, columnCode: input.columnCode });
      if (!existing) return { ok: false, error: 'not_found' };

      const currentVersion = Number(existing.schema_version);
      if (currentVersion !== input.expectedSchemaVersion) {
        return {
          ok: false,
          error: 'schema_version_conflict',
          data: {
            currentSchemaVersion: currentVersion,
            diff: {
              expectedSchemaVersion: input.expectedSchemaVersion,
              currentSchemaVersion: currentVersion,
              attemptedDeprecation: { reason: input.reason },
              current: {
                dataType: existing.data_type,
                tier: existing.tier,
                storage: existing.storage,
                deprecatedAt: existing.deprecated_at ?? null,
              },
            },
          },
        };
      }

      const deprecatedAt = new Date().toISOString();
      const updated = await client.query<{ schema_version: number | string; deprecated_at: string }>(
        `update public.reference_schemas
            set deprecated_at = $3::timestamptz,
                presentation_json = coalesce(presentation_json, '{}'::jsonb) || $4::jsonb,
                schema_version = schema_version + 1
          where org_id = app.current_org_id()
            and table_code = $1
            and column_code = $2
            and schema_version = $5
        returning schema_version, deprecated_at`,
        [
          input.tableCode,
          input.columnCode,
          deprecatedAt,
          JSON.stringify({ deprecated_reason: input.reason, deprecated_by: userId }),
          input.expectedSchemaVersion,
        ],
      );

      const row = updated.rows[0];
      revalidatePath('/settings/schema');
      return {
        ok: true,
        data: {
          tableCode: input.tableCode,
          columnCode: input.columnCode,
          schemaVersion: Number(row?.schema_version ?? currentVersion + 1),
          deprecatedAt: row?.deprecated_at ?? deprecatedAt,
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'forbidden' };
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseDeprecateColumnInput(input: DeprecateColumnInput | null | undefined): ParsedDeprecateColumnInput | null {
  if (!input || typeof input !== 'object') return null;
  const tableCode = normalizeCode(input.tableCode);
  const columnCode = normalizeCode(input.columnCode);
  const expectedSchemaVersion = integerOrNull(input.expectedSchemaVersion);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!tableCode || !columnCode || expectedSchemaVersion === null || reason.length < 3 || reason.length > 500) return null;
  return { tableCode, columnCode, expectedSchemaVersion, reason };
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
    [userId, orgId, 'settings.schema.edit', ['owner', 'admin', 'module_admin']],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function findSchemaColumn({ client, tableCode, columnCode }: { client: QueryClient; tableCode: string; columnCode: string }): Promise<SchemaRow | null> {
  const { rows } = await client.query<SchemaRow>(
    `select id, table_code, column_code, data_type, tier, storage, schema_version, deprecated_at
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and column_code = $2
      limit 1`,
    [tableCode, columnCode],
  );
  return rows[0] ?? null;
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
