'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type CapabilityBlocker = { code: 'permission_missing' | 'unsupported_import'; detail?: string };
type CapabilityState = {
  supported: boolean;
  permission?: string;
  blockers?: CapabilityBlocker[];
  delegate?: Record<string, unknown>;
};
type Capability = { target: string; import: CapabilityState; export: CapabilityState };

type CapabilitySpec = {
  target: string;
  importPermission: string | null;
  exportPermission: string | null;
  importUnsupported?: boolean;
  exportUnsupported?: boolean;
  importDelegate?: Record<string, unknown>;
  exportDelegate?: Record<string, unknown>;
};

const CAPABILITY_SPECS: CapabilitySpec[] = [
  { target: 'users', importPermission: null, exportPermission: 'settings.org.read', importUnsupported: true },
  { target: 'roles', importPermission: null, exportPermission: 'settings.org.read', importUnsupported: true },
  { target: 'invitations', importPermission: null, exportPermission: 'settings.org.read', importUnsupported: true },
  {
    target: 'reference_tables',
    importPermission: 'settings.reference.import',
    exportPermission: 'settings.reference.view',
    importDelegate: {
      feature: 'reference_csv',
      previewAction: 'previewReferenceCsvImport',
      commitAction: 'commitReferenceCsvImport',
    },
    exportDelegate: { feature: 'reference_csv', exportAction: 'exportReferenceCsv' },
  },
  { target: 'infrastructure', importPermission: null, exportPermission: 'settings.infra.view', importUnsupported: true },
  { target: 'feature_flags', importPermission: null, exportPermission: 'settings.flags.view', importUnsupported: true },
  { target: 'authorization_policies', importPermission: 'settings.authorization.edit', exportPermission: 'settings.authorization.view' },
  { target: 'audit_logs', importPermission: null, exportPermission: 'settings.audit.read', importUnsupported: true },
];

export type ListImportExportCapabilitiesResult =
  | { ok: true; data: { capabilities: Capability[] } }
  | { ok: false; error: 'persistence_failed' };

export async function listImportExportCapabilities(): Promise<ListImportExportCapabilitiesResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<ListImportExportCapabilitiesResult> => {
      const permissions = await resolvePermissions({ client, userId, orgId }, CAPABILITY_SPECS);
      return {
        ok: true,
        data: {
          capabilities: CAPABILITY_SPECS.map((spec) => ({
            target: spec.target,
            import: toState(spec.importPermission, permissions, {
              unsupported: spec.importUnsupported === true,
              unsupportedCode: 'unsupported_import',
              delegate: spec.importDelegate,
            }),
            export: toState(spec.exportPermission, permissions, {
              unsupported: spec.exportUnsupported === true,
              unsupportedCode: 'unsupported_import',
              delegate: spec.exportDelegate,
            }),
          })),
        },
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

async function resolvePermissions(ctx: OrgActionContext, specs: CapabilitySpec[]): Promise<Set<string>> {
  const permissions = new Set<string>();
  const candidates = new Set<string>();
  for (const spec of specs) {
    if (spec.importPermission) candidates.add(spec.importPermission);
    if (spec.exportPermission) candidates.add(spec.exportPermission);
  }
  for (const permission of Array.from(candidates)) {
    if (await hasPermission(ctx, permission)) permissions.add(permission);
  }
  return permissions;
}

function toState(
  permission: string | null,
  granted: Set<string>,
  opts: { unsupported?: boolean; unsupportedCode: CapabilityBlocker['code']; delegate?: Record<string, unknown> },
): CapabilityState {
  if (opts.unsupported || !permission) {
    return { supported: false, blockers: [{ code: opts.unsupportedCode }] };
  }
  if (!granted.has(permission)) {
    return { supported: false, blockers: [{ code: 'permission_missing', detail: permission }] };
  }
  return {
    supported: true,
    permission,
    ...(opts.delegate ? { delegate: opts.delegate } : {}),
  };
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       join public.user_roles ur on ur.role_id = r.id and ur.org_id = r.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and rp.permission = $3
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}
