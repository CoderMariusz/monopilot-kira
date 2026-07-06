'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type {
  ProcessDefaultRole,
  ProcessDefaultRow,
  ProcessProductRate,
  RoleGroupRate,
} from './process-defaults-types';

// NOTE: this is a 'use server' module → it must export ONLY async functions. Next's RSC transform
// registers EVERY named export as a server action, so a re-exported/exported TYPE becomes a phantom
// action ref that fails `next build` ("export not found" — tsc does NOT catch this). Types live in
// ./process-defaults-types and are imported with `import type`; result-type aliases below stay LOCAL.
//
// W2-T1 (2026-07-06 consolidation): this backend now serves the UNIFIED Settings "Processes"
// screen — npd_process_defaults (+roles) is the storage backbone, "Reference"."ManufacturingOperations"
// is the name + suffix vocabulary. standard_cost is derived-with-override: when cost_overridden is
// false it is recomputed server-side as Σ(default_headcount × labor_rates.rate_per_hour) at save;
// prefix auto-numbers per process_suffix (PREP-01, PREP-02, …) unless manually provided.

const EDIT_PERMISSION = 'npd.schema.edit';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProcessDefaultDbRow = {
  operation_id: string;
  operation_name: string;
  process_suffix: string;
  prefix: string | null;
  standard_cost: string | number;
  cost_overridden: boolean | null;
  default_duration_hours: string | number;
  setup_cost: string | number | null;
  throughput_per_hour: string | number | null;
  throughput_uom: string | null;
  yield_pct: string | number | null;
  roles: unknown;
};

type ProcessDefaultIdRow = { id: string };
type RoleGroupRateRow = { role_group: string; rate_per_hour: string | number };
type ProductRateDbRow = {
  process_name: string;
  product_code: string;
  throughput_per_hour: string | number | null;
  throughput_uom: string | null;
  setup_cost: string | number | null;
  yield_pct: string | number | null;
};

/**
 * Distinct labor-rate role groups (+ currently effective rate) for the org. One
 * row per case-insensitive group; the returned casing is the most recently
 * effective row's — that exact string is what gets persisted so the costing
 * joins (exact-match in npd costing, lower() in WO costing) both resolve a rate.
 */
async function selectLaborRateRoleGroupRates({ client }: OrgContextLike): Promise<RoleGroupRate[]> {
  const { rows } = await client.query<RoleGroupRateRow>(
    `select distinct on (lower(role_group)) role_group, rate_per_hour::text as rate_per_hour
       from public.labor_rates
      where org_id = app.current_org_id()
        and effective_from <= current_date
      order by lower(role_group), effective_from desc`,
  );
  return rows.map((row) => ({ roleGroup: row.role_group, ratePerHour: Number(row.rate_per_hour) }));
}

const UpsertProcessDefaultsInput = z
  .object({
    operationId: z.string().uuid(),
    standardCost: z.number().nonnegative(),
    costOverridden: z.boolean().default(false),
    defaultDurationHours: z.number().nonnegative(),
    setupCost: z.number().nonnegative().default(0),
    throughputPerHour: z.number().nonnegative().nullable().default(null),
    throughputUom: z.string().trim().nullable().default(null),
    yieldPct: z.number().gt(0).max(100).default(100),
    /** Empty string ⇒ auto-number per the operation's process_suffix. */
    prefix: z.string().trim().default(''),
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
      throughputUom: result.data.throughputUom === '' ? null : result.data.throughputUom,
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

function numberOrNull(value: string | number | null): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function mapProcessDefaultRow(
  row: ProcessDefaultDbRow,
  productRatesByName: Map<string, ProcessProductRate[]>,
): ProcessDefaultRow {
  return {
    operationId: row.operation_id,
    operationName: row.operation_name,
    processSuffix: row.process_suffix,
    prefix: row.prefix ?? null,
    standardCost: Number(row.standard_cost),
    costOverridden: row.cost_overridden === true,
    defaultDurationHours: Number(row.default_duration_hours),
    setupCost: Number(row.setup_cost ?? 0),
    throughputPerHour: numberOrNull(row.throughput_per_hour),
    throughputUom: row.throughput_uom ?? null,
    yieldPct: Number(row.yield_pct ?? 100),
    roles: rolesFromJson(row.roles),
    productRates: productRatesByName.get(row.operation_name.toLowerCase()) ?? [],
  };
}

/**
 * Read-only per-product rates: every npd_wip_processes row (per prod_detail),
 * keyed by lower(process_name) — the same name-join the allergen cascade uses
 * against ManufacturingOperations.operation_name. Surfaced on the unified
 * Processes screen; NOT editable there (owner decision: no re-modeling).
 */
async function selectProductRatesByProcessName(
  { client }: OrgContextLike,
): Promise<Map<string, ProcessProductRate[]>> {
  const { rows } = await client.query<ProductRateDbRow>(
    `select wp.process_name,
            pdet.product_code,
            wp.throughput_per_hour::text as throughput_per_hour,
            wp.throughput_uom,
            wp.setup_cost::text as setup_cost,
            wp.yield_pct::text as yield_pct
       from public.npd_wip_processes wp
       join public.prod_detail pdet
         on pdet.id = wp.prod_detail_id
        and pdet.org_id = wp.org_id
      where wp.org_id = app.current_org_id()
      order by lower(wp.process_name), pdet.product_code, wp.display_order`,
  );
  const byName = new Map<string, ProcessProductRate[]>();
  for (const row of rows) {
    const key = row.process_name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push({
      productCode: row.product_code,
      throughputPerHour: numberOrNull(row.throughput_per_hour),
      throughputUom: row.throughput_uom ?? null,
      setupCost: Number(row.setup_cost ?? 0),
      yieldPct: Number(row.yield_pct ?? 100),
    });
    byName.set(key, list);
  }
  return byName;
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

const PROCESS_DEFAULT_SELECT = `select mo.id::text as operation_id,
            mo.operation_name,
            mo.process_suffix,
            (pd.id is not null) as configured,
            pd.prefix,
            coalesce(pd.standard_cost, 0)::text as standard_cost,
            coalesce(pd.cost_overridden, false) as cost_overridden,
            coalesce(pd.default_duration_hours, 0)::text as default_duration_hours,
            coalesce(pd.setup_cost, 0)::text as setup_cost,
            pd.throughput_per_hour::text as throughput_per_hour,
            pd.throughput_uom,
            coalesce(pd.yield_pct, 100)::text as yield_pct,
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
        and pdr.org_id = app.current_org_id()`;

async function selectProcessDefaultByOperation(
  context: OrgContextLike,
  operationId: string,
): Promise<ProcessDefaultRow | null> {
  const { rows } = await context.client.query<
    ProcessDefaultDbRow & { configured: boolean | null }
  >(
    `${PROCESS_DEFAULT_SELECT}
      where mo.id = $1::uuid
        and mo.org_id = app.current_org_id()
        and mo.is_active = true
      group by mo.id, mo.operation_name, mo.process_suffix, pd.id
      limit 1`,
    [operationId],
  );
  const row = rows[0];
  if (!row) throw new Error('Manufacturing operation not found.');
  // Left-join miss (operation exists but has no configured default yet) ⇒ null,
  // preserving the pre-W2 caller contract (NPD prefill treats null as "skip").
  if (row.configured !== true) return null;
  const productRates = await selectProductRatesByProcessName(context);
  return mapProcessDefaultRow(row, productRates);
}

type ListProcessDefaultsResult =
  | { ok: true; data: ProcessDefaultRow[] }
  | { ok: false; error: string };
type UpsertProcessDefaultsResult = { ok: true } | { ok: false; error: string };
type GetProcessDefaultResult =
  | { ok: true; data: ProcessDefaultRow | null }
  | { ok: false; error: string };
type ListLaborRateRoleGroupsResult = { ok: true; data: string[] } | { ok: false; error: string };
type ListLaborRateRoleGroupRatesResult =
  | { ok: true; data: RoleGroupRate[] }
  | { ok: false; error: string };

export async function listLaborRateRoleGroups(): Promise<ListLaborRateRoleGroupsResult> {
  try {
    const data = await withOrgContext<string[]>(async (ctx): Promise<string[]> => {
      const rates = await selectLaborRateRoleGroupRates(ctx as OrgContextLike);
      return rates.map((rate) => rate.roleGroup);
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to load role groups.' };
  }
}

/** Role groups WITH their effective rate — feeds the live Σ(headcount × rate) cost display. */
export async function listLaborRateRoleGroupRates(): Promise<ListLaborRateRoleGroupRatesResult> {
  try {
    const data = await withOrgContext<RoleGroupRate[]>(async (ctx): Promise<RoleGroupRate[]> =>
      selectLaborRateRoleGroupRates(ctx as OrgContextLike),
    );
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to load role groups.' };
  }
}

export async function listProcessDefaults(): Promise<ListProcessDefaultsResult> {
  try {
    const data = await withOrgContext<ProcessDefaultRow[]>(async (ctx): Promise<ProcessDefaultRow[]> => {
      const context = ctx as OrgContextLike;
      const { rows } = await context.client.query<ProcessDefaultDbRow>(
        `${PROCESS_DEFAULT_SELECT}
        where mo.org_id = app.current_org_id()
          and mo.is_active = true
        group by mo.id, mo.operation_name, mo.process_suffix, pd.id
        order by lower(mo.operation_name)`,
      );
      const productRates = await selectProductRatesByProcessName(context);
      return rows.map((row) => mapProcessDefaultRow(row, productRates));
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to load process defaults.' };
  }
}

/**
 * Prefix resolution (owner decision 3): manual value wins; otherwise keep the
 * row's existing prefix; otherwise auto-number `<process_suffix>-NN` scanning
 * the org's already-assigned prefixes for that suffix (PREP-01 → PREP-02 …).
 */
async function resolvePrefix(
  context: OrgContextLike,
  operationId: string,
  processSuffix: string,
  requested: string,
): Promise<string> {
  if (requested !== '') return requested;

  const { rows: existingRows } = await context.client.query<{ prefix: string | null }>(
    `select prefix
       from public.npd_process_defaults
      where org_id = app.current_org_id()
        and operation_id = $1::uuid
      limit 1`,
    [operationId],
  );
  const existing = existingRows[0]?.prefix;
  if (existing) return existing;

  await context.client.query(
    `select pg_advisory_xact_lock(hashtext(app.current_org_id()::text || ':' || $1::text))`,
    [processSuffix],
  );

  const { rows: takenRows } = await context.client.query<{ prefix: string }>(
    `select prefix
       from public.npd_process_defaults
      where org_id = app.current_org_id()
        and prefix ~ ('^' || $1 || '-[0-9]+$')`,
    [processSuffix],
  );
  const next =
    takenRows.reduce(
      (max, row) => Math.max(max, Number(row.prefix.slice(processSuffix.length + 1))),
      0,
    ) + 1;
  return `${processSuffix}-${String(next).padStart(2, '0')}`;
}

export async function upsertProcessDefaults(input: unknown): Promise<UpsertProcessDefaultsResult> {
  try {
    const parsed = parseUpsertProcessDefaults(input);
    await withOrgContext<void>(async (ctx): Promise<void> => {
      const context = ctx as OrgContextLike;
      await requireNpdSchemaEdit(context);

      const { rows: operationRows } = await context.client.query<{ id: string; process_suffix: string }>(
        `select id::text, process_suffix
         from "Reference"."ManufacturingOperations"
        where id = $1::uuid
          and org_id = app.current_org_id()
          and is_active = true
        limit 1`,
        [parsed.operationId],
      );
      const operation = operationRows[0];
      if (!operation) throw new Error('Manufacturing operation not found.');

      // Validate every submitted roleGroup against the org's labor-rate role
      // groups (case-insensitively — the costing joins are), and persist the
      // canonical labor_rates casing so exact-match joins also resolve. The
      // same rows carry the effective rate for the derived-cost computation.
      const roleGroupRates = await selectLaborRateRoleGroupRates(context);
      const canonicalByLower = new Map(roleGroupRates.map((rate) => [rate.roleGroup.toLowerCase(), rate]));
      const roles = parsed.roles.map((role) => {
        const canonical = canonicalByLower.get(role.roleGroup.toLowerCase());
        if (!canonical) {
          throw new Error(`Unknown role group: ${role.roleGroup}. Configure it in labor rates first.`);
        }
        return { roleGroup: canonical.roleGroup, defaultHeadcount: role.defaultHeadcount };
      });

      // Derived-with-override cost (owner decision 2): unless overridden, the
      // stored standard_cost is Σ(headcount × current labor rate) — computed
      // HERE so a tampered client value can never desync the persisted cost.
      let standardCost = parsed.standardCost;
      if (!parsed.costOverridden) {
        standardCost = Number(
          roles
            .reduce(
              (sum, role) =>
                sum +
                role.defaultHeadcount *
                  (canonicalByLower.get(role.roleGroup.toLowerCase())?.ratePerHour ?? 0),
              0,
            )
            .toFixed(4),
        );
      }

      const prefix = await resolvePrefix(context, parsed.operationId, operation.process_suffix, parsed.prefix);

      const { rows: defaultRows } = await context.client.query<ProcessDefaultIdRow>(
        `insert into public.npd_process_defaults
         (org_id, operation_id, standard_cost, cost_overridden, default_duration_hours,
          setup_cost, throughput_per_hour, throughput_uom, yield_pct, prefix)
       values (app.current_org_id(), $1::uuid, $2::numeric, $3::boolean, $4::numeric,
               $5::numeric, $6::numeric, $7::text, $8::numeric, $9::text)
       on conflict (org_id, operation_id)
       do update set
         standard_cost = excluded.standard_cost,
         cost_overridden = excluded.cost_overridden,
         default_duration_hours = excluded.default_duration_hours,
         setup_cost = excluded.setup_cost,
         throughput_per_hour = excluded.throughput_per_hour,
         throughput_uom = excluded.throughput_uom,
         yield_pct = excluded.yield_pct,
         prefix = excluded.prefix,
         updated_at = now()
       returning id::text`,
        [
          parsed.operationId,
          standardCost,
          parsed.costOverridden,
          parsed.defaultDurationHours,
          parsed.setupCost,
          parsed.throughputPerHour,
          parsed.throughputUom,
          parsed.yieldPct,
          prefix,
        ],
      );
      const processDefaultId = defaultRows[0]?.id;
      if (!processDefaultId) throw new Error('Failed to upsert process defaults.');

      await context.client.query(
        `delete from public.npd_process_default_roles
        where org_id = app.current_org_id()
          and process_default_id = $1::uuid`,
        [processDefaultId],
      );

      for (const role of roles) {
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
