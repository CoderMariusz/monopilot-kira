'use server';

/**
 * ROADMAP 2.6 — org compliance profile (BRCGS site code, certification body/grade,
 * audit dates, named registration numbers) for document-engine headers.
 *
 * Permission gate: settings.org.update (seeded to org-admin in
 * packages/db/migrations/150-settings-rbac-matrix-seed.sql:87 and
 * packages/db/migrations/244-settings-admin-permission-grants.sql:42).
 */
import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import { COMPLIANCE_PROFILE_SELECT, mapComplianceProfileRow } from './compliance-profile-read';
import type {
  ComplianceProfileRow,
  GetComplianceProfileResult,
  UpsertComplianceProfileInput,
  UpsertComplianceProfileResult,
} from './compliance-profile.types';

const UPDATE_PERMISSION = 'settings.org.update';
const COMPLIANCE_ROUTE = '/settings/compliance';

class ComplianceAbort extends Error {
  constructor(readonly result: UpsertComplianceProfileResult) {
    super('compliance_abort');
  }
}

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

const optionalDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(''), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null || value === '') return null;
    return value;
  });

const upsertComplianceProfileSchema = z
  .object({
    brcgsSiteCode: z.string().trim().max(64),
    certificationBody: z.string().trim().max(200),
    certificationGrade: z.string().trim().max(64),
    lastAuditDate: optionalDateSchema,
    nextAuditDate: optionalDateSchema,
    registrations: z.record(z.string().trim().min(1).max(120), z.string().trim().max(200)),
  })
  .strict();

function revalidateComplianceRoute() {
  try {
    revalidateLocalized(COMPLIANCE_ROUTE);
  } catch {
    /* no request store (test/non-request context) */
  }
}

async function loadComplianceProfileRow(context: OrgContextLike): Promise<ComplianceProfileRow | null> {
  const { rows } = await context.client.query<ComplianceProfileRow>(
    `select ${COMPLIANCE_PROFILE_SELECT}
       from public.org_compliance_profile
      where org_id = $1::uuid
      limit 1`,
    [context.orgId],
  );
  return rows[0] ?? null;
}

export async function getComplianceProfile(): Promise<GetComplianceProfileResult> {
  try {
    return await withOrgContext<GetComplianceProfileResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasPermission(context, UPDATE_PERMISSION);
      const row = await loadComplianceProfileRow(context);
      return {
        state: 'ready',
        profile: row ? mapComplianceProfileRow(row) : null,
        canEdit,
      };
    });
  } catch (error) {
    console.error(
      '[settings/compliance] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', canEdit: false };
  }
}

export async function upsertComplianceProfile(
  rawInput: UpsertComplianceProfileInput,
): Promise<UpsertComplianceProfileResult> {
  const parsed = upsertComplianceProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid' };
  }
  const input = parsed.data;

  try {
    return await withOrgContext<UpsertComplianceProfileResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, UPDATE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<ComplianceProfileRow>(
        `insert into public.org_compliance_profile
           (org_id, brcgs_site_code, certification_body, certification_grade,
            last_audit_date, next_audit_date, registrations, updated_by)
         values ($1::uuid, $2, $3, $4, $5::date, $6::date, $7::jsonb, $8::uuid)
         on conflict (org_id) do update
           set brcgs_site_code = excluded.brcgs_site_code,
               certification_body = excluded.certification_body,
               certification_grade = excluded.certification_grade,
               last_audit_date = excluded.last_audit_date,
               next_audit_date = excluded.next_audit_date,
               registrations = excluded.registrations,
               updated_by = excluded.updated_by,
               updated_at = pg_catalog.now()
         returning ${COMPLIANCE_PROFILE_SELECT}`,
        [
          context.orgId,
          input.brcgsSiteCode || null,
          input.certificationBody || null,
          input.certificationGrade || null,
          input.lastAuditDate,
          input.nextAuditDate,
          JSON.stringify(input.registrations),
          context.userId,
        ],
      );

      const row = rows[0];
      if (!row) throw new ComplianceAbort({ ok: false, error: 'persistence_failed' });

      revalidateComplianceRoute();
      return { ok: true, profile: mapComplianceProfileRow(row) };
    });
  } catch (error) {
    if (error instanceof ComplianceAbort) return error.result;
    return { ok: false, error: 'persistence_failed' };
  }
}
