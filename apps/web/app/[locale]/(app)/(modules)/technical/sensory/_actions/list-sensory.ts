'use server';

/**
 * T-092 — 03-technical Sensory Evaluation: list Server Action.
 *
 * Org-scoped, RLS-enforced read of public.technical_sensory_evaluations
 * (migration 166 — the T-084 read-model table) through withOrgContext
 * (`app.current_org_id()`). No service-role bypass, no mocks/hardcode.
 *
 * This is the READ side of the Technical-owned sensory read model only:
 *   - It maps each row through the pure T-084 `toSensoryReadModel` contract so the
 *     screen + the read-only NPD badge surface the exact same derived state
 *     (status, releaseBlocked, SENSORIAL_BLOCKED reason).
 *   - It NEVER writes sensory and NEVER moves NPD gate ownership into Technical.
 *
 * RBAC: sensory is a read-only Technical surface. A caller is allowed to view it
 * when they hold ANY permission in the technical.* family (the same org-admin
 * family migration 154 seeds). A user with no technical permission gets the
 * permission-denied state with NO data leak (`accessDenied: true`, empty rows).
 */

import {
  type SensoryReadModel,
  type SensoryStatus,
  toSensoryReadModel,
} from '../../../../../../../lib/technical/sensory';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasAnyTechnicalAccess,
  type OrgActionContext,
  type QueryClient,
  type SensorySubjectType,
} from './shared';

export type SensoryListItem = {
  id: string;
  subjectType: SensorySubjectType;
  subjectRef: string;
  subjectItemCode: string | null;
  subjectItemName: string | null;
  policyRequired: boolean;
  evaluatedAt: string | null;
  evaluatedByName: string | null;
  readModel: SensoryReadModel;
};

export type ListSensoryState = 'ready' | 'empty' | 'error' | 'denied';

export type ListSensoryResult = {
  rows: SensoryListItem[];
  state: ListSensoryState;
  counts: {
    total: number;
    blocked: number;
    pending: number;
    notRequired: number;
  };
};

type SensoryRow = {
  id: string;
  subject_type: string;
  subject_ref: string;
  status: string;
  status_reason: string | null;
  policy_required: boolean;
  evaluated_at: string | Date | null;
  subject_item_code: string | null;
  subject_item_name: string | null;
  evaluated_by_name: string | null;
};

const SUBJECT_TYPES = new Set<SensorySubjectType>(['product', 'project', 'work_order', 'item']);

function mapRow(row: SensoryRow): SensoryListItem | null {
  if (!SUBJECT_TYPES.has(row.subject_type as SensorySubjectType)) return null;
  const readModel = toSensoryReadModel({
    status: row.status as SensoryStatus,
    policyRequired: row.policy_required,
    statusReason: row.status_reason,
  });
  return {
    id: String(row.id),
    subjectType: row.subject_type as SensorySubjectType,
    subjectRef: row.subject_ref,
    subjectItemCode: row.subject_item_code,
    subjectItemName: row.subject_item_name,
    policyRequired: row.policy_required,
    evaluatedAt:
      row.evaluated_at instanceof Date
        ? row.evaluated_at.toISOString()
        : row.evaluated_at
          ? String(row.evaluated_at)
          : null,
    evaluatedByName: row.evaluated_by_name,
    readModel,
  };
}

function emptyCounts() {
  return { total: 0, blocked: 0, pending: 0, notRequired: 0 };
}

export async function listSensory(): Promise<ListSensoryResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListSensoryResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };

      if (!(await hasAnyTechnicalAccess(ctx))) {
        return { rows: [], state: 'denied', counts: emptyCounts() };
      }

      const result = await (client as QueryClient).query<SensoryRow>(
        `select se.id,
                se.subject_type,
                se.subject_ref,
                se.status,
                se.status_reason,
                se.policy_required,
                se.evaluated_at,
                it.item_code as subject_item_code,
                it.name      as subject_item_name,
                u.name       as evaluated_by_name
           from public.technical_sensory_evaluations se
           left join public.items it
                  on it.id = se.subject_item_id
                 and it.org_id = app.current_org_id()
           left join public.users u
                  on u.id = se.evaluated_by
          where se.org_id = app.current_org_id()
          order by
            case se.status
              when 'fail' then 0
              when 'hold' then 1
              when 'required' then 2
              when 'pending' then 3
              when 'pass' then 4
              else 5
            end,
            se.subject_ref asc`,
      );

      const rows = result.rows
        .map(mapRow)
        .filter((r): r is SensoryListItem => r !== null);

      const counts = {
        total: rows.length,
        blocked: rows.filter((r) => r.readModel.releaseBlocked).length,
        pending: rows.filter((r) => r.readModel.status === 'required' || r.readModel.status === 'pending')
          .length,
        notRequired: rows.filter((r) => r.readModel.status === 'not_required').length,
      };

      return {
        rows,
        state: rows.length ? 'ready' : 'empty',
        counts,
      };
    });
  } catch (error) {
    console.error('[technical/sensory] listSensory load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { rows: [], state: 'error', counts: emptyCounts() };
  }
}
