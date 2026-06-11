'use server';

/**
 * 03-technical shared BOM SSOT — component line edit/delete Server Actions.
 *
 * Owner-reported gap: once a component is added to a BOM there was NO way to edit
 * or remove it. These two actions close that gap for the FIRST-AUTHORING / draft
 * lifecycle while preserving the clone-on-write red-line for released versions.
 *
 *   updateBomLine : mutate quantity / uom / notes of one bom_lines row.
 *   deleteBomLine : remove one bom_lines row and renumber the remaining lines
 *                   so line_no stays a dense 1..N sequence (consistent with how
 *                   createBomDraft assigns line_no = i + 1 in line order).
 *
 * Editability guard (BOM_LINE_EDITABLE_STATUSES): the owning header must still be
 * in a pre-released state (draft | in_review). For technical_approved / active /
 * superseded / archived versions both actions refuse with `bom_not_editable` — the
 * SAME guard intent as createBomDraft's clone-on-write (a released row is never
 * mutated in place). The UI renders the row actions disabled on those statuses; the
 * server enforces it regardless (never client-trusted).
 *
 * RBAC: gated on `technical.bom.create` — the same permission the draft-edit writes
 * (createBomDraft / deleteBomVersion) use. RLS scopes every statement to the org via
 * app.current_org_id(); there is NO service-role bypass.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  AUDIT_BOM_LINE_DELETED,
  AUDIT_BOM_LINE_UPDATED,
  BOM_CREATE_PERMISSION,
  BOM_LINE_EDITABLE_STATUSES,
  type BomLineActionResult,
  type BomStatus,
  DeleteBomLineInput,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  UpdateBomLineInput,
  writeAudit,
} from './shared';

type HeaderRow = { id: string; product_id: string | null; status: string };

async function loadHeader(c: QueryClient, bomHeaderId: string): Promise<HeaderRow | null> {
  const { rows } = await c.query<HeaderRow>(
    `select id, product_id, status
       from public.bom_headers
      where org_id = app.current_org_id() and id = $1::uuid
      limit 1`,
    [bomHeaderId],
  );
  return rows[0] ?? null;
}

export async function updateBomLine(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = UpdateBomLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomLineActionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await loadHeader(c, input.bomHeaderId);
      if (!header) return { ok: false, error: 'not_found' };
      if (!BOM_LINE_EDITABLE_STATUSES.has(header.status as BomStatus)) {
        return { ok: false, error: 'bom_not_editable', message: `BOM version is ${header.status}` };
      }

      const { rows: before } = await c.query<{
        id: string;
        quantity: string;
        uom: string;
        manufacturing_operation_name: string | null;
      }>(
        `select id, quantity::text as quantity, uom, manufacturing_operation_name
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [input.bomHeaderId, input.lineId],
      );
      const beforeRow = before[0];
      if (!beforeRow) return { ok: false, error: 'not_found' };

      // qty stays a decimal string on the wire → persisted ::numeric. uom/notes are
      // patch-style: only overwrite when provided.
      const { rowCount } = await c.query(
        `update public.bom_lines
            set quantity = $3::numeric,
                uom = coalesce($4, uom),
                manufacturing_operation_name = coalesce($5, manufacturing_operation_name)
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid`,
        [input.bomHeaderId, input.lineId, input.qty, input.uom ?? null, input.notes ?? null],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_LINE_UPDATED,
        resourceId: header.id,
        beforeState: { lineId: input.lineId, quantity: beforeRow.quantity, uom: beforeRow.uom, notes: beforeRow.manufacturing_operation_name },
        afterState: { lineId: input.lineId, quantity: input.qty, uom: input.uom ?? beforeRow.uom, notes: input.notes ?? beforeRow.manufacturing_operation_name },
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: input.lineId, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] updateBomLine persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteBomLine(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = DeleteBomLineInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomLineActionResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await loadHeader(c, input.bomHeaderId);
      if (!header) return { ok: false, error: 'not_found' };
      if (!BOM_LINE_EDITABLE_STATUSES.has(header.status as BomStatus)) {
        return { ok: false, error: 'bom_not_editable', message: `BOM version is ${header.status}` };
      }

      const { rows: before } = await c.query<{ id: string; line_no: number; component_code: string }>(
        `select id, line_no, component_code
           from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [input.bomHeaderId, input.lineId],
      );
      const beforeRow = before[0];
      if (!beforeRow) return { ok: false, error: 'not_found' };

      const { rowCount } = await c.query(
        `delete from public.bom_lines
          where org_id = app.current_org_id()
            and bom_header_id = $1::uuid
            and id = $2::uuid`,
        [input.bomHeaderId, input.lineId],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      // Renumber the remaining lines into a dense 1..N sequence ordered by the
      // current line_no — keeping line_no consistent with the createBomDraft
      // contract (line_no = position in line order).
      await c.query(
        `with ranked as (
           select id, row_number() over (order by line_no asc, id asc) as rn
             from public.bom_lines
            where org_id = app.current_org_id()
              and bom_header_id = $1::uuid
         )
         update public.bom_lines bl
            set line_no = ranked.rn
           from ranked
          where bl.id = ranked.id
            and bl.org_id = app.current_org_id()
            and bl.bom_header_id = $1::uuid
            and bl.line_no <> ranked.rn`,
        [input.bomHeaderId],
      );

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_LINE_DELETED,
        resourceId: header.id,
        beforeState: { lineId: input.lineId, lineNo: Number(beforeRow.line_no), componentCode: beforeRow.component_code },
        afterState: null,
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: input.lineId, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] deleteBomLine persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function revalidateForHeader(productId: string | null): void {
  safeRevalidatePath('/technical/bom');
  if (productId) {
    safeRevalidatePath(`/technical/bom/${encodeURIComponent(productId)}`);
  }
}
