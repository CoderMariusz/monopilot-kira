import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { check, date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from '../baseline.js';
import { changeoverEvents } from './changeover-events.js';

// 08-Production T-007 — allergen_changeover_validations: BRCGS Issue 10 evidence record.
// PRD: docs/prd/08-PRODUCTION-PRD.md §9.8, §5.3 (BRCGS), §16.4 V-PROD-08/09.
// Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
// V-PROD-09: retention_until = validated_at + 7y, enforced by BEFORE INSERT/UPDATE trigger
//   fn_set_allergen_retention_until (created in SQL migration). Override below 7y forbidden.
// V-PROD-08: chk_allergen_signatures = jsonb_array_length(signatures) >= 2 for
//   risk_level IN ('medium','high','segregated'); low risk accepts a single signature.

export const allergenChangeoverValidations = pgTable(
  'allergen_changeover_validations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // site_id day-1 (nullable until multi-site backfill)

    changeoverEventId: uuid('changeover_event_id')
      .notNull()
      .references(() => changeoverEvents.id, { onDelete: 'cascade' }),

    validationResult: text('validation_result').notNull(),
    riskLevel: text('risk_level').notNull(),

    cleaningEvidence: jsonb('cleaning_evidence').notNull(),
    atpEvidence: jsonb('atp_evidence'),
    signatures: jsonb('signatures').notNull(),

    overrideBy: uuid('override_by').references(() => users.id, { onDelete: 'set null' }),
    overrideReason: text('override_reason'),

    validatedAt: timestamp('validated_at', { withTimezone: true }).notNull().defaultNow(),
    // Set by fn_set_allergen_retention_until trigger (validated_at + 7y); never user-overridable below 7y.
    retentionUntil: date('retention_until').notNull(),
  },
  (t) => ({
    allergenValChangeoverIdx: index('idx_allergen_val_changeover').on(t.changeoverEventId),
    allergenValRetentionIdx: index('idx_allergen_val_retention').on(t.retentionUntil),
    allergenSignaturesCheck: check(
      'chk_allergen_signatures',
      sql`jsonb_array_length(${t.signatures}) >= 2 or ${t.riskLevel} not in ('medium', 'high', 'segregated')`,
    ),
  }),
);

export type AllergenChangeoverValidation = InferSelectModel<typeof allergenChangeoverValidations>;
export type NewAllergenChangeoverValidation = InferInsertModel<
  typeof allergenChangeoverValidations
>;
