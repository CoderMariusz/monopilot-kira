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

type SchemaScope = 'universal' | 'variation' | 'org-specific' | 'private';
type SchemaTier = 'L1' | 'L2' | 'L3' | 'L4';

type AddColumnInput = {
  tableCode?: unknown;
  columnCode?: unknown;
  scope?: unknown;
  dataType?: unknown;
  dropdownSource?: unknown;
  validationJson?: unknown;
  presentationJson?: unknown;
  expectedSchemaVersion?: unknown;
  dryRun?: unknown;
  approvedBy?: unknown;
  approvedAt?: unknown;
};

type ParsedAddColumnInput = {
  tableCode: string;
  columnCode: string;
  scope: SchemaScope;
  dataType: string;
  dropdownSource: string | null;
  validationJson: Record<string, unknown>;
  presentationJson: Record<string, unknown>;
  expectedSchemaVersion: number | null;
  dryRun: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type AddColumnResult =
  | {
      ok: true;
      data: {
        tableCode: string;
        columnCode: string;
        tier: SchemaTier;
        storage: string;
        dryRun?: boolean;
        migrationStatus?: 'pending' | 'completed';
      };
    }
  | {
      ok: false;
      error: 'INVALID_INPUT' | 'INVALID_DATA_TYPE' | 'DROPDOWN_SOURCE_FK_VIOLATION' | 'FORBIDDEN' | 'CONCURRENT_EDIT' | 'PERSISTENCE_FAILED';
      data?: Record<string, unknown>;
    };

const FORBIDDEN = 'forbidden' as const;
const ALLOWED_DATA_TYPES = ['text', 'number', 'date', 'enum', 'formula', 'relation'] as const;
const ALLOWED_DATA_TYPE_SET = new Set<string>(ALLOWED_DATA_TYPES);
const CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/;

export async function addColumn(rawInput: AddColumnInput): Promise<AddColumnResult> {
  const parsed = parseAddColumnInput(rawInput);
  if (parsed.kind === 'invalid_data_type') {
    return {
      ok: false,
      error: 'INVALID_DATA_TYPE',
      data: { received: parsed.received, allowed: [...ALLOWED_DATA_TYPES] },
    };
  }
  if (parsed.kind === 'invalid') {
    return { ok: false, error: 'INVALID_INPUT' };
  }
  const input = parsed.value;

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requireSchemaEditor({ client, userId, orgId });

      if (input.dropdownSource) {
        const sourceExists = await referenceTableExists({ client, tableCode: input.dropdownSource });
        if (!sourceExists) {
          return {
            ok: false,
            error: 'DROPDOWN_SOURCE_FK_VIOLATION',
            data: { dropdownSource: input.dropdownSource },
          };
        }
      } else if (input.dataType === 'enum' || input.dataType === 'relation') {
        return {
          ok: false,
          error: 'DROPDOWN_SOURCE_FK_VIOLATION',
          data: { dropdownSource: null, reason: 'enum/relation data type requires dropdown_source' },
        };
      }

      const existing = await findSchemaColumn({ client, tableCode: input.tableCode, columnCode: input.columnCode });
      if (existing && input.expectedSchemaVersion !== null) {
        const currentVersion = Number(existing.schema_version);
        if (currentVersion !== input.expectedSchemaVersion) {
          return {
            ok: false,
            error: 'CONCURRENT_EDIT',
            data: {
              currentSchemaVersion: currentVersion,
              diff: conflictDiff(existing, input),
            },
          };
        }
      }

      const plan = tierPlan(input.scope);
      if (input.dryRun) {
        return {
          ok: true,
          data: {
            tableCode: input.tableCode,
            columnCode: input.columnCode,
            tier: plan.tier,
            storage: plan.storage,
            dryRun: true,
          },
        };
      }

      if (plan.tier === 'L1') {
        // V-SET-03: L1 promotion ALWAYS queues a schema_migrations row with
        // status='pending'. approved_by/approved_at are optional at request time;
        // superadmin approval is captured in a separate approver UI/flow that
        // updates the queued row. We never run DDL from this action.
        await client.query(
          `insert into public.schema_migrations
             (org_id, table_code, column_code, action, tier_before, tier_after,
              migration_script, approved_by, approved_at, status, result_notes)
           values ($1::uuid, $2, $3, $4, null, $5, $6, $7::uuid, $8::timestamptz, $9, $10)`,
          [
            orgId,
            input.tableCode,
            input.columnCode,
            'promote_l2_to_l1',
            'L1',
            JSON.stringify({
              no_live_ddl: true,
              table_code: input.tableCode,
              column_code: input.columnCode,
              data_type: input.dataType,
              validation_json: input.validationJson,
              presentation_json: input.presentationJson,
            }),
            input.approvedBy,
            input.approvedAt,
            'pending',
            'Queued by schema admin wizard; execution is handled by controlled approver tooling.',
          ],
        );

        await client.query(
          `insert into public.outbox_events
             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
           values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
          [
            orgId,
            'settings.schema.migration_requested',
            'schema_migration',
            orgId,
            JSON.stringify({
              org_id: orgId,
              table_code: input.tableCode,
              column_code: input.columnCode,
              tier_after: 'L1',
              status: 'pending',
              approved_by: input.approvedBy,
              approved_at: input.approvedAt,
              actor_user_id: userId,
            }),
            'settings-schema-wizard-v1',
          ],
        );

        revalidatePath('/settings/schema');
        return {
          ok: true,
          data: {
            tableCode: input.tableCode,
            columnCode: input.columnCode,
            tier: 'L1',
            storage: plan.storage,
            migrationStatus: 'pending',
          },
        };
      }

      await client.query(
        `insert into public.reference_schemas
           (org_id, table_code, column_code, data_type, tier, storage, dropdown_source,
            validation_json, presentation_json, schema_version, created_by)
         values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, 1, $10::uuid)
         on conflict (org_id, table_code, column_code) do update set
           data_type = excluded.data_type,
           tier = excluded.tier,
           storage = excluded.storage,
           dropdown_source = excluded.dropdown_source,
           validation_json = excluded.validation_json,
           presentation_json = excluded.presentation_json,
           schema_version = public.reference_schemas.schema_version + 1
         returning table_code, column_code, schema_version`,
        [
          orgId,
          input.tableCode,
          input.columnCode,
          input.dataType,
          plan.tier,
          plan.storage,
          input.dropdownSource,
          JSON.stringify(input.validationJson),
          JSON.stringify(input.presentationJson),
          userId,
        ],
      );

      await client.query(
        `insert into public.schema_migrations
           (org_id, table_code, column_code, action, tier_before, tier_after, status, executed_at, result_notes)
         values ($1::uuid, $2, $3, $4, null, $5, $6, now(), $7)`,
        [orgId, input.tableCode, input.columnCode, 'schema_column_added', plan.tier, 'completed', 'Runtime JSON schema metadata update; no DDL executed.'],
      );

      revalidatePath('/settings/schema');
      return {
        ok: true,
        data: {
          tableCode: input.tableCode,
          columnCode: input.columnCode,
          tier: plan.tier,
          storage: plan.storage,
          migrationStatus: 'completed',
        },
      };
    } catch (error) {
      if (error === FORBIDDEN) return { ok: false, error: 'FORBIDDEN' };
      return { ok: false, error: 'PERSISTENCE_FAILED' };
    }
  });
}

type ParseResult =
  | { kind: 'ok'; value: ParsedAddColumnInput }
  | { kind: 'invalid' }
  | { kind: 'invalid_data_type'; received: string };

function parseAddColumnInput(input: AddColumnInput | null | undefined): ParseResult {
  if (!input || typeof input !== 'object') return { kind: 'invalid' };
  const tableCode = normalizeCode(input.tableCode);
  const columnCode = normalizeCode(input.columnCode);
  const scope = normalizeScope(input.scope);
  const dataType = typeof input.dataType === 'string' ? input.dataType.trim().toLowerCase() : '';
  if (!tableCode || !columnCode || !scope) return { kind: 'invalid' };
  if (!ALLOWED_DATA_TYPE_SET.has(dataType)) {
    return { kind: 'invalid_data_type', received: typeof input.dataType === 'string' ? input.dataType : String(input.dataType) };
  }

  const dropdownSource = normalizeCode(input.dropdownSource);
  const validationJson = plainObject(input.validationJson) ?? {};
  const presentationJson = plainObject(input.presentationJson) ?? {};
  const expectedSchemaVersion = integerOrNull(input.expectedSchemaVersion);
  if (input.expectedSchemaVersion !== undefined && expectedSchemaVersion === null) return { kind: 'invalid' };

  return {
    kind: 'ok',
    value: {
      tableCode,
      columnCode,
      scope,
      dataType,
      dropdownSource,
      validationJson,
      presentationJson,
      expectedSchemaVersion,
      dryRun: input.dryRun === true,
      approvedBy: normalizeUuid(input.approvedBy),
      approvedAt: normalizeIso(input.approvedAt),
    },
  };
}

function tierPlan(scope: SchemaScope): { tier: SchemaTier; storage: string } {
  if (scope === 'universal') return { tier: 'L1', storage: 'native_postgres_column' };
  if (scope === 'variation') return { tier: 'L2', storage: 'tenant_variations' };
  if (scope === 'org-specific') return { tier: 'L3', storage: 'ext_jsonb' };
  return { tier: 'L4', storage: 'private_jsonb' };
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

async function findSchemaColumn({ client, tableCode, columnCode }: { client: QueryClient; tableCode: string; columnCode: string }): Promise<SchemaRow | null> {
  const { rows } = await client.query<SchemaRow>(
    `select table_code, column_code, data_type, tier, storage, dropdown_source,
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

function conflictDiff(existing: SchemaRow, input: ParsedAddColumnInput): Record<string, unknown> {
  return {
    expectedSchemaVersion: input.expectedSchemaVersion,
    current: {
      dataType: existing.data_type,
      tier: existing.tier,
      storage: existing.storage,
      dropdownSource: existing.dropdown_source ?? null,
      validationJson: existing.validation_json ?? {},
      presentationJson: existing.presentation_json ?? {},
      deprecatedAt: existing.deprecated_at ?? null,
    },
    attempted: {
      dataType: input.dataType,
      scope: input.scope,
      dropdownSource: input.dropdownSource,
      validationJson: input.validationJson,
      presentationJson: input.presentationJson,
    },
  };
}

function normalizeScope(value: unknown): SchemaScope | null {
  if (value === 'universal' || value === 'variation' || value === 'org-specific' || value === 'private') return value;
  return null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return null;
  return trimmed;
}

function integerOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
