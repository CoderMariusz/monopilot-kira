'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { ProcessDefaultRole, ProcessDefaultRow } from './process-defaults-types';

// NOTE: this is a 'use server' module → it must export ONLY async functions. Next's RSC transform
// registers EVERY named export as a server action, so a re-exported/exported TYPE becomes a phantom
// action ref that fails `next build` ("export not found" — tsc does NOT catch this). Types live in
// ./process-defaults-types and are imported with `import type`; result-type aliases below stay LOCAL.

const EDIT_PERMISSION = 'npd.schema.edit';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProcessDefaultDbRow = {
  operation_id: string;
  operation_name: string;
  standard_cost: string | number;
  default_duration_hours: string | number;
  roles: unknown;
};

type ProcessDefaultIdRow = { id: string };

const UpsertProcessDefaultsInput = z
  .object({
    operationId: z.string().uuid(),
    standardCost: z.number().nonnegative(),
    defaultDurationHours: z.number().nonnegative(),
    roles: z
      .array(
        z
          .object({
            roleGroup: z.string().trim().min(1),
            defaultHeadcount: z.number().int().positive(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
  .refine(
    (input) => {
      const seen = new Set<string>();
      for (const role of input.roles) {
        const key = role.roleGroup.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: 'roleGroup values must be unique.', path: ['roles'] },
  );

type UpsertProcessDefaultsInput = z.infer<typeof UpsertProcessDefaultsInput>;

function parseUpsertProcessDefaults(input: unknown): UpsertProcessDefaultsInput {
  const result = UpsertProcessDefaultsInput.safeParse(input);
  if (result.success) {
    return {
      ...result.data,
      roles: result.data.roles.map((role) => ({
        roleGroup: role.roleGroup.trim(),
        defaultHeadcount: role.defaultHeadcount,
      })),
    };
  }

  const message = result.error.issues.map((issue) => issue.message).join('; ');
  throw new Error(`Invalid process defaults input: ${message}`);
}

function rolesFromJson(value: unknown): ProcessDefaultRole[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((role): ProcessDefaultRole | null => {
      if (typeof role !== 'object' || role === null || Array.isArray(role)) return null;
      const record = role as Record<string, unknown>;
      if (typeof record.roleGroup !== 'string' || typeof record.defaultHeadcount !== 'number') return null;
      return { roleGroup: record.roleGroup, defaultHeadcount: record.defaultHeadcount };
    })
    .filter((role): role is ProcessDefaultRole => role !== null);
}

function mapProcessDefaultRow(row: ProcessDefaultDbRow): ProcessDefaultRow {
  return {
    operationId: row.operation_id,
    operationName: row.operation_name,
    standardCost: Number(row.standard_cost),
    defaultDurationHours: Number(row.default_duration_hours),
    roles: rolesFromJson(row.roles),
  };
}

async function requireNpdSchemaEdit({ client, userId, orgId }: OrgContextLike): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, EDIT_PERMISSION],
  );
  if (rows.length === 0) throw new Error(`Forbidden: missing ${EDIT_PERMISSION}.`);
}

async function selectProcessDefaultByOperation(
  { client }: OrgContextLike,
  operationId: string,
): Promise<ProcessDefaultRow | null> {
  const { rows } = await client.query<ProcessDefaultDbRow>(
    `select mo.id::text as operation_id,
            mo.operation_name,
            pd.standard_cost::text as standard_cost,
            pd.default_duration_hours::text as default_duration_hours,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'roleGroup', pdr.role_group,
                  'defaultHeadcount', pdr.default_headcount
                )
                order by lower(pdr.role_group)
              ) filter (where pdr.id is not null),
              '[]'::jsonb
            ) as roles
       from "Reference"."ManufacturingOperations" mo
       left join public.npd_process_defaults pd
         on pd.operation_id = mo.id
        and pd.org_id = app.current_org_id()
       left join public.npd_process_default_roles pdr
         on pdr.process_default_id = pd.id
        and pdr.org_id = app.current_org_id()
      where mo.id = $1::uuid
        and mo.org_id = app.current_org_id()
        and mo.is_active = true
      group by mo.id, mo.operation_name, pd.id, pd.standard_cost, pd.default_duration_hours
      limit 1`,
    [operationId],
  );
  const row = rows[0];
  if (!row) throw new Error('Manufacturing operation not found.');
  if (row.standard_cost === null || row.default_duration_hours === null) return null;
  return mapProcessDefaultRow(row);
}

type ListProcessDefaultsResult =
  | { ok: true; data: ProcessDefaultRow[] }
  | { ok: false; error: string };
type UpsertProcessDefaultsResult = { ok: true } | { ok: false; error: string };
type GetProcessDefaultResult =
  | { ok: true; data: ProcessDefaultRow | null }
  | { ok: false; error: string };

export async function listProcessDefaults(): Promise<ListProcessDefaultsResult> {
  try {
    const data = await withOrgContext<ProcessDefaultRow[]>(async (ctx): Promise<ProcessDefaultRow[]> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<ProcessDefaultDbRow>(
      `select mo.id::text as operation_id,
              mo.operation_name,
              coalesce(pd.standard_cost, 0)::text as standard_cost,
              coalesce(pd.default_duration_hours, 0)::text as default_duration_hours,
              coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'roleGroup', pdr.role_group,
                    'defaultHeadcount', pdr.default_headcount
                  )
                  order by lower(pdr.role_group)
                ) filter (where pdr.id is not null),
                '[]'::jsonb
              ) as roles
         from "Reference"."ManufacturingOperations" mo
         left join public.npd_process_defaults pd
           on pd.operation_id = mo.id
          and pd.org_id = app.current_org_id()
         left join public.npd_process_default_roles pdr
           on pdr.process_default_id = pd.id
          and pdr.org_id = app.current_org_id()
        where mo.org_id = app.current_org_id()
          and mo.is_active = true
        group by mo.id, mo.operation_name, pd.standard_cost, pd.default_duration_hours
        order by lower(mo.operation_name)`,
    );
    return rows.map(mapProcessDefaultRow);
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to load process defaults.' };
  }
}

export async function upsertProcessDefaults(input: unknown): Promise<UpsertProcessDefaultsResult> {
  try {
    const parsed = parseUpsertProcessDefaults(input);
    await withOrgContext<void>(async (ctx): Promise<void> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);

    const { rows: operationRows } = await context.client.query<{ id: string }>(
      `select id::text
         from "Reference"."ManufacturingOperations"
        where id = $1::uuid
          and org_id = app.current_org_id()
          and is_active = true
        limit 1`,
      [parsed.operationId],
    );
    if (!operationRows[0]) throw new Error('Manufacturing operation not found.');

    const { rows: defaultRows } = await context.client.query<ProcessDefaultIdRow>(
      `insert into public.npd_process_defaults
         (org_id, operation_id, standard_cost, default_duration_hours)
       values (app.current_org_id(), $1::uuid, $2::numeric, $3::numeric)
       on conflict (org_id, operation_id)
       do update set
         standard_cost = excluded.standard_cost,
         default_duration_hours = excluded.default_duration_hours,
         updated_at = now()
       returning id::text`,
      [parsed.operationId, parsed.standardCost, parsed.defaultDurationHours],
    );
    const processDefaultId = defaultRows[0]?.id;
    if (!processDefaultId) throw new Error('Failed to upsert process defaults.');

    await context.client.query(
      `delete from public.npd_process_default_roles
        where org_id = app.current_org_id()
          and process_default_id = $1::uuid`,
      [processDefaultId],
    );

    for (const role of parsed.roles) {
      await context.client.query(
        `insert into public.npd_process_default_roles
           (org_id, process_default_id, role_group, default_headcount)
         values (app.current_org_id(), $1::uuid, $2::text, $3::int)`,
        [processDefaultId, role.roleGroup, role.defaultHeadcount],
      );
    }

    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to save process defaults.' };
  }
}

export async function getProcessDefault(operationId: string): Promise<GetProcessDefaultResult> {
  try {
    const data = await withOrgContext<ProcessDefaultRow | null>(async (ctx): Promise<ProcessDefaultRow | null> => {
      const context = ctx as OrgContextLike;
      return selectProcessDefaultByOperation(context, operationId);
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to load process default.' };
  }
}
