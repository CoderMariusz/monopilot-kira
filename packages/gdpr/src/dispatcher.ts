import { randomUUID } from 'node:crypto';
import type pg from 'pg';

import { getRegisteredHandlers } from './registry';
import type {
  ErasureContext,
  ErasureHandler,
  ErasureResult,
  ErasureRunOptions,
  ErasureRunReport,
} from './types';

const ERASURE_REASON = 'gdpr-rtbf' as const;

interface RegisteredHandler {
  domain: string;
  handler: ErasureHandler;
}

interface AuditInput {
  action: 'gdpr.erasure.completed' | 'gdpr.erasure.failed' | 'gdpr.erasure.dry_run';
  orgId: string;
  subjectId: string;
  requestId: string;
  afterState: Record<string, unknown>;
}

function selectHandlers(domains?: string[]): RegisteredHandler[] {
  const registry = getRegisteredHandlers();
  const selected: RegisteredHandler[] = [];

  if (domains) {
    for (const domain of domains) {
      const handler = registry.get(domain);
      if (!handler) {
        throw new Error(`No GDPR erasure handler registered for domain "${domain}"`);
      }
      selected.push({ domain, handler });
    }
    return selected;
  }

  for (const [domain, handler] of registry.entries()) {
    selected.push({ domain, handler });
  }
  return selected;
}

function aggregateReport(
  orgId: string,
  subjectId: string,
  dryRun: boolean,
  results: ErasureResult[],
): ErasureRunReport {
  const tableSet = new Set<string>();
  const warnings: string[] = [];
  let rowsAffected = 0;

  for (const result of results) {
    rowsAffected += result.rowsAffected;
    for (const table of result.tablesTouched) tableSet.add(table);
    for (const warning of result.warnings) warnings.push(warning);
  }

  return {
    orgId,
    subjectId,
    reason: ERASURE_REASON,
    dryRun,
    results,
    rowsAffected,
    tablesTouched: Array.from(tableSet),
    warnings,
  };
}

async function setOrgContext(client: pg.PoolClient, orgId: string, sessionToken: string): Promise<void> {
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
}

async function registerOrgContext(
  ownerPool: pg.Pool,
  orgId: string,
  sessionToken: string,
): Promise<void> {
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)`,
    [sessionToken, orgId],
  );
}

async function clearOrgContext(ownerPool: pg.Pool, sessionToken: string): Promise<void> {
  await ownerPool
    .query(`delete from app.session_org_contexts where session_token = $1::uuid`, [sessionToken])
    .catch(() => undefined);
}

async function writeAuditEvent(client: pg.PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `insert into public.audit_events (
       org_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       $1::uuid,
       'system',
       $2,
       'gdpr_erasure',
       $3,
       null,
       $4::jsonb,
       $5::uuid,
       'security'
     )`,
    [
      input.orgId,
      input.action,
      input.subjectId,
      JSON.stringify(input.afterState),
      input.requestId,
    ],
  );
}

async function writeFailureAudit(
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  orgId: string,
  subjectId: string,
  requestId: string,
  error: unknown,
): Promise<void> {
  const sessionToken = randomUUID();
  let client: pg.PoolClient | null = null;
  try {
    await registerOrgContext(ownerPool, orgId, sessionToken);
    client = await appPool.connect();
    await client.query('BEGIN');
    await setOrgContext(client, orgId, sessionToken);
    await writeAuditEvent(client, {
      action: 'gdpr.erasure.failed',
      orgId,
      subjectId,
      requestId,
      afterState: {
        orgId,
        subjectId,
        dryRun: false,
        error: serializeError(error),
      },
    });
    await client.query('COMMIT');
  } catch (auditError) {
    await client?.query('ROLLBACK').catch(() => undefined);
    throw auditError;
  } finally {
    client?.release();
    await clearOrgContext(ownerPool, sessionToken);
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: 'NonError',
    message: String(error),
  };
}

export async function runErasure(
  ownerPool: pg.Pool,
  appPool: pg.Pool,
  orgId: string,
  subjectId: string,
  opts: ErasureRunOptions = {},
): Promise<ErasureRunReport> {
  const dryRun = opts.dryRun ?? false;
  const selectedHandlers = selectHandlers(opts.domains);
  const requestId = randomUUID();
  const sessionToken = randomUUID();
  let client: pg.PoolClient | null = null;

  try {
    await registerOrgContext(ownerPool, orgId, sessionToken);
    client = await appPool.connect();
    await client.query('BEGIN');
    await setOrgContext(client, orgId, sessionToken);

    if (dryRun) {
      await client.query('SAVEPOINT gdpr_dry_run');
    }

    const results: ErasureResult[] = [];
    const ctx: ErasureContext = {
      orgId,
      subjectId,
      reason: ERASURE_REASON,
      tx: client,
      dryRun,
    };

    for (const { handler } of selectedHandlers) {
      results.push(await handler(ctx));
    }

    const report = aggregateReport(orgId, subjectId, dryRun, results);

    if (dryRun) {
      await client.query('ROLLBACK TO SAVEPOINT gdpr_dry_run');
    }

    await writeAuditEvent(client, {
      action: dryRun ? 'gdpr.erasure.dry_run' : 'gdpr.erasure.completed',
      orgId,
      subjectId,
      requestId,
      afterState: {
        ...report,
        domains: selectedHandlers.map((entry) => entry.domain),
      },
    });

    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    try {
      await writeFailureAudit(ownerPool, appPool, orgId, subjectId, requestId, error);
    } catch (auditError) {
      console.error('GDPR erasure failure audit write failed', auditError);
    }
    throw error;
  } finally {
    client?.release();
    await clearOrgContext(ownerPool, sessionToken);
  }
}
