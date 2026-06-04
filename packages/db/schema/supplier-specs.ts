import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './baseline.js';
import { items } from './items.js';

/**
 * T-005 — supplier_specs (Phase 1 governance).
 *
 * Technical-owned supplier spec master: upload/view/review of supplier-provided RM/component
 * parameters, certificates, allergens. declared_allergens is a TEXT[] of supplier-declared codes
 * resolved against the allergens reference at the API layer (not an FK). Lifecycle + review
 * status machines are CHECK-enforced; a partial unique index allows at most one active+approved
 * spec per org/item/supplier.
 */
export const supplierSpecs = pgTable(
  'supplier_specs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable, no FK / no registry
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    supplierCode: text('supplier_code').notNull(),
    supplierStatus: text('supplier_status').notNull().default('pending'),
    specDocumentUrl: text('spec_document_url'),
    documentSha256: text('document_sha256'),
    documentMimeType: text('document_mime_type'),
    specVersion: text('spec_version').notNull(),
    issuedDate: date('issued_date'),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    expiryDate: date('expiry_date'),
    lifecycleStatus: text('lifecycle_status').notNull().default('draft'),
    reviewStatus: text('review_status').notNull().default('pending'),
    reviewNotes: text('review_notes'),
    costReviewBlocked: boolean('cost_review_blocked').notNull().default(false),
    specReviewBlocked: boolean('spec_review_blocked').notNull().default(false),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id, { onDelete: 'restrict' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    declaredAllergens: text('declared_allergens').array(),
    declaredAttrs: jsonb('declared_attrs').notNull().default({}),
    certificateRefs: jsonb('certificate_refs').notNull().default([]),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgItemIdx: index('idx_supplier_specs_org_item').on(table.orgId, table.itemId),
    orgSupplierIdx: index('idx_supplier_specs_org_supplier').on(
      table.orgId,
      table.supplierCode,
      table.itemId,
    ),
    orgSiteIdx: index('idx_supplier_specs_org_site').on(table.orgId, table.siteId),
    oneActiveApprovedUq: uniqueIndex('supplier_specs_one_active_approved')
      .on(table.orgId, table.itemId, table.supplierCode)
      .where(sql`lifecycle_status = 'active' and review_status = 'approved'`),
    supplierStatusCheck: check(
      'supplier_specs_supplier_status_check',
      sql`${table.supplierStatus} in ('pending', 'approved', 'blocked')`,
    ),
    lifecycleStatusCheck: check(
      'supplier_specs_lifecycle_status_check',
      sql`${table.lifecycleStatus} in ('draft', 'active', 'expired', 'superseded', 'blocked')`,
    ),
    reviewStatusCheck: check(
      'supplier_specs_review_status_check',
      sql`${table.reviewStatus} in ('pending', 'approved', 'rejected', 'blocked')`,
    ),
    declaredAttrsObjectCheck: check(
      'supplier_specs_declared_attrs_object_check',
      sql`jsonb_typeof(${table.declaredAttrs}) = 'object'`,
    ),
    certificateRefsArrayCheck: check(
      'supplier_specs_certificate_refs_array_check',
      sql`jsonb_typeof(${table.certificateRefs}) = 'array'`,
    ),
    expiryAfterEffectiveCheck: check(
      'supplier_specs_expiry_after_effective_check',
      sql`${table.expiryDate} is null or ${table.effectiveFrom} is null or ${table.expiryDate} >= ${table.effectiveFrom}`,
    ),
  }),
);

export type SupplierSpec = InferSelectModel<typeof supplierSpecs>;
export type NewSupplierSpec = InferInsertModel<typeof supplierSpecs>;

/**
 * T-075 — supplier_spec_review_proposals (Phase 1 governance).
 *
 * Non-mutating PO/Technical review channel for supplier_specs. PO actuals create proposals
 * (review / non-conformance) but NEVER overwrite supplier_specs; the only governed mutation
 * path is approve_supplier_spec_review (Technical), which clones a new active+approved spec and
 * supersedes the prior one. Mirrors migration 174.
 */
export const supplierSpecReviewProposals = pgTable(
  'supplier_spec_review_proposals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id'), // day-1 nullable, no FK / no registry
    supplierSpecId: uuid('supplier_spec_id')
      .notNull()
      .references(() => supplierSpecs.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('po_actual'),
    proposalStatus: text('proposal_status').notNull().default('pending'),
    proposedAttrs: jsonb('proposed_attrs').notNull().default({}),
    observedNotes: text('observed_notes'),
    isNonConformance: boolean('is_non_conformance').notNull().default(false),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    resultingSupplierSpecId: uuid('resulting_supplier_spec_id').references(
      () => supplierSpecs.id,
      { onDelete: 'set null' },
    ),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (table) => ({
    orgSpecIdx: index('idx_supplier_spec_review_proposals_org_spec').on(
      table.orgId,
      table.supplierSpecId,
    ),
    orgStatusIdx: index('idx_supplier_spec_review_proposals_org_status').on(
      table.orgId,
      table.proposalStatus,
    ),
    orgSiteIdx: index('idx_supplier_spec_review_proposals_org_site').on(
      table.orgId,
      table.siteId,
    ),
    sourceCheck: check(
      'supplier_spec_review_proposals_source_check',
      sql`${table.source} in ('po_actual', 'technical', 'import')`,
    ),
    statusCheck: check(
      'supplier_spec_review_proposals_status_check',
      sql`${table.proposalStatus} in ('pending', 'approved', 'rejected', 'blocked')`,
    ),
    proposedAttrsObjectCheck: check(
      'supplier_spec_review_proposals_proposed_attrs_object_check',
      sql`jsonb_typeof(${table.proposedAttrs}) = 'object'`,
    ),
    resultingSpecConsistencyCheck: check(
      'supplier_spec_review_proposals_resulting_spec_consistency_check',
      sql`(${table.proposalStatus} = 'approved' and ${table.resultingSupplierSpecId} is not null) or (${table.proposalStatus} <> 'approved' and ${table.resultingSupplierSpecId} is null)`,
    ),
  }),
);

export type SupplierSpecReviewProposal = InferSelectModel<typeof supplierSpecReviewProposals>;
export type NewSupplierSpecReviewProposal = InferInsertModel<typeof supplierSpecReviewProposals>;
