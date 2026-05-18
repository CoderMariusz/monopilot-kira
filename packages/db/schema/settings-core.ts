import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  timezone: text('timezone').notNull().default('Europe/Warsaw'),
  locale: text('locale').notNull().default('pl'),
  currency: char('currency', { length: 3 }).notNull().default('PLN'),
  gs1Prefix: text('gs1_prefix'),
  region: text('region').notNull().default('eu'),
  tier: text('tier').notNull().default('L2'),
  seatLimit: integer('seat_limit'),
  onboardingState: jsonb('onboarding_state').default(sql`'{}'::jsonb`),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    permissions: jsonb('permissions').$type<string[]>().notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    displayOrder: integer('display_order').default(0),
  },
  (table) => ({
    orgCodeUnique: unique('roles_org_id_code_unique').on(table.orgId, table.code),
  }),
);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: citext('email').notNull().unique(),
  name: text('name').notNull(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  language: text('language').notNull().default('pl'),
  isActive: boolean('is_active').notNull().default(true),
  inviteToken: text('invite_token'),
  inviteTokenExpiresAt: timestamp('invite_token_expires_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const modules = pgTable('modules', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  dependencies: text('dependencies').array().default(sql`'{}'::text[]`),
  canDisable: boolean('can_disable').notNull().default(true),
  phase: integer('phase').notNull().default(1),
  displayOrder: integer('display_order'),
});

export const organizationModules = pgTable(
  'organization_modules',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    moduleCode: text('module_code')
      .notNull()
      .references(() => modules.code),
    enabled: boolean('enabled').notNull().default(false),
    enabledAt: timestamp('enabled_at', { withTimezone: true }),
    enabledBy: uuid('enabled_by').references(() => users.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.moduleCode] }),
  }),
);
