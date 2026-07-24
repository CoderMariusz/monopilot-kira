/**
 * G4 signed-definition freeze — single authoritative source for read + write guards.
 *
 * Policy (PF-R04-02, narrowed to G4): once a G4 gate approval is e-signed with a
 * verified receipt, physical / costing / label-defining brief fields are frozen until
 * the approval is superseded via revert-npd-gate.
 */

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const G4_DEFINITION_FREEZE_GATE = 'G4' as const;

/** npd_projects columns guarded after a verified G4 e-sign approval. */
export const PROTECTED_NPD_PROJECT_COLUMNS = [
  'name',
  'type',
  'target_launch',
  'pack_format',
  'pack_weight_g',
  'packs_per_case',
  'output_unit',
  'weekly_volume_packs',
  'runs_per_week',
  'marketing_claims',
  'target_retail_price_eur',
  'sales_channel',
  'target_audience',
  'constraints',
] as const;

export type ProtectedNpdProjectColumn = (typeof PROTECTED_NPD_PROJECT_COLUMNS)[number];

const PROTECTED_COLUMN_SET = new Set<string>(PROTECTED_NPD_PROJECT_COLUMNS);

/** FA catalog field codes that write protected npd_projects columns. */
const PROTECTED_FA_FIELD_CODES = new Set<string>([
  'product_name',
  ...PROTECTED_NPD_PROJECT_COLUMNS,
]);

export function isProtectedNpdProjectColumn(column: string): column is ProtectedNpdProjectColumn {
  return PROTECTED_COLUMN_SET.has(column);
}

export function isProtectedFaFieldCode(fieldCode: string): boolean {
  return PROTECTED_FA_FIELD_CODES.has(fieldCode.trim().toLowerCase());
}

/**
 * SQL predicate: true when the project has an active, verified G4 e-sign approval.
 * Used by read/write guards — must stay aligned with migration 517 trigger logic.
 */
export const ACTIVE_VERIFIED_G4_APPROVAL_EXISTS_SQL = `
  select true as ok
    from public.gate_approvals ga
    left join public.npd_projects p
      on p.id = ga.project_id
     and p.org_id = ga.org_id
   where ga.org_id = app.current_org_id()
     and ga.project_id = $1::uuid
     and ga.gate_code = 'G4'
     and ga.decision = 'approved'
     and ga.superseded_at is null
     and ga.esigned_at is not null
     and (
       ga.signature_id is not null
       or (
         ga.signature_id is null
         and exists (
           select 1
             from public.e_sign_log esl
            where esl.org_id = ga.org_id
              and esl.signer_user_id = ga.approver_user_id
              and esl.intent = 'npd.gate.approved'
              and esl.subject_hash = public.npd_gate_approval_subject_hash(
                ga.project_id,
                coalesce(p.code, ga.project_code),
                ga.gate_code,
                ga.decision
              )
            group by esl.org_id, esl.signer_user_id, esl.intent, esl.subject_hash
           having count(*) = 1
         )
       )
     )
   limit 1`;

type OrgQueryClient = { client: QueryClient };

export async function hasActiveVerifiedG4Approval(
  ctx: OrgQueryClient,
  projectId: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(ACTIVE_VERIFIED_G4_APPROVAL_EXISTS_SQL, [
    projectId,
  ]);
  return rows.length > 0;
}

export class DefinitionFrozenError extends Error {
  readonly code = 'SIGNED_DEFINITION_FROZEN' as const;

  constructor(message = 'Product definition is frozen after a signed G4 gate approval.') {
    super(message);
    this.name = 'DefinitionFrozenError';
  }
}

export async function assertProjectDefinitionEditable(
  ctx: OrgQueryClient,
  projectId: string,
): Promise<void> {
  if (await hasActiveVerifiedG4Approval(ctx, projectId)) {
    throw new DefinitionFrozenError();
  }
}
