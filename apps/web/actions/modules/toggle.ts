'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '../../lib/auth/with-org-context';

export type ToggleModuleInput = {
  moduleCode: string;
  enabled: boolean;
  force?: boolean;
  auditReason?: string;
};

export type ToggleModuleResult =
  | { ok: true; data: { moduleCode: string; enabled: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'module_not_found'
        | 'module_not_disableable'
        | 'dependency_enabled'
        | 'persistence_failed';
      blockingModules?: string[];
    };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ModuleRow = {
  code: string;
  name?: string;
  dependencies?: string[] | null;
  can_disable?: boolean | null;
  phase?: number | null;
};

type OrganizationModuleRow = {
  module_code: string;
  enabled: boolean;
};

const FORBIDDEN = 'forbidden' as const;
const MODULE_CODE_PATTERN = /^[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function toggleModule(rawInput: ToggleModuleInput): Promise<ToggleModuleResult> {
  const input = parseInput(rawInput);
  if (!input) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      await requirePermission({ client, userId, orgId });

      const { rows: modules } = await client.query<ModuleRow>(
        `select code, name, dependencies, can_disable, phase
           from public.modules
          order by code`,
      );
      const moduleByCode = new Map(modules.map((module) => [module.code, module]));
      const module = moduleByCode.get(input.moduleCode);
      if (!module) {
        return { ok: false, error: 'module_not_found' };
      }

      if (!input.enabled && module.can_disable === false) {
        return { ok: false, error: 'module_not_disableable' };
      }

      if (!input.enabled && !input.force) {
        const blockingModules = await enabledReverseDependencies({
          client,
          moduleByCode,
          moduleCode: input.moduleCode,
        });
        if (blockingModules.length > 0) {
          return { ok: false, error: 'dependency_enabled', blockingModules };
        }
      }

      const updated = await client.query<OrganizationModuleRow>(
        `update public.organization_modules
            set enabled = $1,
                updated_at = now()
          where module_code = $2
            and org_id = app.current_org_id()
        returning module_code, enabled`,
        [input.enabled, input.moduleCode],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) {
        return { ok: false, error: 'module_not_found' };
      }

      const eventType = input.enabled ? 'settings.module.enabled' : 'settings.module.disabled';
      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          eventType,
          'module',
          JSON.stringify({
            org_id: orgId,
            module_code: input.moduleCode,
            enabled: input.enabled,
            actor_user_id: userId,
            force: input.force,
            auditReason: input.auditReason,
          }),
          'settings-toggle-module-v1',
        ],
      );

      revalidatePath('/settings/modules');
      return { ok: true, data: { moduleCode: input.moduleCode, enabled: input.enabled } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function parseInput(input: ToggleModuleInput | null | undefined): ToggleModuleInput | null {
  if (!input || typeof input !== 'object') return null;
  const moduleCode = typeof input.moduleCode === 'string' ? input.moduleCode.trim() : '';
  if (!MODULE_CODE_PATTERN.test(moduleCode) || typeof input.enabled !== 'boolean') return null;
  const auditReason = typeof input.auditReason === 'string' ? input.auditReason.trim() : undefined;
  return {
    moduleCode,
    enabled: input.enabled,
    force: input.force === true,
    auditReason: auditReason && auditReason.length > 0 ? auditReason : undefined,
  };
}

async function requirePermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
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
          or r.slug = $3
          or r.permissions ? $3
        )
      limit 1`,
    [userId, orgId, 'org.access.admin'],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function enabledReverseDependencies({
  client,
  moduleByCode,
  moduleCode,
}: {
  client: QueryClient;
  moduleByCode: Map<string, ModuleRow>;
  moduleCode: string;
}): Promise<string[]> {
  const reverseGraph = buildReverseGraph(moduleByCode);
  const downstream = collectDownstreamModules(reverseGraph, moduleCode);
  if (downstream.length === 0) return [];

  const { rows } = await client.query<OrganizationModuleRow>(
    `select module_code, enabled
       from public.organization_modules
      where org_id = app.current_org_id()
        and module_code = any($1::text[])
        and enabled = true
      order by module_code`,
    [downstream],
  );

  const enabledCodes = new Set(rows.filter((row) => row.enabled).map((row) => row.module_code));
  return downstream
    .filter((code) => enabledCodes.has(code))
    .filter((code) => directlyDependsOn(code, moduleCode, moduleByCode) || (reverseGraph.get(code)?.length ?? 0) > 0)
    .sort();
}

function directlyDependsOn(code: string, dependencyCode: string, moduleByCode: Map<string, ModuleRow>): boolean {
  const module = moduleByCode.get(code);
  return (module?.dependencies ?? [])
    .map((dependency) => expandDependencyCode(dependency, moduleByCode))
    .includes(dependencyCode);
}

function buildReverseGraph(moduleByCode: Map<string, ModuleRow>): Map<string, string[]> {
  const reverseGraph = new Map<string, string[]>();
  for (const module of Array.from(moduleByCode.values())) {
    for (const dependency of module.dependencies ?? []) {
      const fullDependency = expandDependencyCode(dependency, moduleByCode);
      if (!fullDependency) continue;
      const dependents = reverseGraph.get(fullDependency) ?? [];
      dependents.push(module.code);
      reverseGraph.set(fullDependency, dependents);
    }
  }
  return reverseGraph;
}

function collectDownstreamModules(reverseGraph: Map<string, string[]>, moduleCode: string): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  const queue = [...(reverseGraph.get(moduleCode) ?? [])];

  while (queue.length > 0) {
    const code = queue.shift();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    collected.push(code);
    queue.push(...(reverseGraph.get(code) ?? []));
  }

  return collected;
}

function expandDependencyCode(dependency: string, moduleByCode: Map<string, ModuleRow>): string | null {
  if (moduleByCode.has(dependency)) return dependency;
  if (/^[0-9]{2}$/.test(dependency)) {
    const match = Array.from(moduleByCode.keys()).find((code) => code.startsWith(`${dependency}-`));
    return match ?? null;
  }
  return null;
}
