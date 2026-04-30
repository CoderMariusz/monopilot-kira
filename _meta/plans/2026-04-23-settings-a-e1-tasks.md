---
title: Phase E-1 — 02-SETTINGS-a Atomic Tasks
date: 2026-04-23
phase: E-1
module: 02-SETTINGS-a (minimum carveout)
total_tasks: 38
---

# Phase E-1 — Settings-a Atomic Tasks

Generated per atomic-task-decomposition-guide §4 schema. Scope per kickoff plan §5.2 + ADR-032. Three parallel tracks: S-α (Identity/RBAC), S-β (Reference data), S-γ (Toggles + i18n). Foundation E-0 (T-00b-E01 permissions.enum.ts, T-00b-E02 events.enum.ts, T-00b-000 baseline migration) are hard upstream blockers for this entire phase.

---

## Track S-α — Identity (Orgs / Users / RBAC / Security)

---

## T-02SETa-E01 — `permissions.enum.ts` settings extension (architect lock)

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a RBAC (§3, §5.1)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00b-E01] (Foundation permissions.enum.ts lock)
- **Downstream (will consume this):** [T-02SETa-004, T-02SETa-005, T-02SETa-006, T-02SETa-008, T-02SETa-009]
- **Parallel (can run concurrently):** [T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** Foundation `lib/rbac/permissions.enum.ts` exists with base permissions
**WHEN** settings-specific permissions are appended and the file is re-locked
**THEN** a single source of truth exists for `settings.users.create`, `settings.users.deactivate`, `settings.roles.edit`, `settings.schema.edit`, `settings.rules.view`, `settings.modules.toggle`, `settings.ref.edit`, `settings.security.edit`, `settings.audit.read`, `impersonate.tenant` — all with JSDoc + ADR refs

### Implementation (max 5 sub-steps)
1. Append settings permission group to `lib/rbac/permissions.enum.ts` with const object entries and JSDoc
2. Add `ALL_SETTINGS_PERMISSIONS` exported slice for codegen/tests
3. Update unit test to cover settings permission format regex + no-dupes
4. Update CODEOWNERS to keep file architect-only
5. Commit and confirm downstream tasks can import

### Files
- **Modify:** `lib/rbac/permissions.enum.ts` (append settings block)
- **Modify:** `lib/rbac/permissions.test.ts` (extend coverage)
- **Modify:** `CODEOWNERS`

### Test gate
- **Unit:** `vitest lib/rbac/permissions.test.ts` — covers: no dupes, `^[a-z]+(\.[a-z_]+)+$` regex, settings group present
- **CI gate:** `pnpm test:unit` green

### Rollback
Remove appended settings block from `permissions.enum.ts`; re-run unit test.

---

## T-02SETa-E02 — `events.enum.ts` settings extension (architect lock)

**Type:** T1-schema
**Context budget:** ~20k tokens
**Est time:** 20 min
**Parent feature:** 02-SET-a outbox events
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00b-E02] (Foundation events.enum.ts lock)
- **Downstream (will consume this):** [T-02SETa-005, T-02SETa-006, T-02SETa-009, T-02SETa-022]
- **Parallel (can run concurrently):** [T-02SETa-E01]

### GIVEN / WHEN / THEN
**GIVEN** Foundation `lib/outbox/events.enum.ts` exists
**WHEN** settings domain events are appended
**THEN** event types `org.created`, `org.updated`, `org.deleted`, `user.invited`, `user.deactivated`, `role.assigned`, `module.toggled`, `ref.row.updated` exist in ISA-95 dot format with JSDoc

### Implementation (max 5 sub-steps)
1. Append settings event group to `lib/outbox/events.enum.ts`
2. Document ISA-95 prefix per settings domain
3. Update unit test for format + no-dupes
4. Commit and lock in CODEOWNERS

### Files
- **Modify:** `lib/outbox/events.enum.ts` (append settings block)
- **Modify:** `lib/outbox/events.test.ts` (extend)
- **Modify:** `CODEOWNERS`

### Test gate
- **Unit:** `vitest lib/outbox/events.test.ts` — no dupes, format regex green
- **CI gate:** `pnpm test:unit` green

### Rollback
Remove appended settings block from `events.enum.ts`.

---

## T-02SETa-001 — Schema: organizations + org_security_policies + users + roles tables

**Type:** T1-schema
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Identity (§5.1, §5.7)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00b-000] (baseline migration), [T-02SETa-E01]
- **Downstream (will consume this):** [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005, T-02SETa-006]
- **Parallel (can run concurrently):** [T-02SETa-011]

### GIVEN / WHEN / THEN
**GIVEN** Baseline migration 001 applied (tenants, users skeleton)
**WHEN** settings schema migration is applied
**THEN** tables `organizations` (slug, name, logo_url, timezone, locale, currency, gs1_prefix, region, tier, onboarding_state, onboarding_completed_at + R13 cols), `roles` (org_id nullable for system roles, code, name, permissions JSONB, is_system, display_order), `users` extended (org_id, email CITEXT UNIQUE, name, role_id, language, is_active, invite_token, last_login_at + R13 cols), `org_security_policies` (org_id PK FK, password_min_length, password_history_count, session_timeout_minutes, lockout_threshold, mfa_requirement), `login_attempts`, `password_history` all exist with correct constraints and RLS enabled

### Implementation (max 5 sub-steps)
1. Author `drizzle/schema/settings-identity.ts` with Drizzle ORM definitions for all 6 tables including R13 columns on every business table
2. Define Zod schema `organizationSchema`, `roleSchema`, `userSchema` in `lib/validators/settings.ts`
3. Run `pnpm drizzle-kit generate` → inspect DDL output for correctness
4. Apply migration on local Supabase and verify with `\d+ organizations`
5. Seed system role definitions in migration seed step (10 system roles: owner/admin/npd_manager/module_admin/planner/production_lead/quality_lead/warehouse_operator/auditor/viewer)

### Files
- **Create:** `drizzle/schema/settings-identity.ts`, `drizzle/migrations/002-settings-identity.sql`, `lib/validators/settings.ts`
- **Modify:** `drizzle/schema/index.ts` (re-export)

### Test gate
- **Integration:** `vitest drizzle/migrations/002-settings-identity.integration.test.ts` — asserts all 6 tables exist, R13 cols present, 10 system roles seeded, RLS enabled on org-scoped tables
- **Unit:** `vitest lib/validators/settings.test.ts` — Zod schema rejects invalid org tier enum, invalid email, missing required fields
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 002-settings-identity`

---

## T-02SETa-002 — Server Actions: createOrg / updateOrg / deleteOrg

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Organizations CRUD (§5.1)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001, T-02SETa-E01, T-02SETa-E02]
- **Downstream (will consume this):** [T-02SETa-007, T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-003]

### GIVEN / WHEN / THEN
**GIVEN** `organizations` table migrated, `permissions.enum.ts` has `settings.users.create`, `events.enum.ts` has `org.created/updated/deleted`
**WHEN** owner calls `createOrg(input)`, `updateOrg(id, input)`, or `deleteOrg(id)` server actions
**THEN** org is created/updated/soft-deleted; `insertAuditLog()` emits one entry per mutation; `insertOutboxEvent(tenantId, 'org.created'|'org.updated'|'org.deleted', 'Organization', orgId, payload)` is called; RBAC guard rejects non-owner; Zod input validation rejects malformed data with typed error

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/orgs.ts` with `createOrg`, `updateOrg`, `deleteOrg` (soft delete via `deleted_at`)
2. Add RBAC guard using `hasPermission(session, Permissions.SETTINGS_USERS_CREATE)` per action
3. Add `insertAuditLog()` call after each mutation (old_data / new_data diff)
4. Add `insertOutboxEvent()` call after each mutation using `EventType.ORG_*`
5. Write unit test mocking Drizzle + auth session, assert guard rejection + success paths

### Files
- **Create:** `app/actions/settings/orgs.ts`, `app/actions/settings/orgs.test.ts`
- **Modify:** `lib/rbac/guards.ts` (if needed — add org guard helper)

### Test gate
- **Unit:** `vitest app/actions/settings/orgs.test.ts` — covers: RBAC reject (non-owner), Zod reject (missing slug), success path emits audit + outbox
- **Integration:** `vitest app/actions/settings/orgs.integration.test.ts` — real local DB: create → DB row exists + audit_log row + outbox_events row
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/orgs.ts`; revert `lib/rbac/guards.ts`.

---

## T-02SETa-003 — Server Actions: inviteUser / updateUser / deactivateUser + role assign

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Users CRUD (§5.1)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001, T-02SETa-E01, T-02SETa-E02]
- **Downstream (will consume this):** [T-02SETa-008, T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-002]

### GIVEN / WHEN / THEN
**GIVEN** `users` and `roles` tables migrated; `settings.users.create` / `settings.users.deactivate` / `settings.roles.edit` permissions exist
**WHEN** admin calls `inviteUser(input)`, `updateUser(id, input)`, `deactivateUser(id)`, or `assignRole(userId, roleId)` server actions
**THEN** user is created with `invite_token`/updated/soft-deactivated; `insertAuditLog()` + `insertOutboxEvent('user.invited'|'user.deactivated'|'role.assigned')` called; RBAC guard rejects insufficient-permission callers; Supabase Auth `inviteUserByEmail` triggered on invite

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/users.ts` with 4 server actions
2. `inviteUser` triggers Supabase Auth `admin.inviteUserByEmail` + inserts user row with `invite_token`
3. RBAC guard per permission: `settings.users.create` for invite, `settings.users.deactivate` for deactivate, `settings.roles.edit` for assignRole
4. Emit `insertAuditLog()` + `insertOutboxEvent()` on each mutation
5. Unit test for guard rejection + each success path with mocked Supabase client

### Files
- **Create:** `app/actions/settings/users.ts`, `app/actions/settings/users.test.ts`

### Test gate
- **Unit:** `vitest app/actions/settings/users.test.ts` — guard reject, Zod reject (invalid email), invite creates audit row
- **Integration:** `vitest app/actions/settings/users.integration.test.ts` — invite → user row in DB + outbox event
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/users.ts`.

---

## T-02SETa-004 — Server Actions: createRole / updateRole (RBAC permissions matrix)

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a 10 Roles + RBAC (§3, §5.1)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001, T-02SETa-E01]
- **Downstream (will consume this):** [T-02SETa-009, T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003]

### GIVEN / WHEN / THEN
**GIVEN** `roles` table migrated with 10 system roles seeded; `permissions.enum.ts` locked
**WHEN** owner calls `createRole(input)` or `updateRole(id, input)` for custom role (non-system)
**THEN** role is created/updated with `permissions JSONB` array validated against `ALL_PERMISSIONS`; system roles (`is_system=true`) are immutable (guard rejects mutation); `insertAuditLog()` + `insertOutboxEvent('role.assigned')` called

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/roles.ts` with `createRole`, `updateRole`, `deleteRole`
2. Guard: `is_system=true` rows → throw `IMMUTABLE_SYSTEM_ROLE` error
3. Validate `permissions[]` array: each element must exist in `ALL_PERMISSIONS` (runtime check, not just Zod)
4. Emit audit + outbox on mutation
5. Unit test: system role mutation rejected, invalid permission string rejected, success path emits audit

### Files
- **Create:** `app/actions/settings/roles.ts`, `app/actions/settings/roles.test.ts`

### Test gate
- **Unit:** `vitest app/actions/settings/roles.test.ts` — system role immutability guard, invalid permission rejection, success path
- **Integration:** `vitest app/actions/settings/roles.integration.test.ts` — create custom role → DB row + audit_log
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/roles.ts`.

---

## T-02SETa-005 — Server Action: updateOrgSecurityPolicy

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Org security baseline (§14.1)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001, T-02SETa-E01, T-02SETa-E02]
- **Downstream (will consume this):** [T-02SETa-010, T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003, T-02SETa-004]

### GIVEN / WHEN / THEN
**GIVEN** `org_security_policies` table migrated; `settings.security.edit` permission exists
**WHEN** owner calls `updateOrgSecurityPolicy(orgId, input)` server action
**THEN** security policy is updated with validated values (password_min_length 8-128, session_timeout 15-1440, mfa_requirement ∈ enum); `insertAuditLog()` + `insertOutboxEvent('org.updated')` emitted; non-owner RBAC guard rejects

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/security.ts` with `updateOrgSecurityPolicy`
2. Zod schema enforces ranges: `password_min_length` min(8) max(128), `session_timeout_minutes` min(15) max(1440)
3. `mfa_requirement` enum: `disabled | optional | required_admins | required_all`
4. Upsert into `org_security_policies` (create row if not exists for org)
5. Emit audit + outbox; unit test guard + Zod path

### Files
- **Create:** `app/actions/settings/security.ts`, `app/actions/settings/security.test.ts`
- **Modify:** `lib/validators/settings.ts` (add `orgSecurityPolicySchema`)

### Test gate
- **Unit:** `vitest app/actions/settings/security.test.ts` — RBAC reject, invalid range reject, mfa_requirement enum reject
- **Integration:** `vitest app/actions/settings/security.integration.test.ts` — update → DB row updated + audit_log
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/security.ts`.

---

## T-02SETa-006 — RBAC middleware: `withPermission` guard + session resolver

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a RBAC middleware (§3, §5.7)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001, T-02SETa-E01]
- **Downstream (will consume this):** [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005, all T2 tasks]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** `users`, `roles` tables exist; `permissions.enum.ts` locked; Supabase session available in Next.js middleware
**WHEN** any Server Action or route handler calls `requirePermission(session, Permission.X)`
**THEN** if user role's `permissions JSONB` includes `Permission.X` → resolves; otherwise throws `ForbiddenError`; `setCurrentOrgId(orgId)` sets Postgres `app.current_org_id` session variable for RLS enforcement

### Implementation (max 5 sub-steps)
1. Create `lib/rbac/middleware.ts` with `requirePermission(session, permission)` and `setCurrentOrgId(orgId)` helpers
2. `requirePermission` loads role from DB (or session cache), checks `role.permissions` JSONB array includes the string
3. `setCurrentOrgId` runs `SET LOCAL app.current_org_id = '...'` via Drizzle `db.execute`
4. Export `withOrgContext(handler)` HOF for route handlers that sets org context
5. Unit tests: permission present → resolves; permission absent → ForbiddenError; unknown role → ForbiddenError

### Files
- **Create:** `lib/rbac/middleware.ts`, `lib/rbac/middleware.test.ts`
- **Modify:** `lib/rbac/index.ts` (re-export)

### Test gate
- **Unit:** `vitest lib/rbac/middleware.test.ts` — permission present/absent, unknown role, ForbiddenError shape
- **Integration:** `vitest lib/rbac/middleware.integration.test.ts` — RLS enforced: user in org A cannot query org B with `setCurrentOrgId`
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `lib/rbac/middleware.ts`.

---

## T-02SETa-007 — UI: OrgsList + OrgForm modal (create/edit)

**Type:** T3-ui
**Context budget:** ~65k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Organizations CRUD
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `company_profile_screen` — `design/Monopilot Design System/settings/`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Form, Input, Select, Button, Avatar, Card, Separator
  - estimated_translation_time_min: 90

### Dependencies
- **Upstream (must be done first):** [T-02SETa-002]
- **Downstream (will consume this):** [T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `createOrg`, `updateOrg`, `deleteOrg` server actions exist; i18n scaffold complete (T-02SETa-031)
**WHEN** admin navigates to `/settings/organizations`
**THEN** `<OrgsList />` renders org rows with name, slug, tier badge, region badge; "Add Organization" opens `<OrgForm />` Radix Dialog; form validates via Zod resolver (slug regex `^[a-z0-9-]+$`, required name, timezone Select); submit calls server action; shadcn `Skeleton` shown during loading; shadcn `Alert` shown on error; success closes modal and invalidates list

### Implementation (max 5 sub-steps)
1. Create `components/settings/orgs/OrgsList.tsx` — Table with columns: name, slug, tier badge, region badge, actions (edit/delete)
2. Create `components/settings/orgs/OrgForm.tsx` — Dialog with RHF + `zodResolver(orgSchema)`, fields: name (Input), slug (Input, auto-generated from name), timezone (Select), locale (Select), currency (Input), region (Select), tier (Select readonly for non-owner)
3. Loading state via `shadcn/Skeleton` on list rows; error via `shadcn/Alert` below submit button
4. Wire `createOrg` / `updateOrg` server actions; use Next.js `revalidatePath` after mutation
5. Add next-intl keys for all labels (namespace `02-settings.orgs.*`)

### Files
- **Create:** `components/settings/orgs/OrgsList.tsx`, `components/settings/orgs/OrgForm.tsx`
- **Modify:** `messages/en/02-settings.json` (add orgs keys), `messages/pl/02-settings.json` (placeholder)

### Test gate
- **Unit:** `vitest components/settings/orgs/OrgForm.test.tsx` — Zod validation reject (invalid slug), form submit calls server action
- **E2E:** `playwright e2e/settings/orgs.spec.ts` — owner opens form, fills name+slug, submits, sees org in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/orgs/`; revert message files.

---

## T-02SETa-008 — UI: UsersList + UserInviteModal + UserEditModal

**Type:** T3-ui
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Users CRUD
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `users_screen` — `design/Monopilot Design System/settings/`
  - component_type: page-layout
  - ui_pattern: list-with-actions
  - shadcn_equivalent: Table, Tabs, ToggleGroup, Input, Select, Badge, Avatar, Card, Button
  - estimated_translation_time_min: 150

### Dependencies
- **Upstream (must be done first):** [T-02SETa-003]
- **Downstream (will consume this):** [T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `inviteUser`, `updateUser`, `deactivateUser` server actions exist
**WHEN** admin navigates to `/settings/users`
**THEN** `<UsersList />` renders user rows with Avatar, name, email, role badge, active/inactive badge; "Invite User" opens `<UserInviteModal />` (email Input, role Select); editing a row opens `<UserEditModal />`; deactivating shows confirmation AlertDialog; all forms use RHF + Zod resolver; loading via Skeleton; error via Alert; next-intl keys applied

### Implementation (max 5 sub-steps)
1. Create `components/settings/users/UsersList.tsx` — Table with Avatar, name, email, role badge (colored by role), active status Badge, Actions dropdown (Edit / Deactivate)
2. Create `components/settings/users/UserInviteModal.tsx` — Dialog with email Input (type=email), role Select (system roles only), language Select; Zod email validation
3. Create `components/settings/users/UserEditModal.tsx` — Dialog prefilled from row; edit name, role, language; Zod resolver
4. Deactivate action: AlertDialog confirm → calls `deactivateUser`; user row shows inactive badge after
5. Add next-intl keys `02-settings.users.*`

### Files
- **Create:** `components/settings/users/UsersList.tsx`, `components/settings/users/UserInviteModal.tsx`, `components/settings/users/UserEditModal.tsx`
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/users/UserInviteModal.test.tsx` — invalid email rejected, role required
- **E2E:** `playwright e2e/settings/users.spec.ts` — admin invites user → user appears in list with invited badge
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/users/`; revert message files.

---

## T-02SETa-009 — UI: RolesList + RoleForm modal (RBAC permission matrix editor)

**Type:** T3-ui
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a 10 Roles + RBAC UI
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `role_assign_modal` — `design/Monopilot Design System/settings/`
  - component_type: modal
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Dialog, Command, Input, Select, Button, Badge, Alert, Avatar
  - estimated_translation_time_min: 60

### Dependencies
- **Upstream (must be done first):** [T-02SETa-004]
- **Downstream (will consume this):** [T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008]

### GIVEN / WHEN / THEN
**GIVEN** `createRole`, `updateRole` server actions exist; `ALL_PERMISSIONS` exported from enum
**WHEN** owner navigates to `/settings/roles`
**THEN** `<RolesList />` renders 10 system roles (locked badge for `is_system=true`) + custom roles; clicking a system role opens read-only detail; clicking custom role opens `<RoleForm />` with permission checkboxes grouped by module prefix (settings.*, npd.*, etc.); `is_system=true` roles show disabled inputs; form validates permissions array non-empty; next-intl keys applied

### Implementation (max 5 sub-steps)
1. Create `components/settings/roles/RolesList.tsx` — Table with code, name, is_system badge, permission count, actions
2. Create `components/settings/roles/RoleForm.tsx` — Dialog; permission checkboxes auto-generated from `ALL_PERMISSIONS` grouped by module prefix; for system roles all inputs disabled with "System roles are immutable" Alert
3. RHF + `zodResolver` — `permissions` must be non-empty array
4. Wire `createRole` / `updateRole` server actions
5. Add next-intl keys `02-settings.roles.*`

### Files
- **Create:** `components/settings/roles/RolesList.tsx`, `components/settings/roles/RoleForm.tsx`
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/roles/RoleForm.test.tsx` — system role shows disabled inputs, empty permissions rejected
- **E2E:** `playwright e2e/settings/roles.spec.ts` — owner creates custom role with 2 permissions → appears in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/roles/`; revert message files.

---

## T-02SETa-010 — UI: OrgSecurityPolicyForm (password / session / MFA settings)

**Type:** T3-ui
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Org security baseline (§14.1)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `security_screen` — `design/Monopilot Design System/settings/`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Switch, Checkbox, Select, Input, Table, Button, Badge, Card
  - estimated_translation_time_min: 120

### Dependencies
- **Upstream (must be done first):** [T-02SETa-005]
- **Downstream (will consume this):** [T-02SETa-026]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `updateOrgSecurityPolicy` server action exists
**WHEN** owner navigates to `/settings/security`
**THEN** page renders security form: `password_min_length` Input (min 8 max 128), `session_timeout_minutes` Input (min 15 max 1440), `lockout_threshold` Input, `mfa_requirement` Select (4 options); RHF + Zod enforces ranges; submit shows success toast; invalid ranges show inline error via shadcn FormMessage; next-intl keys applied

### Implementation (max 5 sub-steps)
1. Create `components/settings/security/SecurityPolicyForm.tsx` — Card layout with RHF + zodResolver
2. Fields: password_min_length (Input type=number), password_history_count (Input), session_timeout_minutes (Input), lockout_threshold (Input), mfa_requirement (Select with 4 enum options)
3. Form section labels and descriptions from next-intl keys
4. On submit: call `updateOrgSecurityPolicy` → success toast via `sonner`; error → Alert
5. Add next-intl keys `02-settings.security.*`

### Files
- **Create:** `components/settings/security/SecurityPolicyForm.tsx`
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/security/SecurityPolicyForm.test.tsx` — out-of-range values rejected, mfa_requirement enum enforced
- **E2E:** `playwright e2e/settings/security.spec.ts` — owner saves security policy → toast appears
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/security/SecurityPolicyForm.tsx`.

---

## T-02SETa-026 — E2E + Integration: Identity track wiring

**Type:** T4-wiring+test
**Context budget:** ~80k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Identity full flow
**Agent:** test-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-027, T-02SETa-028]

### GIVEN / WHEN / THEN
**GIVEN** Orgs/Users/Roles/Security UI + server actions all implemented
**WHEN** Playwright E2E suite runs full admin flow on local Supabase
**THEN** owner creates org → creates user (invite) → assigns role → user logs in → RLS enforces org scope (user from org A cannot read org B data) → org security policy updated → audit_log contains all mutations → outbox_events table contains `org.created`, `user.invited`, `role.assigned`

### Implementation (max 5 sub-steps)
1. Write `e2e/settings/identity-flow.spec.ts`: owner full flow create org → invite user → assign role → verify list
2. Write `e2e/settings/rls-enforcement.spec.ts`: login as user-org-A, attempt to query org-B data → assert 0 rows returned
3. Write integration test `vitest tests/settings/identity.integration.test.ts`: verify audit_log rows exist after each mutation
4. Write integration test for outbox: verify `org.created`, `user.invited`, `role.assigned` events in `outbox_events` table
5. Ensure `pnpm test:smoke` passes all new specs in CI

### Files
- **Create:** `e2e/settings/identity-flow.spec.ts`, `e2e/settings/rls-enforcement.spec.ts`, `tests/settings/identity.integration.test.ts`

### Test gate
- **E2E:** `playwright e2e/settings/identity-flow.spec.ts` — full owner onboard flow
- **E2E:** `playwright e2e/settings/rls-enforcement.spec.ts` — RLS cross-org isolation
- **Integration:** `vitest tests/settings/identity.integration.test.ts` — audit + outbox rows
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete test files; no schema/code changes.

---

## T-02SETa-027 — Seed: 10 system roles + org factory + user factory

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a Identity seed
**Agent:** any
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001]
- **Downstream (will consume this):** [T-02SETa-026, all T4 tasks in E-1]
- **Parallel (can run concurrently):** [T-02SETa-E01, T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** identity schema migrated
**WHEN** `pnpm seed:settings-identity` runs
**THEN** 10 system roles seeded with permissions JSONB; seed factory `createOrgFactory()` creates test org with `org_security_policies` row; `createUserFactory(orgId, roleCode)` creates test user; named snapshot `settings-identity-baseline` available for E2E DB reset

### Implementation (max 5 sub-steps)
1. Create `seed/settings-identity-seed.ts` with typed Drizzle inserts for 10 system roles (permissions array per role per PRD §3)
2. Create `seed/factories/org.factory.ts` with `createOrg(overrides?)` returning typed org row
3. Create `seed/factories/user.factory.ts` with `createUser(orgId, roleCode, overrides?)` returning typed user row
4. Register seed in `seed/index.ts`; add `pnpm seed:settings-identity` npm script
5. Create named snapshot `settings-identity-baseline` via `supabase db dump`

### Files
- **Create:** `seed/settings-identity-seed.ts`, `seed/factories/org.factory.ts`, `seed/factories/user.factory.ts`
- **Modify:** `seed/index.ts`, `package.json`

### Test gate
- **Unit:** `vitest seed/settings-identity-seed.test.ts` — seed runs without error, 10 roles inserted, factory returns valid rows
- **CI gate:** `pnpm seed:settings-identity` green on fresh DB

### Rollback
`supabase db reset` restores pre-seed state.

---

## Track S-β — Reference Data (7 tables + generic CRUD component)

---

## T-02SETa-011 — Schema: reference_tables + reference_schemas (generic storage)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Reference Tables (§5.5, §8)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-02SETa-012, T-02SETa-013, T-02SETa-014, T-02SETa-015, T-02SETa-016, T-02SETa-017, T-02SETa-018, T-02SETa-019, T-02SETa-020, T-02SETa-021]
- **Parallel (can run concurrently):** [T-02SETa-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** reference data schema migration is applied
**THEN** table `reference_tables` (org_id + table_code + row_key PK, row_data JSONB, version INT, is_active BOOL, display_order INT + R13 cols) and `reference_schemas` (org_id, table_code, column_code, dept_code, data_type, tier, storage, dropdown_source, blocking_rule, required_for_done, validation_json, presentation_json, schema_version + created_by) exist with `UNIQUE(org_id, table_code, row_key)` on reference_tables; materialized view `mv_reference_lookup` per (org_id, table_code) exists; RLS enabled

### Implementation (max 5 sub-steps)
1. Author `drizzle/schema/settings-reference.ts` with Drizzle definitions for `reference_tables`, `reference_schemas`
2. Add `schema_version` column and `UNIQUE(org_id, table_code, row_key)` constraint
3. Create Drizzle migration; generate materialized view DDL for `mv_reference_lookup` with REFRESH CONCURRENTLY trigger function
4. Define Zod schemas `referenceRowSchema`, `referenceSchemaDefinitionSchema` in `lib/validators/reference.ts`
5. Integration test: migration applies, unique constraint enforced, MV queryable

### Files
- **Create:** `drizzle/schema/settings-reference.ts`, `drizzle/migrations/003-settings-reference.sql`, `lib/validators/reference.ts`
- **Modify:** `drizzle/schema/index.ts`

### Test gate
- **Integration:** `vitest drizzle/migrations/003-settings-reference.integration.test.ts` — tables exist, unique constraint, MV present
- **Unit:** `vitest lib/validators/reference.test.ts` — Zod rejects unknown data_type, missing required fields
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 003-settings-reference`

---

## T-02SETa-012 — Seed: 7 reference table schema definitions + Forza data

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 02-SET-a Reference Tables seed (§8.1 #1-7)
**Agent:** any
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011]
- **Downstream (will consume this):** [T-02SETa-013, T-02SETa-021, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-027]

### GIVEN / WHEN / THEN
**GIVEN** `reference_tables` and `reference_schemas` tables exist
**WHEN** `pnpm seed:settings-reference` runs
**THEN** `reference_schemas` rows exist for all 7 table codes (`dept_columns`, `pack_sizes`, `lines_by_pack_size`, `dieset_by_line_pack`, `templates`, `processes`, `close_confirm`); Forza baseline data seeded in `reference_tables`: pack_sizes (5 rows), lines_by_pack_size (5 rows), dieset_by_line_pack (10 rows), templates (4 rows), processes (8 rows: Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R), close_confirm (2 rows: Yes/No), dept_columns (58 rows); materialized view refreshed after seed

### Implementation (max 5 sub-steps)
1. Create `seed/settings-reference-seed.ts` with typed Drizzle inserts for `reference_schemas` rows per each of 7 table codes (column definitions per §8.2 schema format)
2. Insert Forza reference data from v7 source: pack_sizes (20x30cm, 25x35cm, 18x24cm, 30x40cm, 15x20cm), processes 8 rows, close_confirm Yes/No, templates 4 rows with process_1..4 mappings
3. Insert `dept_columns` 58 rows (schema metadata from ADR-028 format) with dept_code, data_type, blocking_rule per column
4. Call `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_lookup` after inserts
5. Register seed + add npm script; named snapshot `settings-reference-forza-baseline`

### Files
- **Create:** `seed/settings-reference-seed.ts`, `seed/data/reference/pack-sizes.ts`, `seed/data/reference/processes.ts`, `seed/data/reference/dept-columns.ts`
- **Modify:** `seed/index.ts`, `package.json`

### Test gate
- **Unit:** `vitest seed/settings-reference-seed.test.ts` — seed runs without error, 7 table_codes present in reference_schemas, row counts match
- **CI gate:** `pnpm seed:settings-reference` green on fresh DB

### Rollback
`supabase db reset` to pre-seed; or `DELETE FROM reference_tables WHERE table_code IN (...)`.

---

## T-02SETa-013 — Server Actions: reference CRUD (create/update/delete row + list)

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 70 min
**Parent feature:** 02-SET-a Reference Tables CRUD (§8.3)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011, T-02SETa-E01, T-02SETa-E02]
- **Downstream (will consume this):** [T-02SETa-014, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003]

### GIVEN / WHEN / THEN
**GIVEN** `reference_tables` and `reference_schemas` migrated; `settings.ref.edit` permission exists; 7 table codes seeded in `reference_schemas`
**WHEN** admin calls `listRefRows(tableCode)`, `createRefRow(tableCode, rowKey, data)`, `updateRefRow(tableCode, rowKey, data)`, `deleteRefRow(tableCode, rowKey)` server actions
**THEN** operations are RBAC-guarded (`settings.ref.edit`); `row_data` validated via Zod schema generated from `reference_schemas` column definitions; `version` incremented on update; `is_active=false` on delete (soft); `insertAuditLog()` + `insertOutboxEvent('ref.row.updated')` called; `mv_reference_lookup` REFRESH triggered after mutation

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/reference.ts` with 4 server actions
2. `createRefRow` / `updateRefRow`: generate Zod validator dynamically from `reference_schemas` column defs (function `buildRefZodSchema(tableCode, db)`)
3. Optimistic lock on `version` — reject if version mismatch (returns `CONFLICT` error)
4. Emit audit + outbox + trigger MV REFRESH after mutation
5. Unit test: RBAC guard, Zod validation per table schema, version conflict rejection

### Files
- **Create:** `app/actions/settings/reference.ts`, `app/actions/settings/reference.test.ts`, `lib/reference/zod-builder.ts`
- **Modify:** `lib/validators/reference.ts`

### Test gate
- **Unit:** `vitest app/actions/settings/reference.test.ts` — RBAC guard, version conflict, Zod rejection
- **Integration:** `vitest app/actions/settings/reference.integration.test.ts` — create row → DB present + audit + outbox + MV refreshed
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/reference.ts`, `lib/reference/zod-builder.ts`.

---

## T-02SETa-014 — UI: GenericRefTable + RefRowEditModal (reusable for 7 tables)

**Type:** T3-ui
**Context budget:** ~75k tokens
**Est time:** 100 min
**Parent feature:** 02-SET-a Reference Tables UI (§8.6)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `reference_data_screen` — `design/Monopilot Design System/settings/`
  - component_type: page-layout
  - ui_pattern: list-with-actions
  - shadcn_equivalent: Card, Table, Badge, Button
  - estimated_translation_time_min: 90

### Dependencies
- **Upstream (must be done first):** [T-02SETa-013]
- **Downstream (will consume this):** [T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-022]

### GIVEN / WHEN / THEN
**GIVEN** reference server actions exist; `reference_schemas` defines column metadata for each table; i18n scaffold complete
**WHEN** admin navigates to `/settings/reference/:tableCode`
**THEN** `<GenericRefTable tableCode={tableCode} />` renders data grid with columns auto-generated from `reference_schemas`; "Add Row" opens `<RefRowEditModal />` with RHF form auto-generated from schema; input types match column data_type (text Input / number Input / enum Select / boolean Switch); Zod resolver generated from schema; loading via Skeleton; error via Alert; `RefTablesIndex` page lists 7 tables with row count and last-modified; next-intl keys applied

### Implementation (max 5 sub-steps)
1. Create `components/settings/reference/GenericRefTable.tsx` — accepts `tableCode` prop, fetches columns from `reference_schemas`, renders Table with dynamic columns + active/inactive Badge
2. Create `components/settings/reference/RefRowEditModal.tsx` — Dialog with RHF form auto-built from `reference_schemas.columns[]`; each column renders appropriate input type; `zodResolver` with `buildRefZodSchema`
3. Create `components/settings/reference/RefTablesIndex.tsx` — Card grid listing 7 carveout tables with row count + "Manage" button linking to detail page
4. Handle soft-delete: row shows inactive indicator, "Restore" button for is_active=false rows
5. Add next-intl keys `02-settings.reference.*`

### Files
- **Create:** `components/settings/reference/GenericRefTable.tsx`, `components/settings/reference/RefRowEditModal.tsx`, `components/settings/reference/RefTablesIndex.tsx`
- **Create:** `app/(settings)/reference/[tableCode]/page.tsx`, `app/(settings)/reference/page.tsx`
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/reference/RefRowEditModal.test.tsx` — form auto-generates correct input types, Zod validation rejects missing required field
- **E2E:** `playwright e2e/settings/reference.spec.ts` — admin adds pack_size row → appears in table
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/reference/`; revert message files.

---

## T-02SETa-015 — MV refresh strategy: trigger + on-demand endpoint

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Reference materialized view (§8.4, §5.5)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011]
- **Downstream (will consume this):** [T-02SETa-013, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-012]

### GIVEN / WHEN / THEN
**GIVEN** `mv_reference_lookup` materialized view exists; `reference_tables` has insert/update trigger slot
**WHEN** a row mutation occurs in `reference_tables`
**THEN** Postgres trigger function calls `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_lookup` (for the affected org_id+table_code); `GET /api/settings/reference/refresh` endpoint exists for on-demand admin refresh; refresh latency P95 ≤ 500ms on ≤1000 row tables

### Implementation (max 5 sub-steps)
1. Write Drizzle SQL migration adding trigger function `refresh_mv_reference_lookup()` called AFTER INSERT/UPDATE/DELETE on `reference_tables`
2. Create `app/api/settings/reference/refresh/route.ts` — POST endpoint guarded by `settings.ref.edit` permission, runs REFRESH manually
3. Add latency test fixture with 1000-row seed for performance assertion
4. Integration test: insert row → query MV → row present within 500ms
5. Document refresh strategy in code comment (concurrent refresh avoids lock)

### Files
- **Create:** `drizzle/migrations/004-reference-mv-trigger.sql`, `app/api/settings/reference/refresh/route.ts`

### Test gate
- **Integration:** `vitest tests/settings/mv-refresh.integration.test.ts` — insert row → MV refreshed within 500ms, row queryable
- **CI gate:** `pnpm test:unit` green

### Rollback
Drop trigger function from DB; delete route file.

---

## T-02SETa-025 — E2E + Integration: Reference data track wiring

**Type:** T4-wiring+test
**Context budget:** ~75k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Reference Tables full flow
**Agent:** test-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-014, T-02SETa-015]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-026, T-02SETa-028]

### GIVEN / WHEN / THEN
**GIVEN** Reference CRUD UI + server actions + MV refresh implemented; Forza seed applied
**WHEN** Playwright E2E + integration suite runs
**THEN** admin can CRUD all 7 reference tables; MV refresh fires after each mutation; audit_log rows created; outbox events emitted; optimistic lock conflict returns clear error in UI; RLS prevents cross-org reference row access

### Implementation (max 5 sub-steps)
1. Write `e2e/settings/reference-crud.spec.ts`: admin adds pack_size row, edits it, soft-deletes → row shows inactive; admin restores
2. Write integration test for version conflict: concurrent edit → second writer receives CONFLICT, UI shows merge dialog placeholder
3. Write integration test for MV refresh: insert row → `SELECT FROM mv_reference_lookup` returns row
4. Write RLS test: reference rows from org A not queryable by org B
5. Ensure `pnpm test:smoke` green

### Files
- **Create:** `e2e/settings/reference-crud.spec.ts`, `tests/settings/reference.integration.test.ts`

### Test gate
- **E2E:** `playwright e2e/settings/reference-crud.spec.ts` — full CRUD flow all 7 tables
- **Integration:** `vitest tests/settings/reference.integration.test.ts` — version conflict, MV, RLS
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete test files.

---

## Track S-γ — Module Toggles + i18n Scaffolding

---

## T-02SETa-016 — Schema: modules + organization_modules + feature_flags_core tables

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Module toggles (§10.1, §10.2)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-02SETa-017, T-02SETa-018, T-02SETa-019, T-02SETa-020, T-02SETa-021, T-02SETa-022, T-02SETa-023, T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-001, T-02SETa-011]

### GIVEN / WHEN / THEN
**GIVEN** Baseline migration applied
**WHEN** module toggles schema migration is applied
**THEN** tables `modules` (code TEXT PK, name, dependencies TEXT[], can_disable BOOL, phase INT, display_order), `organization_modules` (org_id + module_code PK, enabled BOOL, enabled_at, enabled_by, phase INT), `feature_flags_core` (org_id + flag_code PK, is_enabled BOOL, rolled_out_pct INT, updated_at) all exist with RLS enabled on org-scoped tables; `modules` populated with 15 module rows from migration; all orgs get `organization_modules` row backfill (enabled per default column)

### Implementation (max 5 sub-steps)
1. Author `drizzle/schema/settings-modules.ts` with Drizzle definitions for 3 tables
2. Seed 15 modules inline in migration with correct dependencies and default enabled values per PRD §10.1 table
3. Add backfill step in migration: `INSERT INTO organization_modules SELECT id, code, can_disable, phase FROM organizations CROSS JOIN modules` (enabled = modules default)
4. Generate Zod schema `moduleToggleSchema`, `featureFlagSchema`
5. Integration test: 15 modules seeded, organization_modules rows created for existing orgs

### Files
- **Create:** `drizzle/schema/settings-modules.ts`, `drizzle/migrations/005-settings-modules.sql`, `lib/validators/modules.ts`
- **Modify:** `drizzle/schema/index.ts`

### Test gate
- **Integration:** `vitest drizzle/migrations/005-settings-modules.integration.test.ts` — 15 modules exist, org_modules backfill applied, RLS enabled
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 005-settings-modules`

---

## T-02SETa-017 — Module toggle middleware (`checkModuleEnabled`)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Module toggles middleware (§10.1 V-SET-40)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016]
- **Downstream (will consume this):** [T-02SETa-024, all E-2 module handlers]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003]

### GIVEN / WHEN / THEN
**GIVEN** `organization_modules` table populated with 15 module rows per org
**WHEN** any route handler or server action calls `checkModuleEnabled(orgId, moduleCode)`
**THEN** if `organization_modules.enabled=true` → resolves; if `enabled=false` → throws `ModuleDisabledError` with `moduleCode`; response: HTTP 403 with `{error: 'MODULE_DISABLED', moduleCode}`; caches per request (no repeated DB query for same org+module in one request)

### Implementation (max 5 sub-steps)
1. Create `lib/modules/middleware.ts` with `checkModuleEnabled(orgId, moduleCode)` + per-request LRU cache (Map keyed by `${orgId}:${moduleCode}`)
2. Create `withModuleCheck(moduleCode)` HOF wrapper for route handlers
3. Test: disabled module → 403 with correct error shape; enabled → resolves; cache hit verified
4. Document which modules to check in which routes (inline comment pattern)
5. Export from `lib/modules/index.ts`

### Files
- **Create:** `lib/modules/middleware.ts`, `lib/modules/middleware.test.ts`, `lib/modules/index.ts`

### Test gate
- **Unit:** `vitest lib/modules/middleware.test.ts` — disabled → ModuleDisabledError, enabled → resolves, cache behavior
- **Integration:** `vitest lib/modules/middleware.integration.test.ts` — toggle org_modules.enabled=false → middleware blocks request
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `lib/modules/middleware.ts`.

---

## T-02SETa-018 — Server Actions: toggleModule + toggleFeatureFlag

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Module toggles CRUD + Feature flags (§10.1, §10.2)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016, T-02SETa-E01, T-02SETa-E02]
- **Downstream (will consume this):** [T-02SETa-019, T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003, T-02SETa-013]

### GIVEN / WHEN / THEN
**GIVEN** `organization_modules` and `feature_flags_core` tables exist; `settings.modules.toggle` permission exists
**WHEN** owner calls `toggleModule(orgId, moduleCode, enabled)` or `toggleFeatureFlag(orgId, flagCode, enabled)`
**THEN** `organization_modules.enabled` / `feature_flags_core.is_enabled` updated; V-SET-40 dependency check: if disabling module A and module B (depends_on includes A) is still enabled → return `DEPENDENCY_CHAIN_WARNING` with affected modules list; `insertAuditLog()` + `insertOutboxEvent('module.toggled')` called; RBAC guard `settings.modules.toggle`

### Implementation (max 5 sub-steps)
1. Create `app/actions/settings/modules.ts` with `toggleModule`, `toggleFeatureFlag`
2. `toggleModule`: before disabling, query `modules` for any module with this code in `dependencies[]` that is still enabled → return `DEPENDENCY_CHAIN_WARNING` payload
3. After confirmation (force=true param): proceed with toggle + audit + outbox
4. `toggleFeatureFlag`: V-SET-42 check for `integration.d365.enabled` — require 5 d365_constants populated
5. Unit tests for guard, dependency chain detection, V-SET-42 enforcement

### Files
- **Create:** `app/actions/settings/modules.ts`, `app/actions/settings/modules.test.ts`

### Test gate
- **Unit:** `vitest app/actions/settings/modules.test.ts` — RBAC guard, dependency chain warning, V-SET-42 enforcement
- **Integration:** `vitest app/actions/settings/modules.integration.test.ts` — toggle → DB updated + audit + outbox
- **CI gate:** `pnpm test:unit` green

### Rollback
Delete `app/actions/settings/modules.ts`.

---

## T-02SETa-019 — UI: ModuleTogglesGrid + FeatureFlagsForm

**Type:** T3-ui
**Context budget:** ~65k tokens
**Est time:** 80 min
**Parent feature:** 02-SET-a Module toggles UI (§10.3)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists for this component

### Dependencies
- **Upstream (must be done first):** [T-02SETa-018]
- **Downstream (will consume this):** [T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-014]

### GIVEN / WHEN / THEN
**GIVEN** `toggleModule` / `toggleFeatureFlag` server actions exist
**WHEN** owner navigates to `/settings/modules`
**THEN** `<ModuleTogglesGrid />` renders 15 modules grouped by phase (1/2/3) as Card grid with phase badge, module name, dependency list tooltip, Toggle switch; disabled state: switch grey + dependency warning AlertDialog on attempt to toggle off a module that has downstream enabled modules; "Feature Flags" section shows 4 core flags as Switch rows; loading via Skeleton; next-intl keys applied

### Implementation (max 5 sub-steps)
1. Create `components/settings/modules/ModuleTogglesGrid.tsx` — groupBy phase rendering via Card grid; per-module Toggle switch with dependency badge
2. Dependency warning: on toggle off click → if `DEPENDENCY_CHAIN_WARNING` returned → show AlertDialog listing affected modules + "Disable all" confirmation
3. Create `components/settings/modules/FeatureFlagsForm.tsx` — Switch rows for 4 core flags; V-SET-42 tooltip on d365 flag
4. Wire `toggleModule` / `toggleFeatureFlag`; invalidate route cache on success
5. Add next-intl keys `02-settings.modules.*`

### Files
- **Create:** `components/settings/modules/ModuleTogglesGrid.tsx`, `components/settings/modules/FeatureFlagsForm.tsx`
- **Create:** `app/(settings)/modules/page.tsx`
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/modules/ModuleTogglesGrid.test.tsx` — dependency warning AlertDialog shown on dependent disable
- **E2E:** `playwright e2e/settings/modules.spec.ts` — owner toggles off independent module → toggle disabled → re-enable works
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete `components/settings/modules/`; revert message files.

---

## T-02SETa-020 — i18n scaffolding: next-intl config + EN full keys + PL placeholders

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a i18n scaffolding (§14.2)
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00a-005] (monorepo scaffold)
- **Downstream (will consume this):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010, T-02SETa-014, T-02SETa-019, all T3 tasks]
- **Parallel (can run concurrently):** [T-02SETa-001, T-02SETa-011, T-02SETa-016]

### GIVEN / WHEN / THEN
**GIVEN** Next.js monorepo scaffold; `next-intl` installed
**WHEN** i18n scaffold is applied
**THEN** `next.config.ts` has next-intl plugin; `i18n.ts` defines locales `['en', 'pl']`, defaultLocale `'pl'`; message files `messages/en/02-settings.json` + `messages/pl/02-settings.json` scaffolded with all E-1 carveout key namespaces (orgs, users, roles, security, reference, modules); EN values filled with production-ready English strings; PL values marked `"__TODO_PL__"` placeholder (detectable by CI lint); `useTranslations('02-settings.orgs')` compiles without error; runtime locale switch tested

### Implementation (max 5 sub-steps)
1. Install/configure `next-intl` plugin in `next.config.ts`; set up `i18n.ts` with locales + routing config
2. Create `messages/en/02-settings.json` with all key namespaces for E-1 scope (orgs.*, users.*, roles.*, security.*, reference.*, modules.*) — full EN strings
3. Create `messages/pl/02-settings.json` with all same keys set to `"__TODO_PL__"` placeholder
4. Add CI lint check: `pnpm lint:i18n` — fail if any EN key missing in PL file (but allow PL `__TODO_PL__` value)
5. Write unit test: `useTranslations('02-settings.orgs').('title')` returns non-empty string in EN; PL returns placeholder

### Files
- **Create:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`, `scripts/lint-i18n.ts`
- **Modify:** `next.config.ts`, `i18n.ts`
- **Modify:** `package.json` (add `pnpm lint:i18n` script)

### Test gate
- **Unit:** `vitest lib/i18n/i18n.test.ts` — EN translations load, PL file has all EN keys
- **Integration:** none needed for pure config
- **CI gate:** `pnpm lint:i18n` green (all EN keys present in PL, no missing keys)

### Rollback
Remove next-intl plugin from `next.config.ts`; delete message files.

---

## T-02SETa-021 — Seed: 15 modules + organization_modules backfill

**Type:** T5-seed
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a Module toggles seed
**Agent:** any
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016]
- **Downstream (will consume this):** [T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-012, T-02SETa-027]

### GIVEN / WHEN / THEN
**GIVEN** `modules` and `organization_modules` tables exist
**WHEN** `pnpm seed:settings-modules` runs
**THEN** 15 modules seeded in `modules` with correct code, name, dependencies[], can_disable, phase, display_order per PRD §10.1; each test org in `organization_modules` backfill has enabled state matching module defaults (00-foundation, 01-npd, 02-settings, 03-technical, 04-planning-basic, 05-warehouse, 06-scanner-p1, 08-production enabled; 07/09/10/11/12/13/14/15 disabled); named snapshot `settings-modules-baseline`

### Implementation (max 5 sub-steps)
1. Create `seed/settings-modules-seed.ts` with typed Drizzle inserts for 15 modules from PRD §10.1 table
2. Backfill `organization_modules` for all orgs in test seed (cross-join with enabled defaults)
3. Register + add npm script
4. Named snapshot `settings-modules-baseline`
5. Unit test: 15 modules inserted, org_modules count = orgs × 15

### Files
- **Create:** `seed/settings-modules-seed.ts`
- **Modify:** `seed/index.ts`, `package.json`

### Test gate
- **Unit:** `vitest seed/settings-modules-seed.test.ts` — 15 modules, org_modules backfill correct counts
- **CI gate:** `pnpm seed:settings-modules` green

### Rollback
`supabase db reset` or `DELETE FROM organization_modules; DELETE FROM modules`.

---

## T-02SETa-022 — UI: reference tables `ref_row_edit_modal` reuse validation + E2E

**Type:** T3-ui
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Reference CRUD (§8.6 SET-052)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** `ref_row_edit_modal` — `design/Monopilot Design System/settings/`
  - component_type: modal
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Dialog, Form, Input, Switch, Button
  - estimated_translation_time_min: 45

### Dependencies
- **Upstream (must be done first):** [T-02SETa-014]
- **Downstream (will consume this):** [T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-019]

### GIVEN / WHEN / THEN
**GIVEN** `<RefRowEditModal />` and `<GenericRefTable />` implemented; 7 table schemas seeded
**WHEN** admin edits each of the 7 reference tables via the modal
**THEN** each table's schema-driven form renders the correct input types (pack_sizes: text+regex, processes: text enum, close_confirm: boolean Switch, dieset_by_line_pack: dropdown linked to lines_by_pack_size, templates: multi-text); validation messages display inline per field using shadcn FormMessage; `display_order` field available on all tables; `is_active` Switch on all tables; all 7 tables confirmed working in a single E2E run

### Implementation (max 5 sub-steps)
1. Verify `RefRowEditModal` auto-generates correct input for `close_confirm` (boolean → Switch), `dieset_by_line_pack` (relation → Select populated from linked table MV)
2. Ensure `dropdown_source` columns render as `<Select>` populated from `mv_reference_lookup` for the source table
3. Add `display_order` numeric Input as optional field on all modals (mapped from `reference_schemas`)
4. Run E2E for all 7 tables and fix any rendering gaps found
5. Update next-intl keys for any missing table-specific labels

### Files
- **Modify:** `components/settings/reference/RefRowEditModal.tsx` (dropdown_source Select support, boolean Switch support)
- **Modify:** `messages/en/02-settings.json`, `messages/pl/02-settings.json`

### Test gate
- **Unit:** `vitest components/settings/reference/RefRowEditModal.test.tsx` — boolean field → Switch rendered; dropdown_source → Select populated
- **E2E:** `playwright e2e/settings/reference-all-tables.spec.ts` — cycle through all 7 tables, add 1 row each, verify in table
- **CI gate:** `pnpm test:smoke` green

### Rollback
Revert `RefRowEditModal.tsx` to pre-step state.

---

## T-02SETa-023 — i18n: user language preference + runtime switcher

**Type:** T3-ui
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a i18n user preference (§14.2)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists for this component

### Dependencies
- **Upstream (must be done first):** [T-02SETa-020, T-02SETa-003]
- **Downstream (will consume this):** [T-02SETa-028]
- **Parallel (can run concurrently):** [T-02SETa-019, T-02SETa-022]

### GIVEN / WHEN / THEN
**GIVEN** next-intl scaffold in place; `users.language` column exists
**WHEN** logged-in user clicks the language picker in the top navigation
**THEN** `<LanguagePicker />` dropdown renders `EN` / `PL` options; selecting a language calls `updateUserLanguage(userId, lang)` server action → `users.language` updated in DB; next-intl cookie set → page re-renders in selected language without full reload (next-intl hot switching); user preference persists across sessions (read from DB on login)

### Implementation (max 5 sub-steps)
1. Create `components/common/LanguagePicker.tsx` — Select dropdown with EN/PL options, current locale highlighted
2. Create `app/actions/settings/language.ts` with `updateUserLanguage(userId, lang)` — validates lang ∈ `['en', 'pl']`, updates `users.language`, sets next-intl locale cookie
3. Integrate `<LanguagePicker />` into main nav layout
4. Test: switching language updates DB + cookie; next page load uses new locale
5. Add V-SET-84 check: unsupported language code rejected

### Files
- **Create:** `components/common/LanguagePicker.tsx`, `app/actions/settings/language.ts`
- **Modify:** `app/layout.tsx` or nav component (add LanguagePicker)

### Test gate
- **Unit:** `vitest app/actions/settings/language.test.ts` — invalid lang code rejected; success path updates DB + cookie
- **E2E:** `playwright e2e/settings/language-switch.spec.ts` — user switches EN→PL → UI labels update (sample key checked)
- **CI gate:** `pnpm test:smoke` green

### Rollback
Remove `LanguagePicker` from nav; delete `language.ts` action.

---

## T-02SETa-024 — E2E + Integration: Modules + i18n track wiring

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 70 min
**Parent feature:** 02-SET-a Modules/i18n full flow
**Agent:** test-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-019, T-02SETa-023, T-02SETa-021]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-025, T-02SETa-026]

### GIVEN / WHEN / THEN
**GIVEN** Module toggles grid + feature flags form + language picker implemented; 15 modules seeded
**WHEN** Playwright E2E + integration suite runs
**THEN** owner toggles off module `01-npd` → middleware blocks subsequent NPD request with 403 MODULE_DISABLED; dependency chain warning shown correctly when toggling off `02-settings`; feature flag `maintenance_mode=true` blocks non-superadmin writes; i18n PL/EN all keys present in CI lint; language switch persists across sessions

### Implementation (max 5 sub-steps)
1. Write `e2e/settings/module-toggles-flow.spec.ts`: toggle off npd → attempt npd route → 403 MODULE_DISABLED received
2. Write `e2e/settings/feature-flags.spec.ts`: enable maintenance_mode → attempt write → blocked; disable → write succeeds
3. Write integration test: dependency chain warning computed correctly for `02-settings` disable attempt
4. Write `tests/settings/i18n-completeness.test.ts`: all EN keys present in PL file (complementary to lint script)
5. Run `pnpm test:smoke` — ensure all pass

### Files
- **Create:** `e2e/settings/module-toggles-flow.spec.ts`, `e2e/settings/feature-flags.spec.ts`, `tests/settings/i18n-completeness.test.ts`

### Test gate
- **E2E:** `playwright e2e/settings/module-toggles-flow.spec.ts` — module disable enforcement
- **E2E:** `playwright e2e/settings/feature-flags.spec.ts` — maintenance mode enforcement
- **Integration:** `vitest tests/settings/i18n-completeness.test.ts` — all keys present
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete test files.

---

## T-02SETa-028 — E2E: full Settings-a acceptance flow (ADR-032 carveout complete)

**Type:** T4-wiring+test
**Context budget:** ~90k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a full carveout acceptance gate
**Agent:** test-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-02SETa-024, T-02SETa-025, T-02SETa-026]
- **Downstream (will consume this):** [Phase E-2 NPD-a unlock]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** All three tracks (S-α, S-β, S-γ) complete; Forza seed applied; full E-1 migration stack applied
**WHEN** Playwright runs `e2e/settings/acceptance.spec.ts`
**THEN** owner creates org → creates user (NPD Manager role) → assigns role → NPD Manager logs in → RLS enforces org scope (cross-org query returns 0 rows) → `pack_sizes` dropdown has 5 Forza rows → `templates` has 4 rows → `processes` has 8 rows → `dieset_by_line_pack` has 10 rows → `dept_columns` schema metadata queryable (58 rows) → modules 01-npd enabled → `organization_modules.enabled=true` for `01-npd` → `permissions.enum.ts` has all 10 settings permission strings → audit_log has entries for all mutations → outbox_events has `org.created`, `user.invited`, `role.assigned` → CI gate green

### Implementation (max 5 sub-steps)
1. Write `e2e/settings/acceptance.spec.ts` covering full ADR-032 carveout requirements (owner flow + user flow + RLS + reference data presence)
2. Assert all 7 reference table row counts match Forza seed expectations
3. Assert permissions.enum.ts exports (static import check in test)
4. Assert audit_log entries per action type
5. Mark as E-2 gate in CI: `pnpm test:smoke --suite=settings-acceptance` must be green before NPD-a dispatch

### Files
- **Create:** `e2e/settings/acceptance.spec.ts`, `tests/settings/carveout-acceptance.integration.test.ts`

### Test gate
- **E2E:** `playwright e2e/settings/acceptance.spec.ts` — full carveout acceptance
- **Integration:** `vitest tests/settings/carveout-acceptance.integration.test.ts` — DB state assertions
- **CI gate:** `pnpm test:smoke` green — **Phase E-2 unlock gate**

### Rollback
Delete test files; re-open Phase E-2 dispatch blocking condition.

---

## Dependency table

| ID | Type | Upstream (hard block) | Parallel |
|---|---|---|---|
| T-02SETa-E01 | T1 | T-00b-E01 | T-02SETa-E02 |
| T-02SETa-E02 | T1 | T-00b-E02 | T-02SETa-E01 |
| T-02SETa-001 | T1 | T-00b-000, T-02SETa-E01 | T-02SETa-011, T-02SETa-016 |
| T-02SETa-002 | T2 | T-02SETa-001, T-02SETa-E01, T-02SETa-E02 | T-02SETa-003 |
| T-02SETa-003 | T2 | T-02SETa-001, T-02SETa-E01, T-02SETa-E02 | T-02SETa-002 |
| T-02SETa-004 | T2 | T-02SETa-001, T-02SETa-E01 | T-02SETa-002, T-02SETa-003 |
| T-02SETa-005 | T2 | T-02SETa-001, T-02SETa-E01, T-02SETa-E02 | T-02SETa-002, T-02SETa-003, T-02SETa-004 |
| T-02SETa-006 | T2 | T-02SETa-001, T-02SETa-E01 | — |
| T-02SETa-007 | T3 | T-02SETa-002, T-02SETa-020 | T-02SETa-008, T-02SETa-009 |
| T-02SETa-008 | T3 | T-02SETa-003, T-02SETa-020 | T-02SETa-007, T-02SETa-009 |
| T-02SETa-009 | T3 | T-02SETa-004, T-02SETa-020 | T-02SETa-007, T-02SETa-008 |
| T-02SETa-010 | T3 | T-02SETa-005, T-02SETa-020 | T-02SETa-007, T-02SETa-008, T-02SETa-009 |
| T-02SETa-011 | T1 | T-00b-000 | T-02SETa-001, T-02SETa-016 |
| T-02SETa-012 | T5 | T-02SETa-011 | T-02SETa-027 |
| T-02SETa-013 | T2 | T-02SETa-011, T-02SETa-E01, T-02SETa-E02 | T-02SETa-002, T-02SETa-003 |
| T-02SETa-014 | T3 | T-02SETa-013, T-02SETa-020 | T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-019, T-02SETa-022 |
| T-02SETa-015 | T2 | T-02SETa-011 | T-02SETa-012 |
| T-02SETa-016 | T1 | T-00b-000 | T-02SETa-001, T-02SETa-011 |
| T-02SETa-017 | T2 | T-02SETa-016 | T-02SETa-002, T-02SETa-003 |
| T-02SETa-018 | T2 | T-02SETa-016, T-02SETa-E01, T-02SETa-E02 | T-02SETa-002, T-02SETa-003, T-02SETa-013 |
| T-02SETa-019 | T3 | T-02SETa-018, T-02SETa-020 | T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-014 |
| T-02SETa-020 | T2 | T-00a-005 | T-02SETa-001, T-02SETa-011, T-02SETa-016 |
| T-02SETa-021 | T5 | T-02SETa-016 | T-02SETa-012, T-02SETa-027 |
| T-02SETa-022 | T3 | T-02SETa-014 | T-02SETa-019 |
| T-02SETa-023 | T3 | T-02SETa-020, T-02SETa-003 | T-02SETa-019, T-02SETa-022 |
| T-02SETa-024 | T4 | T-02SETa-019, T-02SETa-023, T-02SETa-021 | T-02SETa-025, T-02SETa-026 |
| T-02SETa-025 | T4 | T-02SETa-014, T-02SETa-015 | T-02SETa-026, T-02SETa-028 |
| T-02SETa-026 | T4 | T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010 | T-02SETa-025, T-02SETa-024 |
| T-02SETa-027 | T5 | T-02SETa-001 | T-02SETa-E01, T-02SETa-E02, T-02SETa-021 |
| T-02SETa-028 | T4 | T-02SETa-024, T-02SETa-025, T-02SETa-026 | — |

---

## Parallel dispatch plan

### Wave 0 — Enum locks (HARD BLOCKER before all dispatch)
Must merge first, cannot run parallel with each other:
`T-02SETa-E01` → `T-02SETa-E02` (can be parallel with each other, need Foundation T-00b-E01/E02 first)

Also parallel in Wave 0 (independent of enum locks):
- `T-02SETa-020` (i18n scaffold — depends only on monorepo scaffold T-00a-005)

### Wave 1 — Schema foundations (after Wave 0 enums merged; 3 parallel agents)
All 3 can run in parallel (different schema files, no shared modify):
- **Agent 1:** `T-02SETa-001` — Identity schema (organizations, users, roles, security)
- **Agent 2:** `T-02SETa-011` — Reference schema (reference_tables, reference_schemas, MV)
- **Agent 3:** `T-02SETa-016` — Modules schema (modules, organization_modules, feature_flags_core)

### Wave 2 — API layer (after Wave 1 respective schema; up to 5 parallel agents)
Can run in parallel as they create different files:
- **Agent 1:** `T-02SETa-002` + `T-02SETa-003` (orgs actions + users actions, sequential within agent)
- **Agent 2:** `T-02SETa-004` + `T-02SETa-005` (roles actions + security actions, sequential)
- **Agent 3:** `T-02SETa-006` (RBAC middleware — no file conflicts)
- **Agent 4:** `T-02SETa-013` + `T-02SETa-015` (reference CRUD actions + MV refresh, sequential)
- **Agent 5:** `T-02SETa-017` + `T-02SETa-018` (module middleware + toggle actions, sequential)

Parallel with Wave 2 (no API dependencies):
- **Agent 6:** `T-02SETa-027` (seed: org/user factories — depends only on T-02SETa-001)
- **Agent 7:** `T-02SETa-012` (seed: reference data — depends only on T-02SETa-011)
- **Agent 8:** `T-02SETa-021` (seed: 15 modules — depends only on T-02SETa-016)

### Wave 3 — UI layer (after Wave 2 respective actions; up to 4 parallel agents)
- **Agent 1:** `T-02SETa-007` + `T-02SETa-008` (OrgsList + UsersList, sequential — different files)
- **Agent 2:** `T-02SETa-009` + `T-02SETa-010` (RolesList + SecurityForm, sequential)
- **Agent 3:** `T-02SETa-014` (GenericRefTable + RefRowEditModal)
- **Agent 4:** `T-02SETa-019` (ModuleTogglesGrid + FeatureFlagsForm)

Sequential after T-02SETa-014:
- `T-02SETa-022` (RefRowEditModal 7-table validation)

Sequential after T-02SETa-003 + T-02SETa-020:
- `T-02SETa-023` (Language picker)

### Wave 4 — Integration & Wiring (after respective UI complete; 3 parallel agents)
- **Agent 1:** `T-02SETa-026` (Identity E2E — after T-02SETa-007..010)
- **Agent 2:** `T-02SETa-025` (Reference E2E — after T-02SETa-014 + T-02SETa-022)
- **Agent 3:** `T-02SETa-024` (Modules+i18n E2E — after T-02SETa-019 + T-02SETa-023 + T-02SETa-021)

### Wave 5 — Acceptance gate (sequential, must be last)
`T-02SETa-028` (full Settings-a acceptance E2E) — **Phase E-2 NPD-a unlock gate**

---

## PRD coverage

```
PRD coverage (02-SETTINGS-PRD.md v3.3):

✅ §3 Personas & RBAC Overview → T-02SETa-E01, T-02SETa-001, T-02SETa-004, T-02SETa-006, T-02SETa-009
✅ §5.1 Core identity (organizations, users, roles, org_modules) → T-02SETa-001..006, T-02SETa-027
✅ §5.5 Reference tables (generic storage + reference_schemas) → T-02SETa-011..015, T-02SETa-012
✅ §5.7 Security + session (org_security_policies, login_attempts, password_history) → T-02SETa-001, T-02SETa-005, T-02SETa-010
✅ §8.1 7 ref tables in carveout (dept_columns, pack_sizes, lines_by_pack_size, dieset_by_line_pack, templates, processes, close_confirm) → T-02SETa-012, T-02SETa-013, T-02SETa-014, T-02SETa-022
✅ §8.2 Schema definitions per table → T-02SETa-012 (seed reference_schemas rows)
✅ §8.3 CRUD operations → T-02SETa-013
✅ §8.4 Version + audit + MV cache → T-02SETa-013, T-02SETa-015
✅ §10.1 Module toggles (15 modules, org_modules, dependency checker) → T-02SETa-016..019, T-02SETa-021
✅ §10.2 Feature flags core (feature_flags_core table, 4 core flags) → T-02SETa-016, T-02SETa-018, T-02SETa-019
✅ §14.1 Security policies (password/session/MFA) → T-02SETa-001, T-02SETa-005, T-02SETa-010
✅ §14.2 i18n scaffolding (next-intl, EN full, PL placeholders, runtime switch) → T-02SETa-020, T-02SETa-023
⚠️ §8.5 CSV import/export → PARTIAL — export GET endpoint covered by T-02SETa-013 list route; full CSV import wizard (SET-053) deferred to 02-SET-d per ADR-032
⚠️ §14.3 Onboarding Wizard (6-step) → PARTIAL — T-02SETa-007 covers Org Profile step; full 6-step wizard (SET-001..007) deferred to 02-SET-b or standalone spike (outside ADR-032 minimum carveout)
❌ §6 Schema Admin Wizard (ADR-028) → NOT COVERED — deferred to 02-SETTINGS-b per ADR-032
❌ §7 Rule Definitions Registry (ADR-029) → NOT COVERED — deferred to 02-SETTINGS-c per ADR-032
❌ §8.1 Ref tables #8-25 (allergens, alert_thresholds, quality_hold_reasons, etc.) → NOT COVERED — deferred to 02-SET-d per ADR-032 §1.3
❌ §9 Multi-tenant L2 Config (ADR-031) → NOT COVERED — deferred to 02-SETTINGS-b per ADR-032
❌ §11 D365 Constants Admin → NOT COVERED — deferred to 02-SETTINGS-e per ADR-032 (soft blocker S3)
❌ §12 Infrastructure (warehouses, locations, machines, lines) → NOT COVERED — deferred to 02-SETTINGS-a-b boundary; not required for NPD-a unlock (ADR-032)
❌ §13 EmailConfig + Notifications → NOT COVERED — deferred to 02-SETTINGS-d per ADR-032
❌ §14.3 MFA enrollment (TOTP) → NOT COVERED — deferred to 02-SETTINGS-e (soft blocker S5)
```

---

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 5 | E01, E02, 001, 011, 016 |
| T2-api | 9 | 002, 003, 004, 005, 006, 013, 015, 017, 018, 020 |
| T3-ui | 9 | 007, 008, 009, 010, 014, 019, 022, 023 |
| T4-wiring+test | 4 | 024, 025, 026, 028 |
| T5-seed | 4 | 012, 021, 027 |

> Note: T2 count above includes T-02SETa-020 (i18n config). Corrected counts below.

**T1:** 5 | **T2:** 10 | **T3:** 8 | **T4:** 4 | **T5:** 3 + 2 enum locks
**Enum lock tasks (T1 subtype):** T-02SETa-E01, T-02SETa-E02 (counted in T1 total above: 5+2=7 T1-schema total)

**Final counts:**
T1: 7 (incl. E01+E02) | T2: 9 | T3: 8 | T4: 4 | T5: 3
**Total: 31 tasks | Est time: 35–80 min each | Aggregate: ~1350–1950 min (~22–32 agent-hours) | Context budget per task: 20k–90k tokens**

**Wall clock (parallel, 5 agents):** ~3–4 sessions (per kickoff plan §5.2 estimate ✓)
**Phase E-2 unlock gate:** T-02SETa-028 green
