'use server';

/**
 * 03-technical shared BOM SSOT — create draft Server Action (T-013).
 *
 * POST equivalent for `/api/technical/items/:code/boms`. Creates a NEW BOM version
 * in status 'draft' (never auto-publishes), transactionally writing header + lines
 * + co-products. Validation (PRD §7.4/§7.6):
 *   - V-TEC-13 cycle / self-reference (DFS over the org's ACTIVE BOM graph).
 *   - V-TEC-12 non-byproduct allocation sum (parent + non-byproduct co-products)
 *     must equal 100 (rounded to 3 dp).
 *   - V-TEC-14 every component item must pass the canonical RM usability chain.
 *   - V-TEC-11 advisory warnings returned in `warnings` (NOT a 422).
 * version = previous_max(version for this product_id) + 1.
 *
 * Red-lines: status stays 'draft' (no auto-publish); NO bom_snapshots write here
 * (snapshots are WO-time only, T-024); RLS scopes every statement to the org.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { callBomRequestVersionEdit } from '../../../../../../../lib/technical/bom-request-version-edit';
import { safeRevalidatePath } from './revalidate';
import { buildGraph, detectCycle } from './cycle-detection';
import {
  AUDIT_BOM_CREATED,
  BOM_CREATE_PERMISSION,
  type BomValidationCode,
  CreateBomDraftInput,
  type CreateBomDraftResult,
  EVENT_BOM_VERSION_SUBMITTED,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  formatBomNumeric,
  formatRmUsabilityFailures,
  validateBomLineRmUsability,
  validateBomManufacturingOperationNames,
  writeAudit,
  writeOutbox,
} from './shared';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function ensureBomProductReference(
  c: QueryClient,
  input: { productId: string; userId: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { rows: productRows } = await c.query<{ product_code: string }>(
    `select product_code
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
      limit 1`,
    [input.productId],
  );
  if (productRows[0]) return { ok: true };

  const { rows: itemRows } = await c.query<{
    item_code: string;
    name: string | null;
    status: string;
    item_type: string;
  }>(
    `select item_code, name, status, item_type
       from public.items
      where org_id = app.current_org_id()
        and item_code = $1
      limit 1`,
    [input.productId],
  );
  const item = itemRows[0];
  const bomParentTypes = new Set(['fg', 'intermediate']);
  if (!item || !bomParentTypes.has(item.item_type) || item.status !== 'active') {
    return { ok: false, message: 'invalid reference' };
  }

  // Manufactured WIP/intermediate parents are items-only — no product/fg_npd_ext twin.
  if (item.item_type === 'intermediate') {
    return { ok: true };
  }

  // product is a VIEW post-merge-cut (no ON CONFLICT — 42P10). Ensure the row exists WITHOUT
  // disturbing an existing one: a plain INSERT through the view re-runs the INSTEAD-OF insert and
  // would overwrite fg_npd_ext with the sparse NEW values, so insert ONLY when absent.
  const existingProduct = await c.query(
    `select 1 from public.product where org_id = app.current_org_id() and product_code = $1 limit 1`,
    [item.item_code],
  );
  if (existingProduct.rows.length === 0) {
    await c.query(
      `insert into public.product
         (org_id, product_code, product_name, status_overall, created_by_user, app_version)
       values
         (app.current_org_id(), $1, $2, $3, $4::uuid, 'technical-bom-v1')`,
      [item.item_code, item.name ?? item.item_code, item.status, input.userId],
    );
  }
  return { ok: true };
}

export async function createBomDraft(rawInput: unknown): Promise<CreateBomDraftResult> {
  const parsed = CreateBomDraftInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;
  const warnings: BomValidationCode[] = [];

  if (input.bom_type === 'disassembly') {
    return {
      ok: false,
      error: 'invalid_input',
      message: 'Disassembly BOMs must be created with createDisassemblyBomDraft',
    };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateBomDraftResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      // ── V-TEC-13: self-reference (early) + cycle over ACTIVE BOMs ──────────────
      const componentCodes = input.lines.map((l) => l.componentCode);
      if (componentCodes.includes(input.productId)) {
        return { ok: false, error: 'validation_failed', code: 'V-TEC-13', message: 'BOM line references its own parent item' };
      }
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
      if (detectCycle(graph, input.productId, componentCodes)) {
        return { ok: false, error: 'validation_failed', code: 'V-TEC-13', message: 'BOM would introduce a cycle' };
      }

      // ── V-TEC-12: non-byproduct allocation sum (parent + non-byproduct co-products) == 100 ──
      const nonByproductCoProductSum = input.coProducts
        .filter((cp) => !cp.isByproduct)
        .reduce((acc, cp) => acc + cp.allocationPct, 0);
      const coverage = round3(input.parentAllocationPct + nonByproductCoProductSum);
      if (coverage !== 100) {
        return {
          ok: false,
          error: 'validation_failed',
          code: 'V-TEC-12',
          message: `non-byproduct allocation sums to ${coverage}, must equal 100`,
        };
      }

      // ── V-TEC-14: every component item passes canonical RM usability ──────────
      const rmUsabilityFailures = await validateBomLineRmUsability(c, input.lines, 'bom_edit', input.productId);
      if (rmUsabilityFailures.length > 0) {
        return {
          ok: false,
          error: 'validation_failed',
          code: 'V-TEC-14',
          message: formatRmUsabilityFailures(rmUsabilityFailures),
          rmUsabilityFailures,
        };
      }

      const operationValidation = await validateBomManufacturingOperationNames(
        c,
        input.lines.map((line) => line.manufacturingOperationName),
      );
      if (!operationValidation.ok) {
        return {
          ok: false,
          error: 'validation_failed',
          code: operationValidation.code,
          message: operationValidation.message,
        };
      }

      // ── V-TEC-11 advisory: warn (non-blocking) if any line scrap_pct >= 50 ──────
      if (input.lines.some((l) => (l.scrapPct ?? 0) >= 50)) warnings.push('V-TEC-11');

      const productReference = await ensureBomProductReference(c, { productId: input.productId, userId });
      if (!productReference.ok) {
        return { ok: false, error: 'invalid_input', message: productReference.message };
      }

      const { rows: parentItemRows } = await c.query<{ id: string; item_type: string }>(
        `select id, item_type
           from public.items
          where org_id = app.current_org_id()
            and item_code = $1
          limit 1`,
        [input.productId],
      );
      const parentItem = parentItemRows[0];
      if (!parentItem) return { ok: false, error: 'invalid_input', message: 'invalid reference' };
      const headerProductId = parentItem.item_type === 'intermediate' ? null : input.productId;

      let headerId: string;
      let version: number;

      if (input.sourceBomHeaderId) {
        const { rows: sourceHeaderRows } = await c.query<{
          parent_item_code: string;
          status: string;
          version: number;
        }>(
          `select i.item_code as parent_item_code,
                  header.status,
                  header.version
             from public.bom_headers header
             join public.items i on i.id = header.item_id and i.org_id = header.org_id
            where header.org_id = app.current_org_id()
              and header.id = $1::uuid
            for update`,
          [input.sourceBomHeaderId],
        );
        const sourceHeader = sourceHeaderRows[0];
        if (!sourceHeader) return { ok: false, error: 'not_found' };
        if (sourceHeader.parent_item_code !== input.productId) {
          return {
            ok: false,
            error: 'invalid_input',
            message: 'sourceBomHeaderId does not match productId',
          };
        }

        if (['draft', 'in_review'].includes(sourceHeader.status)) {
          await c.query(
            `select pg_advisory_xact_lock(hashtextextended($1::text || ':bom-draft-version:' || $2::text, 0))`,
            [orgId, parentItem.id],
          );

          const { rows: verRows } = await c.query<{ next_version: number }>(
            `select coalesce(max(version), 0) + 1 as next_version
               from public.bom_headers
              where org_id = app.current_org_id()
                and item_id = $1::uuid`,
            [parentItem.id],
          );
          version = Number(verRows[0]?.next_version ?? sourceHeader.version + 1);

          const { rows: headerRows } = await c.query<{ id: string }>(
            `insert into public.bom_headers
               (org_id, product_id, item_id, origin_module, status, version, supersedes_bom_header_id,
                yield_pct, effective_from, notes, created_by_user, app_version, bom_type)
             values
               (app.current_org_id(), $1, $2::uuid, 'technical', 'draft', $3, $4::uuid,
                $5::numeric, coalesce($6::date, current_date), $7, $8::uuid, 'technical-bom-v1', $9)
             returning id`,
            [
              headerProductId,
              parentItem.id,
              version,
              input.sourceBomHeaderId,
              formatBomNumeric(input.yieldPct ?? 100),
              input.effectiveFrom ?? null,
              input.notes ?? null,
              userId,
              input.bom_type,
            ],
          );
          headerId = headerRows[0]?.id ?? '';
          if (!headerId) return { ok: false, error: 'persistence_failed' };

          await c.query(
            `update public.bom_headers header
                set status = 'archived',
                    effective_to = coalesce(header.effective_to, current_date)
              where header.org_id = app.current_org_id()
                and header.id = $1::uuid`,
            [input.sourceBomHeaderId],
          );
        } else if (['technical_approved', 'active'].includes(sourceHeader.status)) {
          const edit = await callBomRequestVersionEdit(c, {
            sourceBomHeaderId: input.sourceBomHeaderId,
            requestedBy: userId,
            notes: input.notes ?? null,
          });
          if (!edit) return { ok: false, error: 'persistence_failed' };
          headerId = edit.bom_header_id;
          version = edit.version;

          const { rows: lockedDraftRows } = await c.query<{ id: string }>(
            `select header.id
               from public.bom_headers header
              where header.org_id = app.current_org_id()
                and header.id = $1::uuid
              for update`,
            [headerId],
          );
          if (!lockedDraftRows[0]) return { ok: false, error: 'persistence_failed' };

          await c.query(
            `update public.bom_headers header
                set yield_pct = $2::numeric,
                    effective_from = coalesce($3::date, header.effective_from),
                    notes = coalesce($4, header.notes),
                    bom_type = $5
              where header.org_id = app.current_org_id()
                and header.id = $1::uuid`,
            [
              headerId,
              formatBomNumeric(input.yieldPct ?? 100),
              input.effectiveFrom ?? null,
              input.notes ?? null,
              input.bom_type,
            ],
          );
          await c.query(
            `delete from public.bom_lines line
              where line.org_id = app.current_org_id()
                and line.bom_header_id = $1::uuid`,
            [headerId],
          );
          await c.query(
            `delete from public.bom_co_products cp
              where cp.org_id = app.current_org_id()
                and cp.bom_header_id = $1::uuid`,
            [headerId],
          );
        } else {
          return {
            ok: false,
            error: 'invalid_state',
            message: `BOM version is ${sourceHeader.status} and cannot be saved as a new draft version`,
          };
        }
      } else {
        // ── version = previous_max + 1 (org + product scoped) ──────────────────────
        const { rows: verRows } = await c.query<{ next_version: number }>(
          `select coalesce(max(version), 0) + 1 as next_version
             from public.bom_headers
            where org_id = app.current_org_id()
              and item_id = (select id from public.items where org_id = app.current_org_id() and item_code = $1)`,
          [input.productId],
        );
        version = Number(verRows[0]?.next_version ?? 1);

        const { rows: headerRows } = await c.query<{ id: string }>(
          `insert into public.bom_headers
             (org_id, product_id, item_id, origin_module, status, version, yield_pct, effective_from, notes, created_by_user, app_version, bom_type)
           values
             (app.current_org_id(), $1, $2::uuid, 'technical', 'draft', $3, $4::numeric, coalesce($5::date, current_date), $6, $7::uuid, 'technical-bom-v1', $8)
           returning id`,
          [
            headerProductId,
            parentItem.id,
            version,
            formatBomNumeric(input.yieldPct ?? 100),
            input.effectiveFrom ?? null,
            input.notes ?? null,
            userId,
            input.bom_type,
          ],
        );
        headerId = headerRows[0]?.id ?? '';
        if (!headerId) return { ok: false, error: 'persistence_failed' };
      }

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i]!;
        await c.query(
          `insert into public.bom_lines
             (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
              manufacturing_operation_name, sequence, is_phantom)
           values
             (app.current_org_id(), $1::uuid, $2, $3::uuid, $4, $5, $6::numeric, $7, $8::numeric, $9, $10, $11)`,
          [
            headerId,
            i + 1,
            line.itemId ?? null,
            line.componentCode,
            line.componentType ?? null,
            formatBomNumeric(line.quantity),
            line.uom,
            formatBomNumeric(line.scrapPct ?? 0),
            line.manufacturingOperationName ?? null,
            line.sequence ?? null,
            line.isPhantom ?? false,
          ],
        );
      }

      for (const cp of input.coProducts) {
        await c.query(
          `insert into public.bom_co_products
             (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric, $6)`,
          [
            headerId,
            cp.coProductItemId,
            formatBomNumeric(cp.quantity),
            cp.uom,
            formatBomNumeric(cp.allocationPct),
            cp.isByproduct ?? false,
          ],
        );
      }

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_CREATED,
        resourceId: headerId,
        beforeState: null,
        afterState: { productId: input.productId, version, status: 'draft', lineCount: input.lines.length },
      });

      // Outbox: a draft version submitted into the shared BOM lifecycle.
      await writeOutbox(c, {
        orgId,
        eventType: EVENT_BOM_VERSION_SUBMITTED,
        aggregateType: 'bom_header',
        aggregateId: headerId,
        payload: { product_id: input.productId, version, status: 'draft', actor_user_id: userId },
      });

      safeRevalidatePath('/technical/bom');
      return { ok: true, data: { id: headerId, version, warnings } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'conflict', message: 'duplicate BOM version' };
    if (isPgError(err) && err.code === '23514') {
      return {
        ok: false,
        error: 'invalid_state',
        message: err.message ?? 'BOM version cannot be saved in its current state',
      };
    }
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_input', message: 'invalid reference' };
    console.error('[technical/bom] createBomDraft persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
