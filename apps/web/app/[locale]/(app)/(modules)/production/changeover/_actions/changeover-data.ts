/**
 * 08-Production — Changeover screen (read-only): org-scoped changeover event list.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/other-screens.jsx:298-397
 * (ChangeoverScreen). The prototype renders a single live changeover with its allergen
 * risk + dual sign-off gate; this read-only list surfaces every changeover_events row
 * with its risk badge (low/medium/high/segregated) + sign-off status, replacing the
 * mock with real Supabase reads (changeover_events ⋈ work_orders, migration 184). No mocks.
 *
 * Every read runs inside `withOrgContext` — RLS scopes to the signed-in org. Gated
 * server-side on `production.oee.read` (migration 185) like the dashboard loader.
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

/** changeover_events.risk_level (migration 184). */
export type ChangeoverRisk = 'low' | 'medium' | 'high' | 'segregated';

export type SignOffStatus = 'pending' | 'first_signed' | 'completed' | string;

export type ChangeoverEventRow = {
  id: string;
  lineId: string;
  woFromNumber: string | null;
  woToNumber: string | null;
  allergenFrom: string[];
  allergenTo: string[];
  riskLevel: ChangeoverRisk;
  startedAt: string;
  completedAt: string | null;
  cleaningCompleted: boolean;
  atpRequired: boolean;
  signOffStatus: SignOffStatus;
  isOpen: boolean;
};

export type ChangeoverScreenData = {
  eventCount: number;
  /** count where completed_at IS NULL (in-progress). */
  openCount: number;
  /** count where risk_level in (high, segregated). */
  highRiskCount: number;
  events: ChangeoverEventRow[];
};

export type ChangeoverScreenResult =
  | { ok: true; data: ChangeoverScreenData }
  | { ok: false; reason: 'forbidden' | 'error' };

async function hasPermission(
  c: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await c.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

const RISK_VALUES: ChangeoverRisk[] = ['low', 'medium', 'high', 'segregated'];

export async function getChangeoverScreen(): Promise<ChangeoverScreenResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ChangeoverScreenResult> => {
      const c = client as QueryClient;

      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      const kpiRes = await c.query<{ event_count: number; open_count: number; high_risk_count: number }>(
        `select count(*)::int as event_count,
                count(*) filter (where completed_at is null)::int as open_count,
                count(*) filter (where risk_level in ('high', 'segregated'))::int as high_risk_count
           from public.changeover_events
          where org_id = app.current_org_id()`,
      );
      const eventCount = kpiRes.rows[0]?.event_count ?? 0;
      const openCount = kpiRes.rows[0]?.open_count ?? 0;
      const highRiskCount = kpiRes.rows[0]?.high_risk_count ?? 0;

      const eventsRes = await c.query<{
        id: string;
        line_id: string;
        wo_from_number: string | null;
        wo_to_number: string | null;
        allergen_from: string[] | null;
        allergen_to: string[] | null;
        risk_level: string;
        started_at: string;
        completed_at: string | null;
        cleaning_completed: boolean;
        atp_required: boolean;
        dual_sign_off_status: string;
      }>(
        `select ce.id::text as id,
                ce.line_id,
                wf.wo_number as wo_from_number,
                wt.wo_number as wo_to_number,
                ce.allergen_from,
                ce.allergen_to,
                ce.risk_level,
                ce.started_at,
                ce.completed_at,
                ce.cleaning_completed,
                ce.atp_required,
                ce.dual_sign_off_status
           from public.changeover_events ce
           left join public.work_orders wf
             on wf.id = ce.wo_from_id and wf.org_id = ce.org_id
           left join public.work_orders wt
             on wt.id = ce.wo_to_id and wt.org_id = ce.org_id
          where ce.org_id = app.current_org_id()
          order by ce.started_at desc
          limit 100`,
      );
      const events: ChangeoverEventRow[] = eventsRes.rows.map((r) => ({
        id: r.id,
        lineId: r.line_id,
        woFromNumber: r.wo_from_number,
        woToNumber: r.wo_to_number,
        allergenFrom: Array.isArray(r.allergen_from) ? r.allergen_from : [],
        allergenTo: Array.isArray(r.allergen_to) ? r.allergen_to : [],
        riskLevel: RISK_VALUES.includes(r.risk_level as ChangeoverRisk) ? (r.risk_level as ChangeoverRisk) : 'low',
        startedAt: r.started_at,
        completedAt: r.completed_at,
        cleaningCompleted: Boolean(r.cleaning_completed),
        atpRequired: Boolean(r.atp_required),
        signOffStatus: r.dual_sign_off_status,
        isOpen: r.completed_at === null,
      }));

      return { ok: true, data: { eventCount, openCount, highRiskCount, events } };
    });
  } catch (error) {
    console.error('[production/changeover] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}
