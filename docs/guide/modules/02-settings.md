# Settings — org/sites, users & RBAC, infra master, sign-off config + feature flags (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. 02-settings is the **admin
> control plane** of the product: it owns the org profile, the **sites / lines /
> machines / warehouses / locations / dock-doors** physical master, **users &
> roles (RBAC)**, the **sign-off policies** (`signoff_policies`) and PIN toggles,
> **document numbering** (`org_document_settings`), **feature flags**
> (`feature_flags_core` + `tenant_variations.feature_flags`), reference data,
> the **schema-driven** L3 column wizard, and the integration surfaces (D365,
> email, labels, SCIM/SSO/IP-allowlist).
>
> Almost every settings screen lives in **one route group**:
> `…/[locale]/(app)/(admin)/settings/…` → `/settings/{company,sites,infra/*,
> machines,shifts,labor-rates,users,roles,security,audit,signoff,scanner-auth,
> devices,documents,flags,features,rules,reference,schema,units,products,boms,
> integrations,…}`. Two **user/role write actions** live OUTSIDE the route group
> in `apps/web/actions/users/*` (invite / create-with-password / assign-role /
> deactivate), and **dock-doors** are surfaced under Settings → Infra → Docks but
> physically owned by the yard module (`(modules)/yard/_actions/yard-actions.ts`,
> mig 317). The nav that stitches it all together is
> `apps/web/lib/navigation/settings-nav.ts`.
>
> **Site ≡ Warehouse** (owner decision 2026-06-24): "site" is the canonical
> physical entity; there are no duplicate warehouse columns — production lines
> already carry `site_id`. The sites CRUD lives in
> `settings/sites/_actions/sites.ts`. Routes are written without the `[locale]`
> prefix. Last reviewed against the uncommitted working tree (E5 dock-doors,
> E4B labor rates, scanner-auth PIN toggle, RBAC matrix seed mig 150).

---

## a. Overview

Settings answers one question: **how is this org configured?** It is mostly a
collection of **org-scoped CRUD screens** plus a small number of governance
mechanisms (RBAC, sign-off, audit). There is no long-running document lifecycle
the way Planning/Production have — the closest thing to a "state machine" is the
**RBAC grant resolution** (§c) that every other action depends on.

Every settings write follows the **same canonical shape** (the company-profile
pattern, copied verbatim across `sites.ts` / `machines/_actions` /
`devices/_actions` / `signoff/_actions` / `shifts/_actions` / `documents.ts`):
`'use server'` → zod-parse the input **inside** the action → wrap in
`withOrgContext` (one txn, RLS via `app.current_org_id()`) → re-check a literal
**permission string** with a dual-store `hasPermission` query → org-scoped
`INSERT`/`UPDATE`/`UPSERT` → `revalidatePath`. A missing permission returns a
typed `{ ok:false, error:'forbidden' }` (or a thrown `forbidden` mapped to a
`permission_denied` page state), never a 500. The permission is re-checked
server-side even when the client already hid the affordance (`can_edit` /
`canManage` only governs rendering — see `sites.ts:108-115`,
`infra/docks/page.tsx:78-81`).

The **physical master** (sites / production_lines / machines / warehouses /
locations / dock_doors / shifts / labor_rates / scanner_devices) is the
reference data the rest of the plant reads: Production resolves lines, Planning
resolves machines + warehouses, the scanner pairs to `scanner_devices`, and the
yard books `dock_doors`.

The **RBAC layer** (`packages/rbac/src/permissions.enum.ts` + the
`roles`/`role_permissions`/`user_roles` tables from `017-rbac.sql`) is the most
load-bearing part of the module: the **org-admin role family** is granted the
full `settings.*` permission set durably by migration **150** (the authoritative
RBAC matrix seed, with an org-insert trigger so new tenants inherit it).

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action via a dual-store `hasPermission` query
> (`role_permissions` row **OR** the legacy `roles.permissions` jsonb cache **OR**,
> in some gates, the role `code`/`slug`). The user/role write actions live in
> `apps/web/actions/users/*`; everything else under
> `settings/<area>/_actions/*`.

### Org profile + document numbering — `settings/{company,_actions}`

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `readCompanyProfile` / `saveCompanyProfile` (`company/_actions/company-profile.ts`) | Read + persist every editable org field (name, registration, contacts, branding) to `public.organizations`. zod-parsed, org-scoped UPDATE. | reads/writes `organizations` | read: RLS; write: `settings.org.update` |
| `readOrgDocumentSettings` / `updateOrgDocumentSettings` (`_actions/documents.ts`) | Read / edit the PO·TO·WO numbering format (prefix / `number_date_part` `none\|YYYY\|YYYYMM\|YYYYMMDD` / `number_seq_padding` 3–8) + `archive_after_days`. The numbering **engine** (`nextDocumentNumber`, `lib/documents/numbering.ts`) bumps `next_seq` atomically — it lives in Planning's call path but is **configured here** (Settings → Documents). | reads/writes `org_document_settings` | read: `settings.org.read`; write: `settings.infra.update` |

### Sites & lines — `settings/sites/_actions/sites.ts`

| Action | What it does | Reads / writes | Gate |
|---|---|---|---|
| `readSitesSettingsData` / `getSites` / `getLinesForSite` | Sites list (line + worker counts, HACCP/operating-hours from `l3_ext_cols`, map x/y) + the selected site's production lines. `can_edit` is computed from the **same** live `settings.org.update` check the writers gate on. | reads `sites`, `production_lines`, `shift_patterns`, `locations` | RLS read |
| `createSite(input)` | Insert a site (`site_code`, name, timezone, country, legal_entity). Clears the existing `is_default` first when `is_default=true` (partial unique `idx_sites_default`). Duplicate `site_code` (`sites_org_code_uq`) → `duplicate_code`. **No outbox event** (no allowed `settings.site.*` event_type). | writes `sites` | `settings.org.update` |
| `updateSiteSettings(orgId,siteId,settings)` | Patch a site's `is_default` + `l3_ext_cols` (operating_hours / haccp_enabled / haccp_valid_until). | writes `sites` | `settings.org.update` |
| `createLine(input)` / `updateLine(input)` | Create/edit a **production line** at a site (`code`, `name`, `status` ∈ active/maintenance/inactive). Duplicate code at the same site → `duplicate_code`. Emits `settings.line.upserted` (an **allowed** outbox event_type — do not invent new ones). | reads `sites`, `production_lines`; writes `production_lines`, `outbox_events` | `settings.org.update` |

> The UUID guard here is deliberately **format-only** (not RFC-4122-strict): the
> seed org UUIDs are `00000000-…-0000000000xx` (version=0) and a strict regex
> made the per-site lines list return `[]` for every user (`sites.ts:147-153`).
> The real org-security guard is `context.orgId !== orgId` + RLS, not the regex.

### Infra master (machines / warehouses / locations / printers / dock-doors)

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `listMachines` / `upsertMachine` (`machines/_actions/machine-actions.ts`) | Machine CRUD (`code`, `name`, `machine_type`, `status` ∈ active/inactive/maintenance/retired, `capacity_per_hour`). `canEdit` exposed for the affordance. Unique `(org_id, code)` → `duplicate_code`. | reads/writes `machines` | `settings.flags.edit` (gate also accepts role code `owner`/`admin`) |
| `listDockDoors` / `upsertDockDoor` (`(modules)/yard/_actions/yard-actions.ts`, surfaced at `/settings/infra/docks`) | Dock-door master (`code`, `name`, `direction` ∈ inbound/outbound/both, `site_id`, `warehouse_id`). The action **throws `forbidden`** (mapped to the `permission-denied` page state) rather than returning a typed error. mig 317. | reads/writes `dock_doors`; reads `sites`, `warehouses` | `yard.manage` |
| Warehouses / locations / printers (`infra/warehouses`, `infra/locations/_actions`, `infra/printers/_actions`) | Warehouse + storage-location master + label-printer registry (E1, mig 304). Locations import via `import-location-csv.ts`. | reads/writes `warehouses`, `locations`, `printers` | `settings.infra.update` / `settings.org.update` |

### Workforce — shifts + labor rates

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `readShiftsSettingsData` + `createShiftPattern` / `updateShiftPattern` / `deleteShiftPattern` (`shifts/_actions/shifts.ts`) | Shift-pattern + calendar config per site/line (the worker-count source the sites list joins on). | reads/writes `shift_patterns` | `settings.org.update` |
| `upsertLaborRate` / `listLaborRates` (`production/_actions/labor-actions.ts`, surfaced at `/settings/labor-rates`) | E4B hourly rate cards by role/group, feed WO labor cost. | reads/writes `labor_rates` | write `settings.org.update`; read `settings.org.read` |

### Users & roles (RBAC) — `apps/web/actions/users/*` + `settings/roles/_actions`

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `inviteUser` (`actions/users/invite.ts`) | Mint a Supabase invite magic-link + provision an **inactive** `public.users` row carrying `invite_token`/expiry. Seat-limit pre-flight (`organizations.seat_limit`). | reads `organizations`, `users`; writes `users` | `settings.users.invite` |
| `createUserWithPassword` (`actions/users/create-user-with-password.ts`) | Admin "create a user directly with a password, no email". Uses the **service-role** Supabase admin client (`auth.admin.createUser`, `email_confirm:true`) server-side only; provisions an **active** `users` row + `user_roles` junction; best-effort deletes the orphan auth user if DB provisioning fails. Refuses a privileged **system** role as the default (`forbidden_role`). | reads/writes `users`, `user_roles`; writes `audit_log`, `outbox_events` | `settings.users.invite` |
| `assignRole(input)` (`actions/users/assign-role.ts`) | Replace a user's role (sets `users.role_id` + rewrites the `user_roles` junction in one CTE). **Last-owner guard**: refuses to demote the org's only `owner` (row-locks the owner rows, `last_owner_violation` → `forbidden`). | reads/writes `users`, `user_roles`, `roles`; writes `audit_log`, `outbox_events` | `settings.roles.assign` |
| `deactivateUser(input)` (`actions/users/deactivate.ts`) | Soft-deactivate a user (`is_active=false`). Gates on the **role-name** permission `org.access.admin` (`deactivate.ts:67`), **not** the enum's `settings.users.deactivate` — see gaps. | writes `users`, `audit_log`, `outbox_events` | `org.access.admin` |
| `createRole(input)` (`roles/_actions/role-admin-actions.ts`) | Create a **custom** role (slug-shaped code, empty permission set). **System roles locked** (`owner`/`admin`/`org.access.admin`/`org.platform.admin`/`org.schema.admin` → `system_role_locked`). | writes `roles`, `audit_events` | `settings.roles.assign` |
| `listRolePermissions(roleId)` / `setRolePermissions({roleId,permissions})` (`roles/_actions/role-admin-actions.ts`) | The **roles matrix** read/write. Validates EVERY string against the canonical `ALL_PERMISSIONS` catalog (one unknown string fails the whole edit — fail-closed). **Dual-store write in ONE txn**: rebuilds `role_permissions` rows **and** the `roles.permissions` jsonb cache to the exact same set (so neither read path goes stale). System roles cannot be edited. | reads/writes `role_permissions`, `roles`; writes `audit_events` | `settings.roles.assign` |

### Sign-off policies + PIN toggles + over-consume thresholds — `settings/{signoff,scanner-auth}/_actions`

| Action (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| `listSignoffPolicies` / `upsertSignoffPolicy(input)` (`signoff/_actions/signoff-actions.ts`) | The **dual-sign config**: per `signoff_type`, set `required_signatures` (1–2), `first_signer_role_id`, `second_signer_role_id`, `allow_same_user`, `is_active`. Signer role ids are org-scope-validated before the upsert (F3). Unique `(org_id, signoff_type)`. These rows are what `signChangeover` (08-production B-2) and other CFR-21 dual-sign flows read. | reads/writes `signoff_policies`; reads `roles`; writes `audit_log` | read `org.access.admin`; write `settings.flags.edit` |
| `setOverconsumeThresholds({warnPct,approvePct})` (`signoff/_actions/signoff-actions.ts`) | Write BOTH `tenant_variations.feature_flags->overconsume_warn_pct` (warn tier) and `->overconsume_threshold_pct` (supervisor-PIN approve tier). Server invariant `warnPct ≤ approvePct` (`warn_above_approve`). The Production consume gates read them (absent = 0). | reads/writes `tenant_variations`; writes `audit_log` | `settings.flags.edit` |
| `getScannerAuthPolicy` / `setScannerReverseAuthPolicy({requireSupervisorPin})` (`scanner-auth/_actions/scanner-auth-actions.ts`) | The **`scanner_reverse_require_supervisor_pin`** toggle. Stored as text `'true'`/`'false'` in `tenant_variations.feature_flags` under that key (**absent = default ON**). ON = scanner reverse-consume needs a supervisor email+PIN (holder of `production.consumption.override_approve`); OFF = operator-PIN-only. Read by `api/production/scanner/wos/[id]/reverse-consume/route.ts`. No new table/migration. | reads/writes `tenant_variations`; writes `audit_log` | read `org.access.admin`; write `settings.flags.edit` |

### Feature flags + reference data + units + integrations (representative)

| Action / page (file) | What it does | Reads / writes | Gate |
|---|---|---|---|
| Flags admin (`flags/page.tsx`) | List + toggle org feature flags from `feature_flags_core` (`flag_code`, `is_enabled`, `rolled_out_pct`, `tier`) + the NPD authorization-policy preflight. | reads/writes `feature_flags_core`, `org_authorization_policies` | `org.access.admin` (role-name-as-permission gate) |
| `createUnit` / `createConversion` / `softDeleteUnit` (`units/_actions/manage-units.ts`) | UoM master (`unit_of_measure`: category/code/factor_to_base/is_base) + conversions; the dropdown source the PO/TO/WO line UoM selects read. | reads/writes `unit_of_measure`; writes `audit_log`, `outbox_events` | `settings.units.manage` (gate also accepts `owner`/`admin`/`module_admin`) |
| `commitImportAction` / `previewImportAction` (`reference/[code]/import/_actions`) | Reference-data CSV import (preview → commit). | reads/writes `reference_data` | `settings.reference.import` |
| `createReasonCode` / `updateReasonCode` / `deleteReasonCode` (`ship-override-reasons/_actions/shipping-overrides.ts`) | Shipping override reason-code master (mig 240). | reads/writes shipping-override tables; writes `audit` | `settings.org.update` |
| `setRequireGrnQcInspection` (`quality/_actions/setRequireGrnQcInspection.ts`) | Toggle the org "require GRN QC inspection" flag (same jsonb-feature-flag pattern). | writes `tenant_variations` | `settings.flags.edit` |
| Master-data import/export hub (`import-export/_actions/master-data.ts`, `load-master-data-hub.ts`) | Central import/export surface for master entities. | reads master tables; writes `import_export_jobs` | settings admin gates |
| D365 integration (`integrations/d365/{cost-import,dlq,drift}/_actions/*`) | D365 connection/health, DLQ retry, drift, cost-import (export-only per R15). | D365 tables + DLQ | `settings.d365.*` |

**Action surface inventoried: ~40+ write actions across ~25 sub-areas.** The
governance core is `setRolePermissions` (the RBAC matrix), the
`users/*` provisioning trio (`inviteUser` / `createUserWithPassword` /
`assignRole` with the last-owner guard), `upsertSignoffPolicy`, and the two
`tenant_variations.feature_flags` writers (`setOverconsumeThresholds`,
`setScannerReverseAuthPolicy`). The master CRUD core is sites/lines + machines +
dock-doors + warehouses/locations + units.

---

## c. RBAC & permission model (the "state machine" of Settings)

Settings has no document lifecycle; its load-bearing mechanism is **how a
permission string resolves to a grant**. Get this wrong and the admin hits 403
on every page (recurring live-bug #1, `MON-project-overview`).

### Tables (`packages/db/migrations/017-rbac.sql` + `080-role-permissions.sql`)

```
 public.roles            (id, org_id, code, slug, name, permissions jsonb, is_system, display_order)
 public.role_permissions (role_id, permission)          ← normalized grant rows
 public.user_roles       (user_id, role_id, org_id)      ← junction
 public.users            (id, org_id, role_id, …)        ← also carries a single role_id
```

### Grant resolution (every gate does this exact dual-store read)

A user **holds a permission** if, for any role on their `user_roles`:

1. a `role_permissions` row matches the string, **OR**
2. the legacy `roles.permissions` jsonb cache contains the string
   (`coalesce(r.permissions,'[]') ? $perm`), **OR**
3. (in some gates) the role `code`/`slug` equals the string — used by the
   **role-name-as-permission** gates `org.access.admin` / `org.schema.admin`
   (flags / schema-preview / promotions / security), and by `machines` /
   `signoff` gates that also accept `r.code in ('owner','admin')`.

There is **no superuser bypass** and **no alias normalization** at the gate — the
seeded string must equal the checked string byte-for-byte. The roles editor
(`setRolePermissions`) therefore writes **both** stores in one txn so a removed
permission can never still resolve via a stale jsonb cache
(`role-admin-actions.ts:213-238`).

### Admin role family seed (migration 150 — the authoritative matrix)

```
 organizations INSERT
   └─ trg_zzz_seed_settings_rbac_matrix (AFTER INSERT, security definer)
        └─ seed_settings_rbac_matrix_for_org(org_id)
             ├─ grant_matrix (≈40 settings.* strings) → role_permissions
             │     family 'admin'  → roles code IN (owner,admin,org_admin)
             │                       OR slug IN (owner,admin,org_admin,
             │                          org.access.admin, org.platform.admin,
             │                          org.schema.admin)
             │     family 'auditor'→ read-only (audit.read, users.view, rules.view)
             └─ rebuild roles.permissions jsonb = dedup-union(existing + rp rows)
        + one-time backfill loop over every existing org
```

Migration 150 exists because earlier migrations (037/049/050/064/116/146/148)
seeded only a slice of the strings the pages actually check, so the org admin
hit 403 on ~24-30 settings pages on a freshly-migrated DB; the live DB only
"worked" because the admin role was **hand-seeded** during Gate-5 with strings
present in no migration. The matrix makes the full set **durable and
reproducible** (it also repairs the mig-064 `settings.units.manage` ordering bug
— 064 ran before `admin` was created by 080 and installed no trigger, seeding 0
rows). The deployed admin is on **`org.access.admin`**, NOT `admin`.

### System-role lock

Five codes are **locked** everywhere (`role-admin-actions.ts:35-41`,
`create-user-with-password.ts:37-43`): `owner`, `admin`, `org.access.admin`,
`org.platform.admin`, `org.schema.admin`. They cannot be created as custom
roles, their permission grants cannot be edited, and they cannot be the
self-serve default role for a new user (`forbidden_role`). DB-seeded
`roles.is_system = true` is also honored. The **last `owner`** cannot be
demoted (`assignRole` row-locks + `last_owner_violation`).

<!-- screenshot: settings/roles matrix (role list + permission checkbox grid) -->
<!-- screenshot: settings/sites (site list + lines panel + HACCP toggles) -->

---

## d. User how-tos

> Reach every screen from the **Settings** sub-nav
> (`apps/web/lib/navigation/settings-nav.ts` — groups Organization / Data /
> Access / Sign-off / Operations / Integrations / Document templates /
> Onboarding / Admin / My account). Nav items are currently **ungated**
> (`permission_key: null`, `RBAC_TODO`) — the screens themselves enforce.

### (i) Add a site and a production line

1. **Settings → Organization → Sites & lines** (`/settings/sites`).
2. Create a site (code, name, timezone, country); tick **Primary** to make it
   the org default (the previous default is cleared first). → `createSite`.
3. With a site selected, add a **production line** (code, name, status). A
   duplicate line code at the same site is refused → `createLine`. Lines carry
   `site_id` (no separate warehouse column — site ≡ warehouse).
4. Toggle **HACCP** / operating hours per site (stored in `l3_ext_cols`) →
   `updateSiteSettings`.

### (ii) Register a machine / dock-door / warehouse

- **Machines** (`/settings/machines`): add code / name / type / status /
  capacity-per-hour → `upsertMachine`. (The older `/settings/infra/machines` is
  deliberately superseded by this screen.)
- **Dock doors** (`/settings/infra/docks`): add code / name / direction
  (inbound/outbound/both) / site / warehouse → `upsertDockDoor`. A non-admin sees
  the **permission-denied** amber note (the action throws `forbidden`).
- **Warehouses / Locations / Printers** sit in the same Organization nav group.

### (iii) Invite or create a user, then set their role

1. **Settings → Access → Users & roles** (`/settings/users`).
2. **Invite** sends an email magic-link and provisions an inactive user
   (`inviteUser`); **Create with password** provisions an active user with no
   email (`createUserWithPassword`). Both pre-flight the **seat limit**.
3. **Assign role** changes the user's role (`assignRole`). You **cannot** demote
   the org's only owner, and you cannot self-serve a locked system role.

### (iv) Author a custom role and grant permissions

1. **Settings → Access → Users & roles → Roles** (`/settings/roles`).
2. **Create role** (slug-shaped code, e.g. `npd_manager`) → `createRole` (starts
   with no permissions). System roles can't be created.
3. Tick permissions in the **matrix** and save → `setRolePermissions`. Every
   string is validated against the canonical catalog; one unknown string fails
   the whole save. Both grant stores are rewritten atomically.

### (v) Configure sign-off policies + scanner PIN

1. **Settings → Sign-off → Sign-off policies** (`/settings/signoff`): per
   `signoff_type` set required signatures (1–2), first/second signer **roles**,
   and allow-same-user → `upsertSignoffPolicy`. This is what the B-2 allergen
   dual-sign (Production changeovers) reads.
2. Set the two-tier **over-consume** thresholds (warn % ≤ approve %) →
   `setOverconsumeThresholds`.
3. **Settings → Sign-off → Sign-off & PINs** (`/settings/scanner-auth`): toggle
   **"supervisor PIN required for scanner reverse-consume"** →
   `setScannerReverseAuthPolicy` (default ON when the flag is absent).

### (vi) Configure document numbering

1. **Settings → Document templates → Document numbering** (`/settings/documents`).
2. For each of **PO / TO / WO** set prefix, date part (`none`/`YYYY`/`YYYYMM`/
   `YYYYMMDD`), sequence padding (3–8) and **archive after N days** →
   `updateOrgDocumentSettings` (gated `settings.infra.update`). The next created
   document draws its number from `nextDocumentNumber` (Planning's call path),
   which bumps `org_document_settings.next_seq` atomically. (See
   `04-planning.md` §(viii) for the engine.)

### (vii) Toggle a feature flag / manage units / reference data

- **Feature flags** (`/settings/flags`): toggle `feature_flags_core` rows
  (gated on the `org.access.admin` role-name permission).
- **Units & conversions** (`/settings/units`): add UoMs + conversions
  (`createUnit` / `createConversion`); these populate the line-item UoM dropdowns
  across PO/TO/WO (never a hardcoded list).
- **Reference data** (`/settings/reference/[code]`): edit + CSV-import lookup
  tables (`commitImportAction`).

---

## e. Data sources (Supabase tables)

RBAC / users (read/write):

- `roles` — role master (`code`, `slug`, `permissions` jsonb cache, `is_system`, `display_order`); seeded per-org (017/080) + the full settings matrix (150).
- `role_permissions` — normalized `(role_id, permission)` grant rows (the matrix-seed + roles-editor target).
- `user_roles` — user↔role junction (org-scoped; last-owner guard locks owner rows).
- `users` — org users (`role_id`, `is_active`, `invite_token`, `seat`-counted).
- `organizations` — org profile + `seat_limit` (company-profile target).

Physical master (read/write):

- `sites` — site master (`site_code`, `is_default`, `address` jsonb, `l3_ext_cols` operating-hours/HACCP/map; unique `sites_org_code_uq`, partial unique `idx_sites_default`).
- `production_lines` — lines (carry `site_id`; emits `settings.line.upserted`).
- `machines` — machine master (`machine_type`, `status`, `capacity_per_hour`; unique `(org_id, code)`).
- `dock_doors` — dock-door master (`direction` inbound/outbound/both, `site_id`, `warehouse_id`; mig 317; unique `(org_id, code)`).
- `warehouses`, `locations`, `printers`, `shift_patterns`, `labor_rates`, `scanner_devices`, `scanner_device_defaults` — infra/workforce/scanner master.
- `unit_of_measure` — UoM + conversions (the dropdown SSOT).
- `org_document_settings` — per-org PO/TO/WO numbering format + `archive_after_days` + atomic `next_seq`.

Governance / policy:

- `signoff_policies` — dual-sign config (`required_signatures`, first/second signer role, `allow_same_user`; unique `(org_id, signoff_type)`).
- `tenant_variations.feature_flags` (jsonb) — org policy toggles: `scanner_reverse_require_supervisor_pin`, `overconsume_warn_pct`, `overconsume_threshold_pct`, GRN-QC, …
- `feature_flags_core` — named org feature flags (`flag_code`, `is_enabled`, `rolled_out_pct`, `tier`).
- `org_authorization_policies` — workflow authorization (NPD released-product edit, etc.).
- `reference_data`, shipping-override + D365/email/label config tables.

Audit / outbox:

- `audit_log` / `audit_events` — every settings write (`settings.{role,role_permissions,signoff_policy,flag,user,line,…}.*`; security retention class for RBAC/user changes).
- `outbox_events` — only the **allowed** event_types (`settings.line.upserted`, `settings.user.created_with_password`, `settings.role.assigned`, `settings.user.deactivated`); inventing a `settings.site.*` event would violate `outbox_events_event_type_check`.

---

## f. Known gaps / TODO

Grounded in the code that was read — these feed the fix backlog:

1. **Settings nav is entirely ungated.** Every `settings-nav.ts` item ships
   `permission_key: null` with `RBAC_TODO` ("UI-128 keeps settings navigation
   ungated; wire permission_key in the future RBAC module",
   `settings-nav.ts:3,13-14`). The links render for everyone; only the
   destination screen enforces (so a non-admin clicks through to a
   permission-denied state instead of never seeing the link).

2. **Gate-string vs `permissions.enum.ts` drift.** Migration 150's own header
   documents that the seeded strings are the **real union the code checks**,
   including drifted strings absent from the enum: `settings.d365.manage` /
   `.rotate_secret` / `.test_connection`, `settings.email_config.edit`,
   `settings.units.manage`, `settings.infra.read|update` (enum has `view|edit`),
   `settings.schema.read|admin`, `settings.roles.manage`, `settings.users.view`,
   `impersonate.tenant` (enum has `settings.impersonate.tenant` AND
   `impersonate.org`). Two parallel vocabularies (`.view/.read`,
   `.edit/.manage/.update`) need converging onto one and re-seeding canonically.

3. **Permission strings checked-but-not-enum'd.** `machines/_actions` and the
   signoff/scanner-auth writers gate on `settings.flags.edit` for **machine** and
   **sign-off** edits (a flags string standing in for an infra/sign-off write),
   and several gates additionally accept the role **code** `owner`/`admin`
   directly (`machine-actions.ts:74`, `signoff-actions.ts:127`,
   `manage-units.ts:92`) — a code-as-permission shortcut that bypasses the
   normalized catalog. Likewise `deactivateUser` gates on the role-name
   `org.access.admin` while the enum declares `settings.users.deactivate`
   (`deactivate.ts:67`). Add dedicated `settings.machines.*` /
   `settings.signoff.*` strings and align the user-deactivate gate to its enum
   member.

4. **Dock-doors permission `yard.manage` is owned by the yard module.** The
   Settings → Infra → Docks screen is physically backed by
   `(modules)/yard/_actions/yard-actions.ts` and gates on `yard.manage`
   (`yard-actions.ts:90`), not a `settings.infra.*` string — an ownership blur
   (a settings screen checking a yard permission). The action also **throws**
   `forbidden` rather than returning the typed `{ok:false}` the rest of settings
   uses.

5. **No outbox event for site create.** `createSite` deliberately emits nothing
   ("`outbox_events_event_type_check` has no allowed `settings.site.*`
   event_type", `sites.ts:480-483`); line upsert does emit. Downstream consumers
   of "a site was created" have no event to subscribe to.

6. **Duplicate / legacy settings route trees exist.** Besides the canonical
   `[locale]/(app)/(admin)/settings/**`, the repo still carries
   `app/(admin)/settings/**` and `app/(settings)/**` (e.g. `reference`,
   `roles`, `schema`, `users`) that are not under the localized AppShell — stale
   trees that should be consolidated or removed to avoid route confusion.

7. **`worker_count` on the sites list is shift-pattern-derived, not headcount.**
   The site/line worker counts come from `count(distinct shift_id)` over active
   `shift_patterns` (`sites.ts:306-320`), i.e. a count of staffed shifts, not
   assigned operators — a modelling proxy flagged so the number isn't read as a
   true workforce headcount.

8. **`apps/worker` outbox consumer does not run.** The settings events
   (`settings.role.assigned`, `settings.user.created_with_password`,
   `settings.user.deactivated`, `settings.line.upserted`) persist to
   `outbox_events` but there is no live dispatcher yet (per
   `MON-project-overview`).

No raw `// TODO` markers were found in the core settings actions beyond the
`RBAC_TODO` nav note and the enum-vs-gate convergence note carried in migration
150; the gaps list is otherwise derived from the permission-vs-enum drift and
ownership blurs observed directly in the code.
