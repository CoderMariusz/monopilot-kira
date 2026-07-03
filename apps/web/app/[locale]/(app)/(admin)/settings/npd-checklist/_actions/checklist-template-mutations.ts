'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  addTemplateItemSchema,
  deleteTemplateItemSchema,
  reorderTemplateItemSchema,
  updateTemplateItemSchema,
} from './checklist-template-schema';
import { hasNpdSchemaEdit, type OrgContextLike } from './checklist-template-auth';
import { writeChecklistTemplateAudit } from './checklist-template-audit';

type MutationResult =
  | { ok: true }
  | { ok: false; code: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' | 'boundary' };

export async function addChecklistTemplateItem(input: unknown): Promise<MutationResult> {
  const parsed = addTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false, code: 'forbidden' };
      }

      const { rows } = await context.client.query<{ next_sequence: number }>(
        `select coalesce(max(sequence), 0) + 1 as next_sequence
           from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2`,
        [parsed.data.templateId, parsed.data.gateCode],
      );
      const nextSequence = rows[0]?.next_sequence ?? 1;

      await context.client.query(
        `insert into "Reference"."GateChecklistTemplates"
           (org_id, template_id, gate_code, category_code, item_text, required, sequence)
         values (app.current_org_id(), $1, $2, $3, $4, $5, $6)`,
        [
          parsed.data.templateId,
          parsed.data.gateCode,
          parsed.data.categoryCode,
          parsed.data.itemText,
          parsed.data.required,
          nextSequence,
        ],
      );

      await writeChecklistTemplateAudit(context, 'npd.gate_checklist_template.added', {
        gate_code: parsed.data.gateCode,
        sequence: nextSequence,
        category_code: parsed.data.categoryCode,
        item_text: parsed.data.itemText,
        required: parsed.data.required,
      });

      return { ok: true };
    });
  } catch (error) {
    console.error('[addChecklistTemplateItem] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'persistence_failed' };
  }
}

export async function updateChecklistTemplateItem(input: unknown): Promise<MutationResult> {
  const parsed = updateTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false, code: 'forbidden' };
      }

      const sets: string[] = [];
      const params: unknown[] = [
        parsed.data.templateId,
        parsed.data.gateCode,
        parsed.data.sequence,
      ];

      if (parsed.data.itemText !== undefined) {
        params.push(parsed.data.itemText);
        sets.push(`item_text = $${params.length}`);
      }
      if (parsed.data.categoryCode !== undefined) {
        params.push(parsed.data.categoryCode);
        sets.push(`category_code = $${params.length}`);
      }
      if (parsed.data.required !== undefined) {
        params.push(parsed.data.required);
        sets.push(`required = $${params.length}`);
      }

      const { rows } = await context.client.query<{ gate_code: string }>(
        `update "Reference"."GateChecklistTemplates"
            set ${sets.join(', ')}
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence = $3
        returning gate_code`,
        params,
      );
      if (rows.length === 0) {
        return { ok: false, code: 'not_found' };
      }

      await writeChecklistTemplateAudit(context, 'npd.gate_checklist_template.updated', parsed.data);
      return { ok: true };
    });
  } catch (error) {
    console.error('[updateChecklistTemplateItem] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'persistence_failed' };
  }
}

export async function deleteChecklistTemplateItem(input: unknown): Promise<MutationResult> {
  const parsed = deleteTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false, code: 'forbidden' };
      }

      const deleted = await context.client.query<{ sequence: number }>(
        `delete from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence = $3
        returning sequence`,
        [parsed.data.templateId, parsed.data.gateCode, parsed.data.sequence],
      );
      if (deleted.rows.length === 0) {
        return { ok: false, code: 'not_found' };
      }

      await context.client.query(
        `with ranked as (
           select template_id,
                  gate_code,
                  sequence,
                  row_number() over (order by sequence) as new_sequence
             from "Reference"."GateChecklistTemplates"
            where org_id = app.current_org_id()
              and template_id = $1
              and gate_code = $2
         )
         update "Reference"."GateChecklistTemplates" t
            set sequence = ranked.new_sequence + 1000
           from ranked
          where t.org_id = app.current_org_id()
            and t.template_id = ranked.template_id
            and t.gate_code = ranked.gate_code
            and t.sequence = ranked.sequence`,
        [parsed.data.templateId, parsed.data.gateCode],
      );

      await context.client.query(
        `update "Reference"."GateChecklistTemplates"
            set sequence = sequence - 1000
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence > 1000`,
        [parsed.data.templateId, parsed.data.gateCode],
      );

      await writeChecklistTemplateAudit(context, 'npd.gate_checklist_template.deleted', parsed.data);
      return { ok: true };
    });
  } catch (error) {
    console.error('[deleteChecklistTemplateItem] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'persistence_failed' };
  }
}

export async function reorderChecklistTemplateItem(input: unknown): Promise<MutationResult> {
  const parsed = reorderTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false, code: 'forbidden' };
      }

      const neighborOffset = parsed.data.direction === 'up' ? -1 : 1;
      const neighborSequence = parsed.data.sequence + neighborOffset;
      if (neighborSequence < 1) {
        return { ok: false, code: 'boundary' };
      }

      const current = await context.client.query<{ sequence: number }>(
        `select sequence
           from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence = $3`,
        [parsed.data.templateId, parsed.data.gateCode, parsed.data.sequence],
      );
      if (current.rows.length === 0) {
        return { ok: false, code: 'not_found' };
      }

      const neighbor = await context.client.query<{ sequence: number }>(
        `select sequence
           from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence = $3`,
        [parsed.data.templateId, parsed.data.gateCode, neighborSequence],
      );
      if (neighbor.rows.length === 0) {
        return { ok: false, code: 'boundary' };
      }

      // PK includes sequence — swap via temporary high offset to satisfy sequence > 0.
      const tempOffset = 100_000;
      await context.client.query(
        `update "Reference"."GateChecklistTemplates"
            set sequence = case
              when sequence = $3 then $3 + $5
              when sequence = $4 then $3
              else sequence
            end
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence in ($3, $4)`,
        [parsed.data.templateId, parsed.data.gateCode, parsed.data.sequence, neighborSequence, tempOffset],
      );

      await context.client.query(
        `update "Reference"."GateChecklistTemplates"
            set sequence = $4
          where org_id = app.current_org_id()
            and template_id = $1
            and gate_code = $2
            and sequence = $3 + $5`,
        [parsed.data.templateId, parsed.data.gateCode, parsed.data.sequence, neighborSequence, tempOffset],
      );

      await writeChecklistTemplateAudit(context, 'npd.gate_checklist_template.reordered', parsed.data);
      return { ok: true };
    });
  } catch (error) {
    console.error('[reorderChecklistTemplateItem] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'persistence_failed' };
  }
}
