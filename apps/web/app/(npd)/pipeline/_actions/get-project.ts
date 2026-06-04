'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  PROJECT_VIEW_PERMISSION,
  type ChecklistGate,
  type OrgContextLike,
  type ProjectRow,
  type ProjectSummary,
  hasPermission,
  mapProjectRow,
} from './shared';

export type ChecklistItem = {
  id: string;
  gateCode: ChecklistGate;
  categoryCode: string;
  itemText: string;
  required: boolean;
  completedAt: string | null;
  completedByUser: string | null;
  evidenceFile: string | null;
};

export type GateApprovalTimelineItem = {
  id: string;
  gateCode: ChecklistGate;
  decision: 'approved' | 'rejected';
  approverUserId: string;
  notes: string | null;
  rejectionReason: string | null;
  esignedAt: string | null;
  createdAt: string;
};

export type GetProjectResult =
  | {
      ok: true;
      data: {
        project: ProjectSummary;
        checklistByGate: Record<ChecklistGate, ChecklistItem[]>;
        approvalsTimeline: GateApprovalTimelineItem[];
      };
    }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

type ChecklistItemRow = {
  id: string;
  gate_code: ChecklistGate;
  category_code: string;
  item_text: string;
  required: boolean;
  completed_at: string | null;
  completed_by_user: string | null;
  evidence_file: string | null;
};

type ApprovalRow = {
  id: string;
  gate_code: ChecklistGate;
  decision: 'approved' | 'rejected';
  approver_user_id: string;
  notes: string | null;
  rejection_reason: string | null;
  esigned_at: string | null;
  created_at: string;
};

const checklistGates: ChecklistGate[] = ['G0', 'G1', 'G2', 'G3', 'G4'];

export async function getProject(input: { projectId: string }): Promise<GetProjectResult> {
  const projectId = parseProjectId(input);
  if (!projectId) return { ok: false, error: 'INVALID_INPUT' };

  try {
    return await withOrgContext<GetProjectResult>(async (ctx): Promise<GetProjectResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, PROJECT_VIEW_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      const projectRows = await context.client.query<ProjectRow>(
        `select p.id,
                p.code,
                p.name,
                p.type,
                p.current_gate,
                p.current_stage,
                p.prio,
                p.owner,
                p.target_launch::text as target_launch,
                p.notes,
                p.created_at::text as created_at,
                count(gci.id)::text as checklist_total,
                count(gci.id) filter (where gci.completed_at is not null)::text as checklist_completed
           from public.npd_projects p
           left join public.gate_checklist_items gci
             on gci.project_id = p.id
            and gci.org_id = app.current_org_id()
          where p.org_id = app.current_org_id()
            and p.id = $1::uuid
          group by p.id
          limit 1`,
        [projectId],
      );
      const project = projectRows.rows[0];
      if (!project) return { ok: false, error: 'NOT_FOUND' };

      const [checklistRows, approvalsRows] = await Promise.all([
        context.client.query<ChecklistItemRow>(
          `select id,
                  gate_code,
                  category_code,
                  item_text,
                  required,
                  completed_at::text as completed_at,
                  completed_by_user::text as completed_by_user,
                  evidence_file
             from public.gate_checklist_items
            where org_id = app.current_org_id()
              and project_id = $1::uuid
            order by gate_code, created_at, id`,
          [projectId],
        ),
        context.client.query<ApprovalRow>(
          `select id,
                  gate_code,
                  decision,
                  approver_user_id::text as approver_user_id,
                  notes,
                  rejection_reason,
                  esigned_at::text as esigned_at,
                  created_at::text as created_at
             from public.gate_approvals
            where org_id = app.current_org_id()
              and project_id = $1::uuid
            order by created_at desc, id desc`,
          [projectId],
        ),
      ]);

      return {
        ok: true,
        data: {
          project: mapProjectRow(project),
          checklistByGate: groupChecklist(checklistRows.rows),
          approvalsTimeline: approvalsRows.rows.map(mapApproval),
        },
      };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}

function parseProjectId(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = (input as { projectId?: unknown }).projectId;
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function groupChecklist(rows: ChecklistItemRow[]): Record<ChecklistGate, ChecklistItem[]> {
  const grouped = checklistGates.reduce<Record<ChecklistGate, ChecklistItem[]>>(
    (acc, gate) => {
      acc[gate] = [];
      return acc;
    },
    {} as Record<ChecklistGate, ChecklistItem[]>,
  );
  for (const row of rows) {
    grouped[row.gate_code].push({
      id: row.id,
      gateCode: row.gate_code,
      categoryCode: row.category_code,
      itemText: row.item_text,
      required: row.required,
      completedAt: row.completed_at,
      completedByUser: row.completed_by_user,
      evidenceFile: row.evidence_file,
    });
  }
  return grouped;
}

function mapApproval(row: ApprovalRow): GateApprovalTimelineItem {
  return {
    id: row.id,
    gateCode: row.gate_code,
    decision: row.decision,
    approverUserId: row.approver_user_id,
    notes: row.notes,
    rejectionReason: row.rejection_reason,
    esignedAt: row.esigned_at,
    createdAt: row.created_at,
  };
}
