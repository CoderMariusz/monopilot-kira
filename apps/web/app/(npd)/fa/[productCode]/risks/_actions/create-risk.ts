'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const RISK_WRITE_PERMISSION = 'npd.risk.write';
const APP_VERSION = 'risk-actions-v1';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

export type CreateRiskInput = {
  productCode: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  mitigation?: string | null;
  ownerUserId?: string | null;
};

export type CreateRiskResult =
  | { ok: true; riskId: string }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED' };

export async function createRisk(input: CreateRiskInput): Promise<CreateRiskResult> {
  const parsed = parseCreateRiskInput(input);
  if (!parsed) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<CreateRiskResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasRiskWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const inserted = await queryClient.query<{ id: string }>(
        `insert into public.risks (
           org_id, product_code, title, description, likelihood, impact,
           mitigation, owner_user_id, created_by_user, app_version
         )
         values (
           app.current_org_id(), $1, $2, $3, $4::integer, $5::integer,
           $6, $7::uuid, $8::uuid, $9
         )
         returning id`,
        [
          parsed.productCode,
          parsed.title,
          parsed.description,
          parsed.likelihood,
          parsed.impact,
          parsed.mitigation,
          parsed.ownerUserId,
          userId,
          APP_VERSION,
        ],
      );

      const riskId = inserted.rows[0]?.id;
      if (!riskId) return { ok: false, code: 'PERSISTENCE_FAILED' };

      const requestId = randomUUID();
      await writeRiskAudit(queryClient, {
        orgId,
        userId,
        riskId,
        action: 'risk.created',
        beforeState: null,
        afterState: {
          product_code: parsed.productCode,
          title: parsed.title,
          description: parsed.description,
          likelihood: parsed.likelihood,
          impact: parsed.impact,
          mitigation: parsed.mitigation,
          owner_user_id: parsed.ownerUserId,
        },
        requestId,
      });

      await queryClient.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4, $5::jsonb, $6)`,
        [
          orgId,
          'risk.created',
          'risk',
          riskId,
          JSON.stringify({
            org_id: orgId,
            product_code: parsed.productCode,
            risk_id: riskId,
            title: parsed.title,
            actor_user_id: userId,
            request_id: requestId,
          }),
          APP_VERSION,
        ],
      );

      revalidatePath('/[locale]/fg/[productCode]/risks', 'page');
      return { ok: true, riskId };
    } catch {
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

async function hasRiskWritePermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, RISK_WRITE_PERMISSION],
  );
  return (rowCount ?? rows.length) > 0;
}

function parseCreateRiskInput(input: CreateRiskInput | null | undefined): CreateRiskInput | null {
  if (!input || typeof input !== 'object') return null;
  const productCode = normalizeText(input.productCode);
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  const likelihood = input.likelihood;
  const impact = input.impact;
  if (!productCode || !title || !description) return null;
  if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 3) return null;
  if (!Number.isInteger(impact) || impact < 1 || impact > 3) return null;

  return {
    productCode,
    title,
    description,
    likelihood,
    impact,
    mitigation: normalizeNullableText(input.mitigation),
    ownerUserId: normalizeNullableText(input.ownerUserId),
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizeText(value);
}

async function writeRiskAudit(
  client: QueryClient,
  input: {
    orgId: string;
    userId: string;
    riskId: string;
    action: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
    requestId: string;
  },
) {
  await client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'risk', $4, $5::jsonb, $6::jsonb, $7::uuid, 'operational')`,
    [
      input.orgId,
      input.userId,
      input.action,
      input.riskId,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      JSON.stringify(input.afterState),
      input.requestId,
    ],
  );
}
