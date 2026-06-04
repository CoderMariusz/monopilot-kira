import type pg from 'pg';

export const PROJECT_CREATE_PERMISSION = 'npd.project.create';
export const PROJECT_VIEW_PERMISSION = 'npd.project.view';
export const PROJECT_CREATED_EVENT = 'npd.project.created';
export const LEGACY_STAGES_CLOSED_EVENT = 'npd.project.legacy_stages_closed' as const;
export const PROJECT_CODE_SEQUENCE = 'npd_project_code';
export const DEFAULT_TEMPLATE_ID = 'APEX_DEFAULT';

export type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type ProjectPriority = 'high' | 'normal' | 'low';
export type ProjectGate = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'Launched';
export type ChecklistGate = Exclude<ProjectGate, 'Launched'>;

export async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
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

export function trimOptionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed.length > 0 ? trimmed : null;
}

export function parsePriority(value: unknown): ProjectPriority | null {
  if (value === undefined || value === null || value === '') return 'normal';
  return value === 'high' || value === 'normal' || value === 'low' ? value : null;
}

export function parseGate(value: unknown): ProjectGate | null {
  if (value === undefined || value === null || value === '') return null;
  return value === 'G0' || value === 'G1' || value === 'G2' || value === 'G3' || value === 'G4' || value === 'Launched'
    ? value
    : null;
}

export function parseTargetLaunch(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? value : undefined;
}

export function normalizeSearch(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length > 100) return undefined;
  return trimmed.length > 0 ? trimmed : null;
}

export function mapProjectRow(row: ProjectRow): ProjectSummary {
  const total = Number(row.checklist_total);
  const completed = Number(row.checklist_completed);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    currentGate: row.current_gate,
    currentStage: row.current_stage,
    prio: row.prio,
    owner: row.owner,
    targetLaunch: row.target_launch,
    notes: row.notes,
    createdAt: row.created_at,
    progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    closeoutStatus: mapCloseoutStatus(row),
  };
}

function mapCloseoutStatus(row: ProjectRow): ProjectSummary['closeoutStatus'] {
  if (row.current_gate !== 'Launched') return null;
  if (!row.closeout_id) {
    return {
      trial: false,
      pilot: false,
      handoff: false,
      packaging: false,
      warningCode: 'HANDOFF_BOM_NOT_APPROVED',
    };
  }
  const trial = row.trial_shelf_life_set === true && row.trial_allergens_cascade_recomputed_at !== null;
  const pilot = row.pilot_wo_id !== null;
  const handoff = row.handoff_g4_esign_id !== null && row.handoff_bom_header_id !== null;
  const packaging = row.packaging_mrp_complete === true;
  return {
    trial,
    pilot,
    handoff,
    packaging,
    warningCode:
      !trial ? 'TRIAL_SHELF_LIFE_MISSING'
      : !pilot ? 'PILOT_WO_NOT_LINKED'
      : !handoff ? 'HANDOFF_BOM_NOT_APPROVED'
      : !packaging ? 'PACKAGING_MRP_INCOMPLETE'
      : null,
  };
}

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  current_gate: ProjectGate;
  current_stage: string;
  prio: ProjectPriority;
  owner: string | null;
  target_launch: string | null;
  notes: string | null;
  created_at: string;
  checklist_total: string | number;
  checklist_completed: string | number;
  closeout_id: string | null;
  trial_shelf_life_set: boolean | null;
  trial_allergens_cascade_recomputed_at: string | null;
  pilot_wo_id: string | null;
  handoff_g4_esign_id: string | null;
  handoff_bom_header_id: string | null;
  packaging_mrp_complete: boolean | null;
};

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  type: string;
  currentGate: ProjectGate;
  currentStage: string;
  prio: ProjectPriority;
  owner: string | null;
  targetLaunch: string | null;
  notes: string | null;
  createdAt: string;
  progressPercent: number;
  closeoutStatus: {
    trial: boolean;
    pilot: boolean;
    handoff: boolean;
    packaging: boolean;
    warningCode?:
      | 'TRIAL_SHELF_LIFE_MISSING'
      | 'PILOT_WO_NOT_LINKED'
      | 'HANDOFF_BOM_NOT_APPROVED'
      | 'PACKAGING_MRP_INCOMPLETE'
      | 'ALREADY_CLOSED'
      | null;
  } | null;
};
