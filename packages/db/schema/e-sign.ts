import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';

export const eSignLog = pgTable(
  'e_sign_log',
  {
    signatureId: uuid('signature_id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    signerUserId: uuid('signer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    intent: text('intent').notNull(),
    subjectHash: text('subject_hash').notNull(),
    nonce: text('nonce').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    replayUnique: unique('e_sign_log_signer_user_id_subject_hash_intent_nonce_key').on(
      table.signerUserId,
      table.subjectHash,
      table.intent,
      table.nonce,
    ),
    orgCreatedIdx: index('e_sign_log_org_created_idx').on(table.orgId, table.createdAt),
    subjectIdx: index('e_sign_log_subject_idx').on(table.orgId, table.subjectHash, table.intent),
  }),
);
