'use server';

/**
 * T-121 / SET-029 — real-data loader for the Global Import / Export hub.
 *
 * Reads the org-scoped capability registry (capabilities.ts → listImportExportCapabilities)
 * and recent import/export jobs from public.import_export_jobs via withOrgContext (RLS),
 * then maps them into the prototype-faithful client shape consumed by
 * import-export-screen.client.tsx (SettingsImportExportEntity[] + RecentJob[]).
 *
 * No hardcoded entities/jobs: every row is org-scoped (app.current_org_id()) and
 * permission-gated by the same registry the import/export actions enforce.
 */

import { withOrgContext } from '../../lib/auth/with-org-context';
import { listImportExportCapabilities } from './capabilities';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type LoaderEntityKey =
  | 'users'
  | 'roles'
  | 'invitations'
  | 'reference_tables'
  | 'infrastructure'
  | 'feature_flags'
  | 'authorization_policies';

export type LoaderEntity = {
  key: LoaderEntityKey;
  label: string;
  importSupported: boolean;
  exportSupported: boolean;
  requiredPermissions: string[];
  templateAvailable: boolean;
  processingMode: 'sync' | 'async';
  auditRequired: boolean;
  referenceHandoffHref?: string;
};

export type LoaderRecentJob = {
  id: string;
  entity: string;
  type: 'import' | 'export';
  status: 'queued' | 'running' | 'completed' | 'failed';
  rows: number | null;
  auditReason?: string;
};

export type ImportExportLoadResult =
  | {
      ok: true;
      state: 'ready' | 'empty';
      entities: LoaderEntity[];
      visiblePermissions: string[];
      recentJobs: LoaderRecentJob[];
      canImportAuthorizationPolicies: boolean;
    }
  | { ok: false; state: 'error' };

/** Per-entity static UI metadata not derivable from the permission registry. */
const ENTITY_META: Record<
  LoaderEntityKey,
  {
    label: string;
    templateAvailable: boolean;
    processingMode: 'sync' | 'async';
    auditRequired: boolean;
    referenceHandoffHref?: (locale: string) => string;
  }
> = {
  users: { label: 'Users', templateAvailable: false, processingMode: 'sync', auditRequired: true },
  roles: { label: 'Roles', templateAvailable: false, processingMode: 'sync', auditRequired: true },
  invitations: { label: 'Invitations', templateAvailable: false, processingMode: 'sync', auditRequired: true },
  reference_tables: {
    label: 'Reference tables',
    templateAvailable: true,
    processingMode: 'sync',
    auditRequired: true,
    referenceHandoffHref: (locale) => `/${locale}/settings/reference`,
  },
  infrastructure: { label: 'Infrastructure', templateAvailable: false, processingMode: 'async', auditRequired: true },
  feature_flags: { label: 'Feature flags', templateAvailable: false, processingMode: 'async', auditRequired: true },
  authorization_policies: {
    label: 'Authorization policies',
    templateAvailable: true,
    processingMode: 'async',
    auditRequired: true,
  },
};

const CLIENT_ENTITY_KEYS: LoaderEntityKey[] = [
  'users',
  'roles',
  'invitations',
  'reference_tables',
  'infrastructure',
  'feature_flags',
  'authorization_policies',
];

type RecentJobRow = {
  id: string;
  kind: 'import' | 'export';
  target: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_processed: number | string | null;
  progress_total: number | string | null;
  metadata: Record<string, unknown> | null;
};

export async function loadImportExportData(localeInput?: string): Promise<ImportExportLoadResult> {
  const locale = typeof localeInput === 'string' && localeInput.length > 0 ? localeInput : 'en';

  const capabilitiesResult = await listImportExportCapabilities();
  if (capabilitiesResult.ok === false) {
    return { ok: false, state: 'error' };
  }

  const capabilityByTarget = new Map(
    capabilitiesResult.data.capabilities.map((capability) => [capability.target, capability]),
  );

  const entities: LoaderEntity[] = [];
  const visiblePermissions = new Set<string>();
  let canImportAuthorizationPolicies = false;

  for (const key of CLIENT_ENTITY_KEYS) {
    const capability = capabilityByTarget.get(key);
    if (!capability) continue;

    const meta = ENTITY_META[key];
    const importSupported = capability.import.supported === true;
    const exportSupported = capability.export.supported === true;

    // Collect the permissions the caller actually holds so the client can
    // permission-filter the selector. A "supported" capability means the
    // registry already verified the caller holds the gating permission.
    const requiredPermissions: string[] = [];
    if (exportSupported && capability.export.permission) {
      requiredPermissions.push(capability.export.permission);
    } else if (importSupported && capability.import.permission) {
      requiredPermissions.push(capability.import.permission);
    }
    for (const permission of requiredPermissions) visiblePermissions.add(permission);

    if (key === 'authorization_policies' && importSupported) {
      canImportAuthorizationPolicies = true;
    }

    entities.push({
      key,
      label: meta.label,
      importSupported,
      exportSupported,
      requiredPermissions,
      templateAvailable: meta.templateAvailable && importSupported,
      processingMode: meta.processingMode,
      auditRequired: meta.auditRequired,
      ...(meta.referenceHandoffHref && importSupported
        ? { referenceHandoffHref: meta.referenceHandoffHref(locale) }
        : {}),
    });
  }

  let recentJobs: LoaderRecentJob[] = [];
  try {
    recentJobs = await withOrgContext(async ({ client }: { client: QueryClient }) => {
      const { rows } = await client.query<RecentJobRow>(
        `select id, kind, target, status, progress_processed, progress_total, metadata
           from public.import_export_jobs
          where org_id = app.current_org_id()
          order by created_at desc nulls last
          limit 30`,
      );
      return rows.map(mapRecentJob);
    });
  } catch {
    // Recent-jobs read failure must not collapse the whole hub: capabilities
    // already loaded. Surface an empty job list rather than the error state so
    // the entity selector / export controls stay usable.
    recentJobs = [];
  }

  return {
    ok: true,
    state: entities.length === 0 && recentJobs.length === 0 ? 'empty' : 'ready',
    entities,
    visiblePermissions: Array.from(visiblePermissions),
    recentJobs,
    canImportAuthorizationPolicies,
  };
}

function mapRecentJob(row: RecentJobRow): LoaderRecentJob {
  const processed = toNumber(row.progress_processed);
  const auditReason = readAuditReason(row.metadata);
  return {
    id: row.id,
    entity: ENTITY_META[row.target as LoaderEntityKey]?.label ?? row.target,
    type: row.kind,
    status: row.status,
    rows: processed,
    ...(auditReason ? { auditReason } : {}),
  };
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readAuditReason(metadata: Record<string, unknown> | null): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const reason = (metadata as { auditReason?: unknown }).auditReason;
  return typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : undefined;
}
