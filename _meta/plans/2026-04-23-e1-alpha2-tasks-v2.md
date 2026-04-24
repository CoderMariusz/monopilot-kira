# E-1 Settings-a Track S-α Part 2 — Identity UI + Wiring + Seed (v2)

Generated: 2026-04-23
Tasks: T-02SETa-007, 008, 009, 010, 026, 027
Track: S-α Identity (UI layer + T4 wiring + T5 seed)

## T-02SETa-007 — UI: OrgsList + OrgForm modal (create/edit)

**Type:** T3-ui
**Prototype ref:** `company_profile_screen` — `design/Monopilot Design System/settings/org-screens.jsx`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Form, Input, Select, Button, Avatar, Card, Separator
  - estimated_translation_time_min: 90
**Context budget:** ~65k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Organizations CRUD
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-002 — Server Actions: createOrg, updateOrg, deleteOrg]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `createOrg`, `updateOrg`, `deleteOrg` server actions exist in `apps/web/app/actions/settings/orgs.ts`; i18n scaffold complete; shadcn components installed
**WHEN** admin navigates to `/settings/organizations`
**THEN** `<OrgsList />` renders org rows (name, slug, status badge, logo avatar, edit/delete actions); "Add Organization" button opens `<OrgForm />` Radix Dialog; form validates via Zod `CreateOrgSchema` (slug regex `^[a-z0-9-]+$` min 3 max 50, name min 1 max 100, logoUrl optional URL); submit calls `createOrg` / `updateOrg` Server Action; `<Skeleton />` shown during loading; `<Alert variant="destructive">` shown on error; success closes modal and calls `revalidatePath`

### ACP Prompt
```
# Task T-02SETa-007 — UI: OrgsList + OrgForm modal (create/edit)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/orgs.ts` → Server Actions createOrg, updateOrg, deleteOrg (sygnatury do użycia)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → definicja tabeli orgs (kolumny, typy)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące klucze i18n (dodaj do namespace orgs.*)

## Prototype reference
Plik: `design/Monopilot Design System/settings/org-screens.jsx` linie 4-100
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog
- [ ] Convert useState form → useForm + zodResolver(CreateOrgSchema)
- [ ] Wire Server Actions createOrg / updateOrg
- [ ] Replace hardcoded labels → next-intl keys (t('settings.orgs.*'))
- [ ] Logo upload placeholder → shadcn Avatar; S3/Blob upload deferred

## Twoje zadanie
GIVEN: createOrg, updateOrg, deleteOrg Server Actions są zaimplementowane; shadcn/ui jest zainstalowany w projekcie.
WHEN: admin wchodzi na /settings/organizations.
THEN: strona renderuje tabelę organizacji z kolumnami name, slug, status badge (active/inactive), logo Avatar, actions (Edit/Delete). Przycisk "Add Organization" otwiera Dialog z formularzem. Formularz waliduje pola przez Zod CreateOrgSchema. Submit wywołuje Server Action. Loading state: Skeleton rows. Error: Alert destructive pod przyciskiem submit. Sukces: zamknij modal + revalidatePath.

Zod schema (embed exact):
```ts
const CreateOrgSchema = z.object({
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, hyphens'),
  name: z.string().min(1).max(100),
  logoUrl: z.string().url().optional(),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/organizations/page.tsx` — Server Component; pobiera listę org przez Drizzle query; renderuje `<OrgsList organizations={orgs} />`
2. Utwórz `apps/web/components/settings/identity/OrgsList.tsx` — Client Component; shadcn Table z kolumnami: Avatar+name, slug, Badge(status), Actions dropdown (Edit/Delete); prop `organizations: Org[]`; "Add Organization" Button otwiera OrgForm Dialog state via useState<boolean>
3. Utwórz `apps/web/components/settings/identity/OrgForm.tsx` — Client Component; Dialog + Form (shadcn); pola: name (Input), slug (Input, auto-generated via `watch('name').toLowerCase().replace(/\s+/g, '-')`), logoUrl (Input type=url optional); zodResolver(CreateOrgSchema); onSubmit: wywołaj createOrg lub updateOrg (zależnie od prop `org?: Org`); loading: Button disabled + spinner; error: Alert variant="destructive"; sukces: onSuccess() callback
4. Loading state dla listy: 5 wierszy `<Skeleton className="h-10 w-full" />` w OrgsList gdy brak danych
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `orgs`: title, addButton, columns (name, slug, status, actions), form (fields, errors, submit), deleteConfirm

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/organizations/page.tsx`, `apps/web/components/settings/identity/OrgsList.tsx`, `apps/web/components/settings/identity/OrgForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj orgs.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/OrgForm.test.tsx` PASS — sprawdza: slug regex rejects 'My Org!' (invalid), valid schema passes, form submit calls createOrg mock
- `playwright apps/web/e2e/settings/orgs.spec.ts` PASS — sprawdza: owner otwiera form, wypełnia name+slug, submit, org pojawia się w tabeli
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/organizations/ apps/web/components/settings/identity/Org*.tsx`; revert messages files.
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/OrgForm.test.tsx` — covers: Zod validation reject (invalid slug), form submit calls server action mock
- **E2E:** `playwright apps/web/e2e/settings/orgs.spec.ts` — covers: owner opens form, fills name+slug, submits, org visible in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/organizations/ apps/web/components/settings/identity/Org*.tsx`; revert message files.

---

## T-02SETa-008 — UI: UsersList + UserInviteModal + UserEditModal

**Type:** T3-ui
**Prototype ref:** `users_screen` — `design/Monopilot Design System/settings/access-screens.jsx`
  - component_type: page-layout
  - ui_pattern: list-with-actions
  - shadcn_equivalent: Table, Tabs, ToggleGroup, Input, Select, Badge, Avatar, Card, Button
  - estimated_translation_time_min: 150
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Users CRUD
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-003 — Server Actions: inviteUser, updateUser, deactivateUser]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `inviteUser`, `updateUser`, `deactivateUser` server actions exist; roles table seeded with system roles
**WHEN** admin navigates to `/settings/users`
**THEN** `<UsersList />` renders user rows with Avatar, displayName, email, role badge (color by role), active/inactive Badge, last login, Actions dropdown (Edit/Deactivate); "Invite User" opens `<UserInviteModal />` (email Input, roleId Select, displayName optional); editing a row opens `<UserEditModal />` prefilled; deactivating shows AlertDialog confirm → calls `deactivateUser`; all forms use RHF + Zod resolver; loading via Skeleton; error via Alert; next-intl keys applied

### ACP Prompt
```
# Task T-02SETa-008 — UI: UsersList + UserInviteModal + UserEditModal

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/users.ts` → Server Actions inviteUser, updateUser, deactivateUser (sygnatury)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela users + roles (kolumny, enum status)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące i18n klucze

## Prototype reference
Plik: `design/Monopilot Design System/settings/access-screens.jsx` linie 4-151 (users_screen) + `settings/modals.jsx` linie 378-407 (user_invite_modal) + linie 410-447 (role_assign_modal)
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog
- [ ] Convert useState form → useForm + zodResolver(InviteUserSchema)
- [ ] Wire Server Actions inviteUser / updateUser / deactivateUser
- [ ] Replace window.SETTINGS_USERS → Drizzle query Server Component
- [ ] Replace hardcoded labels → next-intl keys (t('settings.users.*'))
- [ ] Pills filter (role tabs) → shadcn Tabs or ToggleGroup with URL searchParam

## Twoje zadanie
GIVEN: inviteUser, updateUser, deactivateUser Server Actions są zaimplementowane; tabela roles zawiera system roles.
WHEN: admin wchodzi na /settings/users.
THEN: strona renderuje tabelę użytkowników z Avatar, displayName, email, role Badge (kolorowany per rola), status Badge (active/invited/inactive), last_login, Actions dropdown. "Invite User" Button otwiera UserInviteModal. Edit otwiera UserEditModal prefillowany danymi. Deactivate otwiera AlertDialog confirmation. Loading: Skeleton rows. Error: Alert destructive.

Zod schemas (embed exact):
```ts
const InviteUserSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
  displayName: z.string().optional(),
})

const EditUserSchema = z.object({
  displayName: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  language: z.enum(['en', 'pl']),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/users/page.tsx` — Server Component; Drizzle query na users JOIN roles WHERE tenant_id = currentTenantId; renderuje `<UsersList users={users} roles={roles} />`
2. Utwórz `apps/web/components/settings/identity/UsersList.tsx` — Client Component; shadcn Table: Avatar+displayName, email, role Badge (role.name), status Badge (active=green/invited=yellow/inactive=gray), last_login (formated via date-fns), Actions DropdownMenu (Edit/Deactivate); "Invite User" Button; filtry ról via shadcn Tabs (URL searchParam ?role=)
3. Utwórz `apps/web/components/settings/identity/UserInviteModal.tsx` — Dialog; pola: email (Input type=email), roleId (Select z opcjami z prop roles), displayName (Input optional); zodResolver(InviteUserSchema); onSubmit: wywołaj inviteUser; loading/error handling
4. Utwórz `apps/web/components/settings/identity/UserEditModal.tsx` — Dialog; defaultValues z prop user; pola: displayName (Input), roleId (Select), language (Select en/pl); zodResolver(EditUserSchema); onSubmit: wywołaj updateUser; Deactivate button → AlertDialog confirm → deactivateUser
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `users`: title, inviteButton, columns (name, email, role, status, lastLogin, actions), form (invite/edit fields/errors/submit), deactivateConfirm

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/users/page.tsx`, `apps/web/components/settings/identity/UsersList.tsx`, `apps/web/components/settings/identity/UserInviteModal.tsx`, `apps/web/components/settings/identity/UserEditModal.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj users.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/UserInviteModal.test.tsx` PASS — sprawdza: invalid email rejected, roleId required (empty string fails uuid()), valid schema passes
- `playwright apps/web/e2e/settings/users.spec.ts` PASS — sprawdza: admin invites user → user pojawia się w tabeli ze statusem 'invited'
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/users/ apps/web/components/settings/identity/User*.tsx`; revert messages files.
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/UserInviteModal.test.tsx` — covers: invalid email rejected, role required
- **E2E:** `playwright apps/web/e2e/settings/users.spec.ts` — covers: admin invites user → appears in list with invited badge
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/users/ apps/web/components/settings/identity/User*.tsx`; revert message files.

---
## T-02SETa-009 — UI: RolesList + RoleForm modal (RBAC permission matrix editor)

**Type:** T3-ui
**Prototype ref:** `role_assign_modal` — `design/Monopilot Design System/settings/modals.jsx`
  - component_type: modal
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Dialog, Command, Input, Select, Button, Badge, Alert, Avatar
  - estimated_translation_time_min: 60
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a 10 Roles + RBAC UI
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-004 — Server Actions: createRole, updateRole; ALL_PERMISSIONS enum]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008]

### GIVEN / WHEN / THEN
**GIVEN** `createRole`, `updateRole` server actions exist; `ALL_PERMISSIONS` enum exported from `lib/rbac/permissions.enum.ts`
**WHEN** owner navigates to `/settings/roles`
**THEN** `<RolesList />` renders 10 system roles (lock Badge for `is_system=true`) plus custom roles; clicking a system role opens read-only detail Dialog with "System roles are immutable" Alert; clicking custom role opens `<RoleForm />` with permission checkboxes grouped by module prefix (settings.*, npd.*, warehouse.*, etc.); system role inputs are disabled; form validates `permissions` must be non-empty array; submit calls `createRole` / `updateRole`; next-intl keys applied

### ACP Prompt
```
# Task T-02SETa-009 — UI: RolesList + RoleForm modal (RBAC permission matrix editor)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/roles.ts` → Server Actions createRole, updateRole (sygnatury)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/lib/rbac/permissions.enum.ts` → ALL_PERMISSIONS array + Permission enum (wszystkie strings do grupowania)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela roles, role_permissions (kolumny is_system, permissions JSONB)

## Prototype reference
Plik: `design/Monopilot Design System/settings/modals.jsx` linie 410-447 (role_assign_modal)
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog with size='wide'
- [ ] Convert local user search → shadcn Command (cmdk) for async user lookup (not needed for RoleForm; use Checkbox matrix)
- [ ] Convert useState form → useForm + zodResolver(RoleSchema)
- [ ] Wire Server Actions createRole / updateRole
- [ ] Replace hardcoded labels → next-intl keys (t('settings.roles.*'))

## Twoje zadanie
GIVEN: createRole, updateRole Server Actions są zaimplementowane; ALL_PERMISSIONS = string[] exported from lib/rbac/permissions.enum.ts.
WHEN: owner wchodzi na /settings/roles.
THEN: tabela ról z kolumnami: name, code, is_system Badge (lock icon + "System"), permission count, Actions. System roles: readonly detail Dialog. Custom roles: RoleForm Dialog z macierzą checkboxów. Grupowanie permissionów: prefix przed pierwszą kropką (settings, npd, warehouse, production, finance, qa, oee, maintenance, scanning, reporting). permissions muszą być non-empty. Submit tworzy/aktualizuje rolę.

Zod schema (embed exact):
```ts
const RoleSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  permissions: z.array(z.string()).min(1, 'At least one permission required'),
})
```

Permission groups to render as checkbox sections (wygeneruj dynamicznie z ALL_PERMISSIONS):
- ORGS: settings.orgs.view, settings.orgs.create, settings.orgs.update, settings.orgs.delete
- USERS: settings.users.view, settings.users.create, settings.users.update, settings.users.deactivate
- ROLES: settings.roles.view, settings.roles.create, settings.roles.update, settings.roles.delete
- SECURITY: settings.security.view, settings.security.update
- REFERENCE: settings.reference.view, settings.reference.create, settings.reference.update, settings.reference.delete
- MODULES: settings.modules.view, settings.modules.toggle
- NPD: npd.items.view, npd.items.create, npd.items.update, npd.items.approve
- WAREHOUSE: warehouse.stock.view, warehouse.stock.create, warehouse.transfers.create, warehouse.adjustments.create

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/roles/page.tsx` — Server Component; Drizzle query na roles WHERE tenant_id = currentTenantId ORDER BY is_system DESC, name ASC; renderuje `<RolesList roles={roles} />`
2. Utwórz `apps/web/components/settings/identity/RolesList.tsx` — Client Component; shadcn Table: name, code, is_system Badge (lock + "System" / "Custom"), permission_count, Actions (Edit dla custom / View dla system); "Add Role" Button; open state via useState<{open: boolean, role: Role | null}>
3. Utwórz `apps/web/components/settings/identity/RoleForm.tsx` — Dialog (size wide via className="max-w-3xl"); pola: name (Input), code (Input, auto z name), ScrollArea z sekcjami checkbox per group; dla is_system=true: wszystkie inputy disabled + Alert "System roles are immutable"; zodResolver(RoleSchema); permissions: wartości z checkboxów (controlled array via useForm setValue)
4. Helper `groupPermissions(permissions: string[]): Record<string, string[]>` — grupuje ALL_PERMISSIONS po prefixie (split('.')[0].toUpperCase()); renderuj jako <Accordion> lub sekcje Card per group
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `roles`: title, addButton, columns, form (fields, errors, submit), systemRoleImmutableAlert, permissionGroups.*

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/roles/page.tsx`, `apps/web/components/settings/identity/RolesList.tsx`, `apps/web/components/settings/identity/RoleForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj roles.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/RoleForm.test.tsx` PASS — sprawdza: system role renders disabled inputs + immutable Alert, empty permissions array fails validation, valid custom role passes
- `playwright apps/web/e2e/settings/roles.spec.ts` PASS — sprawdza: owner creates custom role z 2 permissions → rola pojawia się w tabeli
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/roles/ apps/web/components/settings/identity/Role*.tsx`; revert messages files.
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/RoleForm.test.tsx` — covers: system role shows disabled inputs, empty permissions rejected
- **E2E:** `playwright apps/web/e2e/settings/roles.spec.ts` — covers: owner creates custom role with 2 permissions → appears in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/roles/ apps/web/components/settings/identity/Role*.tsx`; revert message files.

---

## T-02SETa-010 — UI: OrgSecurityPolicyForm (password / session / MFA settings)

**Type:** T3-ui
**Prototype ref:** `security_screen` — `design/Monopilot Design System/settings/access-screens.jsx`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Switch, Checkbox, Select, Input, Table, Button, Badge, Card
  - estimated_translation_time_min: 120
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Org security baseline
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-005 — Server Action: updateOrgSecurityPolicy]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `updateOrgSecurityPolicy` server action exists; `org_security_policies` table migrated with columns: `min_password_length INT`, `require_mfa BOOLEAN`, `session_timeout_min INT`, `sso_enabled BOOLEAN`, `allowed_domains TEXT[]`
**WHEN** owner navigates to `/settings/security`
**THEN** page renders `<OrgSecurityPolicyForm />` pre-loaded with current policy; fields: minPasswordLength Input (min 8 max 128), requireMfa Switch, sessionTimeoutMin Input (min 15 max 10080), ssoEnabled Switch, allowedDomains dynamic tag input; RHF + Zod enforces ranges; submit shows success toast via `sonner`; invalid ranges show inline error via shadcn FormMessage; next-intl keys applied

### ACP Prompt
```
# Task T-02SETa-010 — UI: OrgSecurityPolicyForm (password / session / MFA settings)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/security.ts` → Server Action updateOrgSecurityPolicy (sygnatura + return type)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela org_security_policies (kolumny i typy do użycia w Server Component query)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące klucze i18n

## Prototype reference
Plik: `design/Monopilot Design System/settings/access-screens.jsx` linie 154-239 (security_screen)
Translation checklist:
- [ ] Section + SRow primitives → shadcn Card sections with FormDescription hints
- [ ] Toggle (2FA, SSO) → shadcn Switch; each triggers updateOrgSecurityPolicy Server Action
- [ ] Checkbox group for 2FA methods → shadcn Checkbox with useForm array field
- [ ] Password policy selects + number inputs → useForm + zodResolver(SecurityPolicySchema)
- [ ] Replace hardcoded labels → next-intl keys (t('settings.security.*'))

## Twoje zadanie
GIVEN: updateOrgSecurityPolicy Server Action jest zaimplementowany; org_security_policies tabela istnieje.
WHEN: owner wchodzi na /settings/security.
THEN: strona renderuje OrgSecurityPolicyForm z aktualną polityką załadowaną server-side. Pola: minPasswordLength (Input type=number min=8 max=128), requireMfa (Switch), sessionTimeoutMin (Input type=number min=15 max=10080), ssoEnabled (Switch), allowedDomains (dynamiczny tag input). RHF + Zod. Submit → success toast via sonner; błędy → FormMessage inline. Tylko właściciel/admin ma dostęp (renderuj disabled z tooltipem dla innych ról).

Zod schema (embed exact):
```ts
const SecurityPolicySchema = z.object({
  minPasswordLength: z.number().int().min(8).max(128),
  requireMfa: z.boolean(),
  sessionTimeoutMin: z.number().int().min(15).max(10080),
  ssoEnabled: z.boolean(),
  allowedDomains: z.array(z.string()).default([]),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/security/page.tsx` — Server Component; Drizzle query na org_security_policies WHERE tenant_id = currentTenantId; jeśli brak wiersza → defaults ({minPasswordLength:8, requireMfa:false, sessionTimeoutMin:480, ssoEnabled:false, allowedDomains:[]}); renderuje `<OrgSecurityPolicyForm policy={policy} />`
2. Utwórz `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx` — Client Component; shadcn Card layout (3 sekcje: Password Policy, Session & MFA, SSO & Domains); useForm<SecurityPolicySchema>({ resolver: zodResolver(SecurityPolicySchema), defaultValues: props.policy }); każda sekcja jako Card z CardHeader + CardContent
3. Password Policy sekcja: minPasswordLength (FormField + Input type=number), description hint (FormDescription) "8-128 characters"
4. Session & MFA sekcja: requireMfa (FormField + Switch), sessionTimeoutMin (FormField + Input type=number), description hints
5. SSO & Domains sekcja: ssoEnabled (Switch), allowedDomains — simple tag-input: Input + Button "Add Domain" appending to array field via setValue; existing domains rendered jako Badge z X button; onSubmit: wywołaj updateOrgSecurityPolicy → toast.success() z sonner; error → Alert destructive; dodaj klucze i18n pod `security.*`

Shadcn imports (exact):
```tsx
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
```

## Files
**Create:** `apps/web/app/(app)/settings/security/page.tsx`, `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj security.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/security/OrgSecurityPolicyForm.test.tsx` PASS — sprawdza: minPasswordLength=5 rejected (min 8), sessionTimeoutMin=10 rejected (min 15), requireMfa accepts boolean, valid schema passes
- `playwright apps/web/e2e/settings/security.spec.ts` PASS — sprawdza: owner saves security policy z requireMfa=true → success toast pojawia się
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/(app)/settings/security/page.tsx apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`; revert messages files.
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/security/OrgSecurityPolicyForm.test.tsx` — covers: out-of-range values rejected, requireMfa boolean enforced
- **E2E:** `playwright apps/web/e2e/settings/security.spec.ts` — covers: owner saves security policy → success toast appears
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/(app)/settings/security/page.tsx apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`; revert message files.

---
## T-02SETa-026 — E2E + Integration: Identity track wiring

**Type:** T4-wiring+test
**Context budget:** ~80k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Identity full flow
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010 — all Identity UI tasks]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-027 — Seed]

### GIVEN / WHEN / THEN
**GIVEN** Orgs/Users/Roles/Security UI + server actions all implemented and pages accessible at `/settings/organizations`, `/settings/users`, `/settings/roles`, `/settings/security`
**WHEN** Playwright E2E suite runs full admin flow on local Supabase; integration tests run against `supabaseLocalDb` fixture (no DB mocks)
**THEN** owner creates org → invites user → creates custom role → assigns role to user → user logs in → RLS enforces org scope (user from org A cannot read org B rows) → org security policy updated → `audit_log` contains rows for each mutation → `outbox_events` table contains `org.created`, `user.invited`, `role.assigned` events

### ACP Prompt
```
# Task T-02SETa-026 — E2E + Integration: Identity track wiring

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/orgs.ts` → createOrg, updateOrg signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/users.ts` → inviteUser, updateUser, deactivateUser signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/roles.ts` → createRole, updateRole signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/security.ts` → updateOrgSecurityPolicy signature
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabele orgs, users, roles, role_permissions, org_security_policies, audit_log, outbox_events
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/seed/settings-identity-seed.ts` → factory functions createOrg, createUser (po T-02SETa-027)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/tests/helpers/supabase-fixture.ts` → supabaseLocalDb fixture (zero DB mocks); createClient({ userId }) dla RLS tests

## Twoje zadanie
GIVEN: Wszystkie Identity UI + Server Actions są zaimplementowane. Seed factories dostępne (T-02SETa-027 upstream).
Napisz integration tests (vitest + supabaseLocalDb fixture, zero DB mocks) i E2E tests (Playwright).

Integration tests — `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`:
1. createOrg → weryfikuj wiersz w tabeli orgs; audit_log zawiera action='org.created'; outbox_events zawiera EventType.ORG_CREATED
2. inviteUser → weryfikuj wiersz w users ze status='invited'; outbox_events zawiera EventType.USER_INVITED z payload.email
3. assignRole → weryfikuj role_permissions updated; outbox_events zawiera EventType.ROLE_ASSIGNED
4. updateSecurityPolicy → weryfikuj wiersz w org_security_policies; audit_log zawiera action='security_policy.updated'
5. Cross-tenant isolation: createClient({ userId: userOrgA.id }) → SELECT * FROM orgs → 0 rows dla orgB (RLS enforcement)

E2E tests — `apps/web/e2e/settings/identity.spec.ts`:
Full flow: login jako admin (seed user) → /settings/organizations → create org → /settings/users → invite user (z email) → /settings/roles → create custom role z 2 permissions → assign role to invited user → /settings/security → save security policy → verify all items visible in respective lists

## Implementacja
1. Utwórz `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`:
   - import { supabaseLocalDb } from `tests/helpers/supabase-fixture`
   - Każdy test: before createOrg/user via seed factories; after cleanup via db.delete
   - assert audit_log: `db.select().from(auditLog).where(eq(auditLog.action, 'org.created'))` → length >= 1
   - assert outbox: `db.select().from(outboxEvents).where(eq(outboxEvents.eventType, 'org.created'))` → length >= 1
   - RLS test: `const clientA = createClient({ userId: userA.id })`; `const { data } = await clientA.from('orgs').select()`; expect(data).toHaveLength(1) (only own org)
2. Utwórz `apps/web/e2e/settings/identity.spec.ts`:
   - `test.beforeAll`: seed test DB z settings-identity-baseline snapshot (supabase db reset --db-url=$LOCAL_DB_URL)
   - test('admin full identity flow', async ({ page }) => { /* pełny flow */ })
   - Użyj `page.getByRole('button', { name: 'Add Organization' })` + `page.getByLabel('Name')` etc. (accessibility selectors)
   - Każdy krok: `await expect(page.getByText('orgName')).toBeVisible()` po submit
3. Upewnij się że `pnpm test:smoke` uruchamia oba pliki; dodaj do jest/vitest config jeśli brakuje

## Files
**Create:** `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`, `apps/web/e2e/settings/identity.spec.ts`
**Modify:** `playwright.config.ts` — dodaj `e2e/settings/identity.spec.ts` do test match jeśli glob nie pokrywa; `vitest.config.ts` — upewnij się że `__tests__/**/*.integration.test.ts` jest w include

## Done when
- `vitest apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts` PASS — sprawdza: createOrg → audit_log row, inviteUser → outbox event, cross-tenant RLS 0 rows
- `playwright apps/web/e2e/settings/identity.spec.ts` PASS — sprawdza: pełny admin onboard flow end-to-end
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts apps/web/e2e/settings/identity.spec.ts` — no schema/code changes.
```

### Test gate (planning summary)
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts` — covers: DB mutations, audit_log rows, outbox events, RLS cross-tenant isolation
- **E2E:** `playwright apps/web/e2e/settings/identity.spec.ts` — covers: full owner onboard flow
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts apps/web/e2e/settings/identity.spec.ts` — no schema/code changes.

---

## T-02SETa-027 — Seed: 10 system roles + org factory + user factory

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a Identity seed
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — Schema: organizations + users + roles tables migrated]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring; all T4 tasks in E-1]
- **Parallel (can run concurrently):** [T-02SETa-E01, T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** identity schema migrated (tables: orgs, users, roles, role_permissions, org_security_policies all exist)
**WHEN** `pnpm seed:settings-identity` runs against local Supabase
**THEN** 10 system roles inserted with `is_system=true` and permissions JSONB; `createOrg(overrides?)` factory creates a test org with `org_security_policies` default row; `createUser(orgId, roleCode, overrides?)` factory creates test user with role assigned; named snapshot `settings-identity-baseline` available via `supabase db dump` for E2E DB reset; re-runs are idempotent (upsert by code)

### ACP Prompt
```
# Task T-02SETa-027 — Seed: 10 system roles + org factory + user factory

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → typy NewRole, NewOrg, NewUser, Role, Org, User (Drizzle inferred types)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/lib/rbac/permissions.enum.ts` → Permission enum strings (użyj do SYSTEM_ROLES permissions arrays)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/seed/index.ts` → istniejący seed entrypoint (dodaj import i wywołanie)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/package.json` → istniejące npm scripts (dodaj seed:settings-identity)

## Twoje zadanie
GIVEN: Tabele orgs, users, roles, role_permissions, org_security_policies są zmigratowane.
Napisz seed file + factory functions. Seed musi być idempotentny (upsert by code/slug). Factory functions muszą być typed (Drizzle inferred types).

SYSTEM_ROLES (embed exact):
```ts
export const SYSTEM_ROLES = [
  { name: 'Owner', code: 'owner', permissions: ['settings:*', 'npd:*', 'warehouse:*', 'production:*', 'finance:*', 'qa:*', 'oee:*', 'maintenance:*', 'scanning:*', 'reporting:*'] },
  { name: 'Admin', code: 'admin', permissions: ['settings.orgs:*', 'settings.users:*', 'settings.roles:*', 'settings.security:*', 'settings.reference:*'] },
  { name: 'Member', code: 'member', permissions: ['npd.items:view', 'warehouse.stock:view', 'production:view', 'reporting:view'] },
  { name: 'Viewer', code: 'viewer', permissions: ['npd.items:view', 'warehouse.stock:view', 'reporting:view'] },
  { name: 'Billing', code: 'billing', permissions: ['finance:*', 'reporting.finance:view'] },
  { name: 'DevOps', code: 'devops', permissions: ['settings.modules:*', 'settings.reference:view'] },
  { name: 'HR', code: 'hr', permissions: ['settings.users:*', 'reporting.hr:view'] },
  { name: 'Sales', code: 'sales', permissions: ['npd:*', 'reporting.sales:view'] },
  { name: 'Operations', code: 'ops', permissions: ['warehouse:*', 'production:*', 'scanning:*', 'oee:view', 'maintenance:view'] },
  { name: 'Read-only', code: 'readonly', permissions: ['npd.items:view', 'warehouse.stock:view', 'production:view', 'reporting:view', 'qa:view'] },
]
```

## Implementacja
1. Utwórz `apps/web/seed/settings-identity-seed.ts`:
   - Drizzle typed inserts; import db from `lib/db`; import { roles, orgs, users, orgSecurityPolicies } from `drizzle/schema/settings-identity`
   - seedSystemRoles(): `db.insert(roles).values(SYSTEM_ROLES.map(r => ({ ...r, isSystem: true, tenantId: SYSTEM_TENANT_ID }))).onConflictDoUpdate({ target: roles.code, set: { permissions: sql`excluded.permissions` } })`
   - export async function seedSettingsIdentity(): Promise<void> — wywołuje seedSystemRoles()
2. Utwórz `apps/web/seed/factories/org.factory.ts`:
   ```ts
   export async function createOrg(overrides?: Partial<NewOrg>): Promise<Org> {
     const defaults: NewOrg = { slug: `test-org-${Date.now()}`, name: 'Test Org', tenantId: overrides?.tenantId ?? generateTestTenantId(), schemaVersion: 1 }
     const [org] = await db.insert(orgs).values({ ...defaults, ...overrides }).returning()
     await db.insert(orgSecurityPolicies).values({ orgId: org.id, tenantId: org.tenantId, minPasswordLength: 8, requireMfa: false, sessionTimeoutMin: 480, ssoEnabled: false, allowedDomains: [], schemaVersion: 1 }).onConflictDoNothing()
     return org
   }
   ```
3. Utwórz `apps/web/seed/factories/user.factory.ts`:
   ```ts
   export async function createUser(orgId: string, roleCode: string, overrides?: Partial<NewUser>): Promise<User> {
     const defaults: NewUser = { email: `test-${Date.now()}@example.com`, displayName: 'Test User', orgId, status: 'active', schemaVersion: 1 }
     const [user] = await db.insert(users).values({ ...defaults, ...overrides }).returning()
     const role = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1)
     if (role[0]) await db.insert(userRoles).values({ userId: user.id, roleId: role[0].id })
     return user
   }
   export async function assignRole(userId: string, roleId: string): Promise<void> {
     await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing()
   }
   ```
4. Zmodyfikuj `apps/web/seed/index.ts` — dodaj `import { seedSettingsIdentity } from './settings-identity-seed'`; wywołaj w main seed function
5. Zmodyfikuj `package.json` — dodaj `"seed:settings-identity": "tsx apps/web/seed/settings-identity-seed.ts"`; po seedzie utwórz snapshot: `supabase db dump --db-url $LOCAL_DB_URL -f .snapshots/settings-identity-baseline.sql`

R13 columns dla wszystkich Drizzle table inserts — każda tabela business ma:
`id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`
Upewnij się że factory functions przekazują `schemaVersion: 1` do każdego insertu.

## Files
**Create:** `apps/web/seed/settings-identity-seed.ts`, `apps/web/seed/factories/org.factory.ts`, `apps/web/seed/factories/user.factory.ts`
**Modify:** `apps/web/seed/index.ts` — dodaj import + wywołanie; `package.json` — dodaj seed:settings-identity script

## Done when
- `vitest apps/web/seed/settings-identity-seed.test.ts` PASS — sprawdza: seedSettingsIdentity() runs without error, 10 roles in DB with is_system=true, createOrg() returns typed Org with id/slug/tenantId, createUser() returns typed User with correct orgId
- `pnpm seed:settings-identity` PASS na fresh local DB (zero pre-existing rows)
- `pnpm test:smoke` green

## Rollback
`supabase db reset --db-url $LOCAL_DB_URL` restores pre-seed state; `rm apps/web/seed/settings-identity-seed.ts apps/web/seed/factories/org.factory.ts apps/web/seed/factories/user.factory.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/seed/settings-identity-seed.test.ts` — covers: seed runs without error, 10 roles inserted, factory returns valid typed rows
- **CI gate:** `pnpm seed:settings-identity` green on fresh DB
- **CI gate:** `pnpm test:smoke` green

### Rollback
`supabase db reset --db-url $LOCAL_DB_URL`; `rm apps/web/seed/settings-identity-seed.ts apps/web/seed/factories/org.factory.ts apps/web/seed/factories/user.factory.ts`

---
## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-02SETa-007 | [T-02SETa-002] | [T-02SETa-008, T-02SETa-009] |
| T-02SETa-008 | [T-02SETa-003] | [T-02SETa-007, T-02SETa-009] |
| T-02SETa-009 | [T-02SETa-004] | [T-02SETa-007, T-02SETa-008] |
| T-02SETa-010 | [T-02SETa-005] | [T-02SETa-007, T-02SETa-008, T-02SETa-009] |
| T-02SETa-026 | [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010] | [T-02SETa-027] |
| T-02SETa-027 | [T-02SETa-001] | [T-02SETa-026 (can start parallel once schema done)] |

## Parallel dispatch plan

Wave 0 (schema prerequisite — must be done): T-02SETa-001 (schema), T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005 (server actions — all in E-1 alpha Part 1)
Wave 1 (UI — all parallel, each has distinct upstream SA): T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010
Wave 1b (seed — parallel with UI): T-02SETa-027
Wave 2 (after all UI done): T-02SETa-026

## PRD coverage

✅ Organizations CRUD UI → T-02SETa-007
✅ Users CRUD + Invite UI → T-02SETa-008
✅ Roles RBAC matrix editor UI → T-02SETa-009
✅ Security policy form UI → T-02SETa-010
✅ E2E + Integration wiring → T-02SETa-026
✅ System roles seed + factories → T-02SETa-027
⚠️ SSO/SAML configuration — basic ssoEnabled switch only; SAML provider config deferred to E-1-b
⚠️ SCIM provisioning toggle — not in scope for E-1 alpha

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T3-ui | 4 | 007, 008, 009, 010 |
| T4-wiring+test | 1 | 026 |
| T5-seed | 1 | 027 |
| **Total** | **6** | |

Est total time: ~450 min (007: 90 + 008: 90 + 009: 90 + 010: 60 + 026: 90 + 027: 30)
Context budget: ~375k tokens total
