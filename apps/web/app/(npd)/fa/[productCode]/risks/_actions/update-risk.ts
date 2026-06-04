'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const RISK_WRITE_PERMISSION = 'npd.risk.write';

type RiskState = 'Open' | 'Mitigated' | 'Closed';
type RiskRow = {
  id: string;
  product_code: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  bucket: string;
  state: RiskState;
  mitigation: string | null;
  owner_user_id: string | null;
  closed_at: string | null;
  closed_by_user: string | null;
};
type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

export type UpdateRiskInput = {
  productCode: string;
  riskId: string;
  patch?: {
    title?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    mitigation?: string | null;
    ownerUserId?: string | null;
  };
  transition?: {
    toState: RiskState;
    reason: string;
  };
};

export type UpdateRiskResult =
  | { ok: true; riskId: string; state: RiskState }
  | {
      ok: false;
      code:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'RISK_NOT_FOUND'
        | 'REASON_TOO_SHORT'
        | 'INVALID_TRANSITION'
        | 'PERSISTENCE_FAILED';
    };

type ParsedUpdateRiskInput = Omit<UpdateRiskInput, 'patch'> & {
  patch: {
    title?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    mitigation?: string | null;
    ownerUserId?: string | null;
  };
};

export async function updateRisk(input: UpdateRiskInput): Promise<UpdateRiskResult> {
  const parsed = parseUpdateRiskInput(input);
  if (!parsed) return { ok: false, code: 'INVALID_INPUT' };

  if (parsed.transition && parsed.transition.reason.trim().length < 10) {
    return { ok: false, code: 'REASON_TOO_SHORT' };
  }

  return withOrgContext<UpdateRiskResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;

    try {
      if (!(await hasRiskWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const currentResult = await queryClient.query<RiskRow>(
        `select id, product_code, title, description, likelihood, impact, bucket, state,
                mitigation, owner_user_id, closed_at, closed_by_user
           from public.risks
          where org_id = app.current_org_id()
            and product_code = $1
            and id = $2::uuid
          limit 1`,
        [parsed.productCode, parsed.riskId],
      );
      const current = currentResult.rows[0];
      if (!current) return { ok: false, code: 'RISK_NOT_FOUND' };

      const nextState = parsed.transition?.toState ?? current.state;
      if (parsed.transition && !isAllowedTransition(current.state, nextState)) {
        return { ok: false, code: 'INVALID_TRANSITION' };
      }

      const updated = await queryClient.query<RiskRow>(
        `update public.risks
            set title = coalesce($3, title),
                description = coalesce($4, description),
                likelihood = coalesce($5::integer, likelihood),
                impact = coalesce($6::integer, impact),
                mitigation = coalesce($7, mitigation),
                owner_user_id = coalesce($8::uuid, owner_user_id),
                state = $9,
                closed_at = case when $9 = 'Closed' then coalesce(closed_at, now()) else null end,
                closed_by_user = case when $9 = 'Closed' then $10::uuid else null end
          where org_id = app.current_org_id()
            and product_code = $1
            and id = $2::uuid
        returning id, product_code, title, description, likelihood, impact, bucket, state,
                  mitigation, owner_user_id, closed_at, closed_by_user`,
        [
          parsed.productCode,
          parsed.riskId,
          parsed.patch.title,
          parsed.patch.description,
          parsed.patch.likelihood,
          parsed.patch.impact,
          parsed.patch.mitigation,
          parsed.patch.ownerUserId,
          nextState,
          userId,
        ],
      );

      const row = updated.rows[0];
      if (!row) return { ok: false, code: 'RISK_NOT_FOUND' };

      await queryClient.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, $4, $5, $6::jsonb, $7::jsonb, $8::uuid, 'operational')`,
        [
          orgId,
          userId,
          parsed.transition ? 'risk.transitioned' : 'risk.updated',
          'risk',
          parsed.riskId,
          JSON.stringify(current),
          JSON.stringify({
            ...row,
            transition_reason: parsed.transition?.reason ?? null,
            previous_state: current.state,
          }),
          randomUUID(),
        ],
      );

      revalidatePath(`/npd/fa/${parsed.productCode}/risks`);
      return { ok: true, riskId: row.id, state: row.state };
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

function parseUpdateRiskInput(input: UpdateRiskInput | null | undefined): ParsedUpdateRiskInput | null {
  if (!input || typeof input !== 'object') return null;
  const productCode = normalizeText(input.productCode);
  const riskId = normalizeText(input.riskId);
  if (!productCode || !riskId) return null;

  const patch = input.patch ?? {};
  const parsedPatch = {
    title: optionalText(patch.title),
    description: optionalText(patch.description),
    likelihood: optionalScore(patch.likelihood),
    impact: optionalScore(patch.impact),
    mitigation: optionalNullableText(patch.mitigation),
    ownerUserId: optionalNullableText(patch.ownerUserId),
  };
  if (parsedPatch.likelihood === false || parsedPatch.impact === false) return null;

  const transition = input.transition
    ? {
        toState: input.transition.toState,
        reason: normalizeText(input.transition.reason) ?? '',
      }
    : undefined;
  if (transition && !['Open', 'Mitigated', 'Closed'].includes(transition.toState)) return null;

  return {
    productCode,
    riskId,
    patch: {
      title: parsedPatch.title,
      description: parsedPatch.description,
      likelihood: parsedPatch.likelihood,
      impact: parsedPatch.impact,
      mitigation: parsedPatch.mitigation,
      ownerUserId: parsedPatch.ownerUserId,
    },
    transition,
  };
}

function isAllowedTransition(from: RiskState, to: RiskState): boolean {
  return (
    (from === 'Open' && to === 'Mitigated') ||
    (from === 'Mitigated' && to === 'Closed') ||
    (from === 'Closed' && to === 'Open')
  );
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : normalizeText(value) ?? undefined;
}

function optionalNullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return normalizeText(value);
}

function optionalScore(value: unknown): number | undefined | false {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3) return false;
  return value;
}
