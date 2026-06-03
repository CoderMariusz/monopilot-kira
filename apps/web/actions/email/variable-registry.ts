/**
 * Email merge-field registry (real domain constant — NOT mock data).
 *
 * This is the canonical source of truth for the Mustache merge fields that
 * Monopilot resolves when rendering transactional email templates. It is a
 * domain constant (not tenant data): the same trigger payload contracts apply
 * to every org, and the `upsertEmailConfig` Server Action validates submitted
 * templates against the per-trigger allow-list derived from this registry
 * (UNKNOWN_TEMPLATE_VAR). The Email variables screen (SET-091) renders the
 * grouped catalog; the Email templates screen (SET-090) feeds the same groups
 * into the SM-04 edit modal merge-field picker.
 *
 * Because the resolvable fields are fixed by the event payload contracts that
 * Planning / Shipping / QA emit (see docs/prd/02-SETTINGS-PRD.md §5.x and the
 * outbox event-naming convention), the catalog is intentionally code-defined
 * rather than tenant-editable. There is no org-scoped variable table to query;
 * the loaders return this constant verbatim for every org.
 */

export type EmailMergeVariable = {
  /** Mustache root token name, e.g. `fa_code`. */
  name: string;
  /** Full Mustache token as rendered in the picker, e.g. `{{fa_code}}`. */
  token: `{{${string}}}`;
  /** Human description of the field. */
  desc: string;
  /** Example resolved value shown in the variables catalog. */
  example: string;
  /** Trigger codes whose payload populates this field. */
  triggers: readonly string[];
};

export type EmailMergeVariableGroup = {
  group: string;
  vars: readonly EmailMergeVariable[];
};

/**
 * Grouped merge-field catalog. Group names mirror the prototype's domain
 * sections. `triggers` ties each field back to the trigger payload schema the
 * Server Action enforces.
 */
export const EMAIL_MERGE_FIELD_REGISTRY: readonly EmailMergeVariableGroup[] = [
  {
    group: 'Factory acceptance',
    vars: [
      {
        name: 'fa_code',
        token: '{{fa_code}}',
        desc: 'Factory acceptance code for the closed/ready FA.',
        example: 'FA-2026-00042',
        triggers: ['core_closed', 'fa_d365_ready'],
      },
      {
        name: 'dept',
        token: '{{dept}}',
        desc: 'Department that owns the FA stage.',
        example: 'Production',
        triggers: ['core_closed', 'fa_d365_ready'],
      },
      {
        name: 'closed_at',
        token: '{{closed_at}}',
        desc: 'Timestamp the FA core was closed.',
        example: '2026-06-03T14:22:00Z',
        triggers: ['core_closed'],
      },
      {
        name: 'closed_by',
        token: '{{closed_by}}',
        desc: 'User who closed the FA core.',
        example: 'maria.kowalska',
        triggers: ['core_closed'],
      },
    ],
  },
  {
    group: 'D365 sync',
    vars: [
      {
        name: 'd365_stage',
        token: '{{d365_stage}}',
        desc: 'Dynamics 365 integration stage reached.',
        example: 'PostedToFinance',
        triggers: ['fa_d365_ready'],
      },
      {
        name: 'ready_at',
        token: '{{ready_at}}',
        desc: 'Timestamp the FA became D365-ready.',
        example: '2026-06-03T15:10:00Z',
        triggers: ['fa_d365_ready'],
      },
    ],
  },
] as const;

/**
 * Per-trigger allow-list of resolvable root variable names, derived from the
 * grouped registry. This is the contract the `upsertEmailConfig` validator uses
 * to reject UNKNOWN_TEMPLATE_VAR.
 */
export function triggerPayloadSchema(): Record<string, readonly string[]> {
  const schema: Record<string, string[]> = {};
  for (const group of EMAIL_MERGE_FIELD_REGISTRY) {
    for (const variable of group.vars) {
      for (const trigger of variable.triggers) {
        (schema[trigger] ??= []).push(variable.name);
      }
    }
  }
  return schema;
}
