'use server';

/**
 * T-090 — Release-bundle DATA loader (read model for the bundle approval panel).
 *
 * Loads everything the FactorySpec + BOM bundle approval panel renders, all from
 * REAL Supabase data under withOrgContext + RLS:
 *   - the paired factory_spec (mig 165) + shared-BOM SSOT header (mig 090) statuses,
 *   - the RM-usability / supplier_specs / release-guard blockers for the BOM lines,
 *   - the approval / rejection history (audit_log),
 *   - whether D365 integration is enabled (feature_flags_core) — informational only.
 *
 * This loader does NOT mutate anything and does NOT implement the approval logic:
 * the approve/reject server logic is T-080 (`approveReleaseBundleAction` /
 * `rejectReleaseBundleAction` in apps/web/actions/technical/release-bundles/*),
 * consumed by the panel. The blocker computation reuses the canonical T-074
 * `validateRmUsability` semantics on the migrated schema (active-item gate).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  guardBusinessFieldEdit,
  guardStatusTransition,
} from '../../../../../../../lib/technical/factory-spec-release-guards';
import {
  canApproveFactorySpec,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type BundleBlockerKind = 'rm' | 'rbac' | 'release' | 'supplier';
export type BundleBlockerSeverity = 'block' | 'warn' | 'info';

export type BundleBlocker = {
  kind: BundleBlockerKind;
  severity: BundleBlockerSeverity;
  /** Stable machine code (e.g. an RmUsabilityReasonCode) for traceability. */
  code: string;
  message: string;
};

export type BundleHistoryEntry = {
  at: string;
  who: string;
  action: string;
};

export type ReleaseBundleData = {
  factorySpecId: string;
  bomHeaderId: string | null;
  fg: { itemCode: string; name: string };
  spec: { specCode: string; version: number; status: string; source: string; lastEdit: string; owner: string };
  bom: { id: string | null; version: number | null; status: string | null; clonedFrom: string | null };
  bomOptions: Array<{ id: string; version: number; status: string; label: string }>;
  blockers: BundleBlocker[];
  history: BundleHistoryEntry[];
  /** True when the approved/released factory_spec row is immutable (clone-on-write). */
  cloneOnWrite: boolean;
  /** D365 integration flag (informational only — never blocks Technical approval). */
  d365Enabled: boolean;
  canApprove: boolean;
};

export type LoadBundleResult =
  | { ok: true; data: ReleaseBundleData }
  | { ok: false; error: 'not_found' | 'error' };

type SpecRow = {
  id: string;
  spec_code: string;
  version: number;
  status: string;
  source: string;
  bom_header_id: string | null;
  bom_version: number | null;
  fg_item_code: string;
  fg_name: string;
  approver: string | null;
  updated_at: string | Date;
};

type BomRow = {
  id: string;
  version: number;
  status: string;
  supersedes_version: number | null;
};

type AuditRow = {
  occurred_at: string | Date;
  actor: string | null;
  action: string;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function loadReleaseBundle(factorySpecId: string): Promise<LoadBundleResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LoadBundleResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      const db = client as QueryClient;

      const specResult = await db.query<SpecRow>(
        `select fs.id,
                fs.spec_code,
                fs.version,
                fs.status,
                fs.source,
                fs.bom_header_id,
                fs.bom_version,
                i.item_code as fg_item_code,
                i.name as fg_name,
                u.email as approver,
                fs.updated_at
           from public.factory_specs fs
           join public.items i on i.id = fs.fg_item_id
           left join public.users u on u.id = fs.created_by
          where fs.id = $1::uuid
            and fs.org_id = app.current_org_id()`,
        [factorySpecId],
      );
      const spec = specResult.rows[0];
      if (!spec) return { ok: false, error: 'not_found' };

      // Paired shared-BOM SSOT header (soft ref). null when no bundle paired yet.
      let bom: BomRow | null = null;
      if (spec.bom_header_id) {
        const bomResult = await db.query<BomRow>(
          `select bh.id,
                  bh.version,
                  bh.status,
                  parent.version as supersedes_version
             from public.bom_headers bh
             left join public.bom_headers parent on parent.id = bh.supersedes_bom_header_id
            where bh.id = $1::uuid
              and bh.org_id = app.current_org_id()`,
          [spec.bom_header_id],
        );
        bom = bomResult.rows[0] ?? null;
      }

      const bomOptionsResult = await db.query<{ id: string; version: number; status: string }>(
        `select bh.id, bh.version, bh.status
           from public.bom_headers bh
          where bh.org_id = app.current_org_id()
            and bh.product_id = $1
          order by
            case bh.status
              when 'in_review' then 0
              when 'draft' then 1
              when 'technical_approved' then 2
              when 'active' then 3
              else 4
            end,
            bh.version desc`,
        [spec.fg_item_code],
      );
      const bomOptions = bomOptionsResult.rows.map((row) => ({
        id: row.id,
        version: Number(row.version),
        status: row.status,
        label: `v${row.version} · ${row.status}`,
      }));

      // Blockers (read-only preflight). Authorization + release-guard + RM usability.
      const blockers: BundleBlocker[] = [];
      const canApprove = await canApproveFactorySpec(ctx);
      if (!canApprove) {
        blockers.push({
          kind: 'rbac',
          severity: 'block',
          code: 'TECHNICAL_APPROVAL_FORBIDDEN',
          message: 'You lack the Technical permission to approve this bundle.',
        });
      }

      // Release-guard: the bundle is the in_review -> approved_for_factory transition.
      // An already factory-usable (immutable) spec must clone-on-write, not re-approve.
      const editGuard = guardBusinessFieldEdit(spec.status);
      const cloneOnWrite = !editGuard.ok && editGuard.code === 'RELEASED_RECORD_IMMUTABLE';
      if (!cloneOnWrite) {
        const transition = guardStatusTransition(spec.status, 'approved_for_factory');
        if (!transition.ok) {
          blockers.push({
            kind: 'release',
            severity: 'block',
            code: transition.code ?? 'INVALID_STATE',
            message: transition.message ?? `factory_spec is ${spec.status}; expected in_review`,
          });
        }
        if (bom && !['draft', 'in_review'].includes(bom.status)) {
          blockers.push({
            kind: 'release',
            severity: 'block',
            code: 'BOM_NOT_APPROVABLE',
            message: `BOM v${bom.version} is ${bom.status}; the bundle requires a draft/in_review BOM`,
          });
        }
        if (!bom) {
          blockers.push({
            kind: 'release',
            severity: 'block',
            code: 'NO_PAIRED_BOM',
            message: 'No shared BOM is paired with this factory_spec yet.',
          });
        }
      }

      // RM usability: every BOM line that references an item must point at an ACTIVE
      // item (the part of T-074 enforceable against the migrated schema — matches the
      // bundle SERVICE blocker). Each inactive item is one explicit blocker row.
      if (bom) {
        const rmResult = await db.query<{ item_code: string; status: string }>(
          `select i.item_code, i.status
             from public.bom_lines l
             join public.items i on i.id = l.item_id
            where l.bom_header_id = $1::uuid
              and i.status <> 'active'
            order by i.item_code asc`,
          [bom.id],
        );
        for (const line of rmResult.rows) {
          blockers.push({
            kind: 'rm',
            severity: 'block',
            code: 'ITEM_NOT_ACTIVE',
            message: `Component ${line.item_code} is ${line.status} (RM usability failed).`,
          });
        }
      }

      // D365 is informational only — surfaced as an info blocker, never blocking.
      const flagResult = await db.query<{ is_enabled: boolean }>(
        `select is_enabled
           from public.feature_flags_core
          where org_id = app.current_org_id()
            and flag_code = 'integration.d365.enabled'`,
      );
      const d365Enabled = flagResult.rows[0]?.is_enabled ?? false;
      blockers.push({
        kind: 'release',
        severity: 'info',
        code: 'D365_INFORMATIONAL',
        message: d365Enabled
          ? 'D365 sync is informational only and never blocks Technical approval.'
          : 'D365 integration is disabled — local Technical approval still unlocks factory use.',
      });

      // Approval / rejection history from the audit_log (real evidence).
      const historyResult = await db.query<AuditRow>(
        `select al.occurred_at,
                u.email as actor,
                al.action
           from public.audit_log al
           left join public.users u on u.id = al.actor_user_id
          where al.org_id = app.current_org_id()
            and al.resource_type = 'factory_spec'
            and al.resource_id = $1
          order by al.occurred_at desc
          limit 20`,
        [factorySpecId],
      );
      const history: BundleHistoryEntry[] = historyResult.rows.map((row) => ({
        at: iso(row.occurred_at),
        who: row.actor ?? 'system',
        action: row.action,
      }));

      return {
        ok: true,
        data: {
          factorySpecId: spec.id,
          bomHeaderId: spec.bom_header_id,
          fg: { itemCode: spec.fg_item_code, name: spec.fg_name },
          spec: {
            specCode: spec.spec_code,
            version: Number(spec.version),
            status: spec.status,
            source: spec.source,
            lastEdit: iso(spec.updated_at),
            owner: spec.approver ?? 'Technical',
          },
          bom: {
            id: bom?.id ?? null,
            version: bom?.version ?? null,
            status: bom?.status ?? null,
            clonedFrom: bom?.supersedes_version != null ? `v${bom.supersedes_version}` : null,
          },
          bomOptions,
          blockers,
          history,
          cloneOnWrite,
          d365Enabled,
          canApprove,
        },
      };
    });
  } catch (error) {
    console.error('[technical/factory-specs] loadReleaseBundle failed', {
      factorySpecId,
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'error' };
  }
}
