import { describe, expect, it } from 'vitest';

import {
  EMAIL_TRIGGER_REGISTRY,
  supportedEmailTriggers,
  triggerPayloadSchema,
  variableGroupsForTrigger,
  variablesForTrigger,
} from './variable-registry';

describe('email variable-registry triggers (C023)', () => {
  it('exposes the canonical supported trigger codes used by upsertEmailConfig', () => {
    expect(supportedEmailTriggers().map((trigger) => trigger.code)).toEqual(['core_closed', 'fa_d365_ready']);
    expect(EMAIL_TRIGGER_REGISTRY.every((trigger) => trigger.label.length > 0)).toBe(true);
  });

  it('derives per-trigger variable allow-lists from merge-field triggers', () => {
    const schema = triggerPayloadSchema();

    expect(schema.core_closed).toEqual(expect.arrayContaining(['fa_code', 'dept', 'closed_at', 'closed_by']));
    expect(schema.fa_d365_ready).toEqual(expect.arrayContaining(['fa_code', 'dept', 'd365_stage', 'ready_at']));
    expect(variablesForTrigger('core_closed')).toEqual(schema.core_closed);
    expect(variablesForTrigger('po_to_supplier')).toEqual([]);
  });

  it('filters merge-field groups to variables populated by the selected trigger', () => {
    const coreGroups = variableGroupsForTrigger('core_closed');
    const coreNames = coreGroups.flatMap((group) => group.vars.map((variable) => variable.name));

    expect(coreNames).toEqual(expect.arrayContaining(['fa_code', 'closed_at']));
    expect(coreNames).not.toContain('d365_stage');
  });
});
