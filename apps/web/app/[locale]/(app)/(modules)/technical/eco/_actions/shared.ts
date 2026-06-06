import { z } from 'zod';

export const ECO_WRITE_PERMISSION = 'technical.eco.write';
export const ECO_APPROVE_PERMISSION = 'technical.eco.approve';

export const ECO_STATUSES = ['draft', 'approved', 'implementing', 'closed'] as const;
export type EcoStatus = (typeof ECO_STATUSES)[number];
export type EcoStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type EcoActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'invalid_state'
  | 'persistence_failed';

const OptionalUuid = z.string().uuid().optional().nullable();
const JsonRecord = z.record(z.string(), z.unknown());

export const EcoLineInput = z.object({
  lineNo: z.number().int().min(1),
  action: z.enum(['add', 'change', 'remove', 'replace', 'deprecate']),
  targetType: z.enum(['item', 'bom_header', 'bom_line', 'factory_spec', 'routing', 'document', 'other']),
  targetId: OptionalUuid,
  fieldName: z.string().trim().min(1).max(128).optional().nullable(),
  beforeValue: z.unknown().optional().nullable(),
  afterValue: z.unknown().optional().nullable(),
  rationale: z.string().trim().max(2000).optional().nullable(),
});
export type EcoLineInputType = z.input<typeof EcoLineInput>;

const EcoHeaderInput = z.object({
  code: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  changeType: z
    .enum(['engineering', 'bom', 'spec', 'item', 'process', 'packaging', 'regulatory'])
    .optional()
    .default('engineering'),
  requesterUserId: OptionalUuid,
  targetItemId: OptionalUuid,
  targetBomHeaderId: OptionalUuid,
  targetFactorySpecId: OptionalUuid,
  impactSummary: z.string().trim().max(4000).optional().nullable(),
  requestedEffectiveAt: z.string().datetime({ offset: true }).optional().nullable(),
  extJsonb: JsonRecord.optional().default({}),
  lines: z.array(EcoLineInput).min(1),
});

export const CreateEcoInput = EcoHeaderInput.refine(
  (v) => v.targetItemId || v.targetBomHeaderId || v.targetFactorySpecId,
  {
    message: 'an ECO must target an item, BOM, or factory spec',
  },
);
export type CreateEcoInputType = z.input<typeof CreateEcoInput>;

export const UpdateEcoDraftInput = EcoHeaderInput.extend({
  id: z.string().uuid(),
}).refine((v) => v.targetItemId || v.targetBomHeaderId || v.targetFactorySpecId, {
  message: 'an ECO must target an item, BOM, or factory spec',
});
export type UpdateEcoDraftInputType = z.input<typeof UpdateEcoDraftInput>;

export const GetEcoInput = z.object({ id: z.string().uuid() });
export type GetEcoInputType = z.input<typeof GetEcoInput>;

export const ListEcoInput = z.object({
  status: z.enum(ECO_STATUSES).optional(),
  targetItemId: OptionalUuid,
  limit: z.number().int().min(1).max(100).optional().default(50),
});
export type ListEcoInputType = z.input<typeof ListEcoInput>;

export const ApproveEcoInput = z.object({
  id: z.string().uuid(),
  comment: z.string().trim().max(2000).optional().nullable(),
});
export type ApproveEcoInputType = z.input<typeof ApproveEcoInput>;

export const TransitionEcoInput = z.object({
  id: z.string().uuid(),
  comment: z.string().trim().max(2000).optional().nullable(),
});
export type TransitionEcoInputType = z.input<typeof TransitionEcoInput>;

export type EcoLine = {
  id: string;
  lineNo: number;
  action: string;
  targetType: string;
  targetId: string | null;
  fieldName: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  rationale: string | null;
};

export type EcoSummary = {
  id: string;
  code: string;
  title: string;
  status: EcoStatus;
  statusTone: EcoStatusTone;
  priority: string;
  changeType: string;
  targetItemId: string | null;
  targetBomHeaderId: string | null;
  targetFactorySpecId: string | null;
  updatedAt: string;
  lineCount: number;
};

export type EcoDetail = EcoSummary & {
  description: string | null;
  requesterUserId: string | null;
  approverUserId: string | null;
  impactSummary: string | null;
  requestedEffectiveAt: string | null;
  approvedAt: string | null;
  implementingAt: string | null;
  closedAt: string | null;
  lines: EcoLine[];
};

export type ListEcoResult =
  | { ok: true; data: { changeOrders: EcoSummary[] } }
  | { ok: false; error: EcoActionError; message?: string };

export type GetEcoResult =
  | { ok: true; data: EcoDetail }
  | { ok: false; error: EcoActionError; message?: string };

export type MutateEcoResult =
  | { ok: true; data: { id: string; status: EcoStatus } }
  | { ok: false; error: EcoActionError; message?: string };

export async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
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
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export async function writeEcoAudit(
  client: QueryClient,
  params: {
    orgId: string;
    changeOrderId: string;
    actorUserId: string;
    action: string;
    fromStatus?: EcoStatus | null;
    toStatus?: EcoStatus | null;
    payload?: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.technical_change_order_audit
       (org_id, change_order_id, actor_user_id, action, from_status, to_status, payload)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)`,
    [
      params.orgId,
      params.changeOrderId,
      params.actorUserId,
      params.action,
      params.fromStatus ?? null,
      params.toStatus ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );

  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'technical_change_order', $4, null, $5::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.changeOrderId, JSON.stringify(params.payload ?? {})],
  );
}

export async function replaceEcoLines(
  client: QueryClient,
  changeOrderId: string,
  actorUserId: string,
  lines: readonly z.infer<typeof EcoLineInput>[],
): Promise<void> {
  await client.query(
    `delete from public.technical_change_order_lines
      where org_id = app.current_org_id()
        and change_order_id = $1::uuid`,
    [changeOrderId],
  );

  for (const line of lines) {
    await client.query(
      `insert into public.technical_change_order_lines
         (org_id, change_order_id, line_no, action, target_type, target_id, field_name,
          before_value, after_value, rationale, created_by)
       values
         (app.current_org_id(), $1::uuid, $2::integer, $3, $4, $5::uuid, $6,
          $7::jsonb, $8::jsonb, $9, $10::uuid)`,
      [
        changeOrderId,
        line.lineNo,
        line.action,
        line.targetType,
        line.targetId ?? null,
        line.fieldName ?? null,
        line.beforeValue === undefined ? null : JSON.stringify(line.beforeValue),
        line.afterValue === undefined ? null : JSON.stringify(line.afterValue),
        line.rationale ?? null,
        actorUserId,
      ],
    );
  }
}
