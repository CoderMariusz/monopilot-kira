'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  DEFAULT_TEMPLATE_ID,
  GATE_CODES,
  type CategoryCode,
  type ChecklistTemplateItem,
  type ChecklistTemplatesByGate,
  type GateCode,
} from './checklist-template-schema';
import { hasNpdSchemaEdit, type OrgContextLike } from './checklist-template-auth';

type TemplateRow = {
  template_id: string;
  gate_code: GateCode;
  sequence: number;
  category_code: CategoryCode;
  item_text: string;
  required: boolean;
};

function emptyByGate(): ChecklistTemplatesByGate {
  return {
    G0: [],
    G1: [],
    G2: [],
    G3: [],
    G4: [],
  };
}

function groupByGate(rows: TemplateRow[]): ChecklistTemplatesByGate {
  const grouped = emptyByGate();
  for (const row of rows) {
    grouped[row.gate_code].push({
      templateId: row.template_id,
      gateCode: row.gate_code,
      sequence: row.sequence,
      categoryCode: row.category_code,
      itemText: row.item_text,
      required: row.required,
    });
  }
  for (const gate of GATE_CODES) {
    grouped[gate].sort((a, b) => a.sequence - b.sequence);
  }
  return grouped;
}

export async function listChecklistTemplates(templateId: string = DEFAULT_TEMPLATE_ID) {
  try {
    return await withOrgContext(async (ctx) => {
      const context = ctx as OrgContextLike;
      if (!(await hasNpdSchemaEdit(context))) {
        return { ok: false as const, code: 'forbidden' as const };
      }

      const { rows } = await context.client.query<TemplateRow>(
        `select template_id,
                gate_code,
                sequence,
                category_code,
                item_text,
                required
           from "Reference"."GateChecklistTemplates"
          where org_id = app.current_org_id()
            and template_id = $1
          order by gate_code, sequence`,
        [templateId],
      );

      return { ok: true as const, data: groupByGate(rows) };
    });
  } catch (error) {
    console.error('[listChecklistTemplates] persistence_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, code: 'persistence_failed' as const };
  }
}
