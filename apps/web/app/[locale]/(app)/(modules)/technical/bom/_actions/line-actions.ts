'use server';

/**
 * 03-technical shared BOM SSOT — component line edit/delete Server Actions.
 *
 * Owner-reported gap: once a component is added to a BOM there was NO way to edit
 * or remove it. These two actions close that gap for the FIRST-AUTHORING / draft
 * lifecycle while preserving the clone-on-write red-line for released versions.
 *
 *   addBomLine    : APPEND one bom_lines row to an existing draft/in_review
 *                   version (line_no = max + 1). F-B01 fix: "Add component" on a
 *                   draft previously forked a brand-new 1-line draft via
 *                   createBomDraft — multi-ingredient recipes were impossible.
 *                   Append runs the SAME validation chain as create-draft:
 *                   V-TEC-13 self-reference + cycle (active graph) and V-TEC-14
 *                   RM usability ('bom_edit' context).
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
import { buildGraph, detectCycle } from './cycle-detection';
import {
  AddBomLineInput,
  AUDIT_BOM_LINE_ADDED,
  AUDIT_BOM_LINE_DELETED,
  AUDIT_BOM_LINE_UPDATED,
  BOM_CREATE_PERMISSION,
  BOM_LINE_EDITABLE_STATUSES,
  type BomLineActionResult,
  type BomStatus,
  DeleteBomLineInput,
  formatRmUsabilityFailures,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  UpdateBomLineInput,
  validateBomLineRmUsability,
  writeAudit,
} from './shared';

type HeaderRow = { id: string; product_id: string | null; status: string };

async function loadHeader(c: QueryClient, bomHeaderId: string): Promise<HeaderRow | null> {
  const { rows } = await c.query<HeaderRow>(
    `select h.id, i.item_code as product_id, h.status
       from public.bom_headers h
       join public.items i on i.id = h.item_id and i.org_id = h.org_id
      where h.org_id = app.current_org_id() and h.id = $1::uuid
      limit 1`,
    [bomHeaderId],
  );
  return rows[0] ?? null;
}

/**
 * APPEND one component line to an existing editable (draft | in_review) BOM
 * version IN PLACE — no version fork (F-B01). Validation mirrors createBomDraft:
 * V-TEC-13 (self-reference + cycle over the org's ACTIVE BOM graph) and V-TEC-14
 * (RM usability, 'bom_edit' context — readiness gaps demoted to warnings, hard
 * blocks refuse). line_no = current max + 1, keeping the dense 1..N contract.
 */
export async function addBomLine(rawInput: unknown): Promise<BomLineActionResult> {
  const parsed = AddBomLineInput.safeParse(rawInput);
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

      // ── V-TEC-13: self-reference + cycle over ACTIVE BOMs (same as create-draft) ──
      if (header.product_id && input.componentCode === header.product_id) {
        return { ok: false, error: 'validation_failed', code: 'V-TEC-13', message: 'BOM line references its own parent item' };
      }
      if (header.product_id) {
        const { rows: edgeRows } = await c.query<{ parent: string; component: string }>(
          `select i.item_code as parent, l.component_code as component
             from public.bom_headers h
             join public.items i on i.id = h.item_id and i.org_id = h.org_id
             join public.bom_lines l on l.bom_header_id = h.id and l.org_id = h.org_id
            where h.org_id = app.current_org_id()
              and h.status = 'active'
              and h.item_id is not null`,
        );
        const graph = buildGraph(edgeRows);
        if (detectCycle(graph, header.product_id, [input.componentCode])) {
          return { ok: false, error: 'validation_failed', code: 'V-TEC-13', message: 'BOM would introduce a cycle' };
        }
      }

      // ── V-TEC-14: the component must pass the canonical RM usability chain ──────
      const rmUsabilityFailures = await validateBomLineRmUsability(
        c,
        [{ itemId: input.itemId ?? null, componentCode: input.componentCode }],
        'bom_edit',
        header.product_id,
      );
      if (rmUsabilityFailures.length > 0) {
        return {
          ok: false,
          error: 'validation_failed',
          code: 'V-TEC-14',
          message: formatRmUsabilityFailures(rmUsabilityFailures),
        };
      }

      // ── APPEND in place: line_no = max + 1 (single statement, no read-modify race
      // window between read and insert — but two CONCURRENT appends can still both
      // compute the same max+1 and collide on the unique (bom_header_id, line_no)
      // key). F7 (W9 cross-review MEDIUM): on 23505 retry ONCE — the re-run
      // recomputes max+1 and lands behind the winner; a second 23505 fails with
      // persistence_failed. The attempt is fenced by a SAVEPOINT because the
      // withOrgContext transaction is otherwise aborted by the first error (25P02).
      const insertLineOnce = async (): Promise<{ id: string; line_no: number } | null> => {
        await c.query('savepoint bom_line_append');
        try {
          const { rows: inserted } = await c.query<{ id: string; line_no: number }>(
            `insert into public.bom_lines
               (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
                manufacturing_operation_name, is_phantom)
             select app.current_org_id(), $1::uuid,
                    coalesce((select max(line_no) from public.bom_lines
                               where org_id = app.current_org_id() and bom_header_id = $1::uuid), 0) + 1,
                    $2::uuid, $3, $4, $5::numeric, $6, $7::numeric, $8, false
             returning id, line_no`,
            [
              input.bomHeaderId,
              input.itemId ?? null,
              input.componentCode,
              input.componentType ?? null,
              input.quantity,
              input.uom,
              input.scrapPct ?? 0,
              input.manufacturingOperationName ?? null,
            ],
          );
          await c.query('release savepoint bom_line_append');
          return inserted[0] ?? null;
        } catch (err) {
          if (isPgError(err) && err.code === '23505') {
            await c.query('rollback to savepoint bom_line_append');
            return null; // signal: lost the append race — caller retries once
          }
          throw err;
        }
      };

      let insertedLine = await insertLineOnce();
      if (!insertedLine) insertedLine = await insertLineOnce(); // single retry (recomputes max+1)
      if (!insertedLine) {
        return { ok: false, error: 'persistence_failed', message: 'concurrent line append — retry failed' };
      }

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_LINE_ADDED,
        resourceId: header.id,
        beforeState: null,
        afterState: {
          lineId: insertedLine.id,
          lineNo: Number(insertedLine.line_no),
          componentCode: input.componentCode,
          quantity: input.quantity,
          uom: input.uom,
        },
      });

      revalidateForHeader(header.product_id);
      return { ok: true, data: { lineId: insertedLine.id, bomHeaderId: input.bomHeaderId } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_input', message: 'invalid reference' };
    console.error('[technical/bom] addBomLine persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
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

      // qty stays a decimal string on the wire → persisted ::numeric. uom is
      // patch-style; notes can be explicitly cleared with '' or null.
      const notesProvided = input.notes !== undefined;
      const nextNotes = !notesProvided || input.notes === '' ? null : input.notes;
      const { rowCount } = await c.query(
        notesProvided
          ? `update public.bom_lines
               set quantity = $3::numeric,
                   uom = coalesce($4, uom),
                   manufacturing_operation_name = $5
             where org_id = app.current_org_id()
               and bom_header_id = $1::uuid
               and id = $2::uuid`
          : `update public.bom_lines
               set quantity = $3::numeric,
                   uom = coalesce($4, uom)
             where org_id = app.current_org_id()
               and bom_header_id = $1::uuid
               and id = $2::uuid`,
        notesProvided
          ? [input.bomHeaderId, input.lineId, input.qty, input.uom ?? null, nextNotes]
          : [input.bomHeaderId, input.lineId, input.qty, input.uom ?? null],
      );
      if (rowCount !== 1) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_LINE_UPDATED,
        resourceId: header.id,
        beforeState: { lineId: input.lineId, quantity: beforeRow.quantity, uom: beforeRow.uom, notes: beforeRow.manufacturing_operation_name },
        afterState: { lineId: input.lineId, quantity: input.qty, uom: input.uom ?? beforeRow.uom, notes: notesProvided ? nextNotes : beforeRow.manufacturing_operation_name },
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
