# Authorization Policy Contract — Foundation Skeleton

> **Status:** Wave0 locked skeleton contract (T-050). No helper implementations,
> no DDL, no migrations. Contract-only.
>
> **Source authority:**
> - `docs/prd/00-FOUNDATION-PRD.md` §3 (Personas — Org Admin / Schema Admin SoD),
>   §5.x (Auth & Identity Stack), §8 (Multi-tenant L1–L4), §W0-v4.3 §1, §7 (this
>   contract's locked decisions).
> - `_foundation/glossary/domain-terms.md` (T-048) — `org_id`, `tenant_id` rows.
> - `_foundation/contracts/shared-bom-ssot.md` (T-049) — sibling contract style.
>
> **Sibling implementations already in tree:**
> - `packages/rbac/src/permissions.enum.ts` (T-004) — canonical permissions +
>   `LegacyPermissionAlias` + `SOD_EXCLUSIVE_PAIRS`.
> - `packages/db/migrations/017-rbac.sql` (T-014) — `roles`, `role_permissions`,
>   `user_roles`, `org_security_policies`.
> - `packages/db/migrations/004-audit.sql` (T-009) — `audit_events` 13-field
>   schema with `retention_class` CHECK.
>
> **LOCK RULE:** This document defines the foundation authorization policy that
> Settings, NPD, and Technical module tasks consume. The authorization scope is
> `org_id` (NOT `tenant_id`). Persisted permissions are canonical only. Helpers
> are defined here as **contracts** (signature + behaviour) — implementation is
> deferred to a downstream task.

---

## 1. Identity Session Layer

The **Identity Provider (IdP)** is **GoTrue / Supabase Auth** per §5.x. Sessions
are JWT-based; the identity contract for authorization purposes is:

| JWT claim | Authorization use                                              | Source            |
|-----------|----------------------------------------------------------------|-------------------|
| `sub`     | The canonical `users.id` (UUID). Treated as `actor_user_id`.   | §5.x; T-011 wiring|
| `email`   | Display + audit context only. NEVER used as authorization key. | §5.x              |
| `org_id`  | Organisation claim asserted by the IdP at login/refresh time.  | §5.x; §W0-v4.3 §1 |

**Session lifecycle (per §5.x; org-tunable per §8.x `org_security_policies`):**

| Bound                    | Default | Upper bound (cluster) | Notes                                  |
|--------------------------|---------|-----------------------|----------------------------------------|
| Access-token TTL         | 15 min  | 15 min                | rotating refresh tokens                |
| Idle timeout             | 60 min  | per cluster policy    | refresh disabled if exceeded           |
| Absolute session max     | 8 h     | per cluster policy    | hard cap; re-auth required             |
| Magic-link invitation    | 7 d     | 7 d                   | signed, single-use, codified           |

**Actor identity (the only trust anchor for authorization):** `actor_user_id =
JWT.sub`. Never trust client-supplied user IDs or org IDs as authorization
inputs; always re-derive from the verified JWT and the server-side
`users.org_id` lookup (see §2).

---

## 2. Org Context Resolution (non-spoofable)

The authorization scope key is **`org_id`** per §W0-v4.3 §1. `tenant_id` is
control-plane only (see glossary `tenant_id` row) and **MUST NOT** be used as
the business authorization scope.

**Resolution flow (server-side, never trust the client):**

1. Web/Server-Action middleware verifies the JWT (Supabase auth-helpers per
   §5.x) and reads `sub` (the user ID).
2. Middleware looks up `users.org_id` keyed by `sub` using a **service-role pg
   connection** (BYPASSRLS) to derive the authoritative `org_id`. The JWT
   `org_id` claim is treated as a hint, not as truth — the DB lookup is
   authoritative.
3. Middleware then opens an **app-role pg connection** and calls
   `app.set_org_context(orgId, sessionToken)` — the safe, non-spoofable
   org-context wrapper from T-007. Subsequent business queries on that
   connection are RLS-bound to that `org_id` via `app.current_org_id()`.
4. Server Actions and tRPC procedures invoke
   `withOrgContext({ userId, orgId }, async () => { … })` (T-062 carry-forward
   helper) which re-asserts the binding for every action and clears it on exit.

**Forbidden patterns (red lines):**

- Trusting client-supplied `org_id` query/body parameters as the authorization
  scope. (Server MUST re-derive from `users.org_id` keyed by `JWT.sub`.)
- Direct unsafe `SET app.tenant_id = '…'` or any custom GUC `SET` by app users
  (per §W0-v4.3 §7 — "do not rely on unsafe direct custom GUC SET").
- Using `tenant_id` as a business-authorization scope key. (Use `org_id`.)

**LEAKPROOF:** not a default. Per §W0-v4.3 §7 and §5 [R3], `LEAKPROOF` may be
applied to a SECURITY DEFINER wrapper only if the implementation proves it is
necessary and valid; the default authorization policy does NOT require it.

---

## 3. Permission Enum Normalization

The canonical permission catalogue lives in
`packages/rbac/src/permissions.enum.ts` (T-004). All persisted permissions on
`role_permissions.permission` MUST be canonical strings — **never legacy
aliases**. Quote of the canonical set:

```
ORG_ACCESS_ADMIN: 'org.access.admin'
ORG_SCHEMA_ADMIN: 'org.schema.admin'
ORG_SCIM_WRITE:   'org.scim.write'
FG_CREATE:        'fg.create'
FG_EDIT:          'fg.edit'
BRIEF_CONVERT_TO_NPD_PROJECT: 'brief.convert_to_npd_project'
REF_EDIT:         'ref.edit'
AUDIT_READ:       'audit.read'
OUTBOX_ADMIN:     'outbox.admin'
IMPERSONATE_ORG:  'impersonate.org'
```

**Legacy aliases (`fa.*`) policy** — per `LegacyPermissionAlias` in
`permissions.enum.ts`:

| Legacy alias                | Canonical mapping                       |
|-----------------------------|------------------------------------------|
| `fa.create`                 | `fg.create`                              |
| `fa.edit`                   | `fg.edit`                                |
| `brief.convert_to_fa`       | `brief.convert_to_npd_project`           |

**Boundary normalization rule:** legacy aliases are NORMALIZED OR REJECTED
**only at the input boundary** (Server Action / API request body / SCIM
provisioning input). The chosen mode in T-014 is **REJECT** — `grantRole`
returns `error: 'legacy_alias'` rather than silently normalising-and-persisting.
Persisted rows on `role_permissions.permission` are **canonical only**. Any DB
scan finding `fa.*` in `role_permissions` is a contract violation.

**Reference:** the precedent for the boundary policy is the T-014 REWORK note
at `_meta/atomic-tasks/00-foundation/notes/T-014.md` "Legacy alias handling:
REJECT outright".

---

## 4. Role Grants (RBAC)

Roles are **org-scoped**. Per `packages/db/migrations/017-rbac.sql` (T-014):

- `roles(id, org_id, slug, system, …)` — every role row is bound to an `org_id`.
  No `tenant_id` column. (Red line: do not add `tenant_id` to RBAC tables.)
- `role_permissions(role_id, permission)` — canonical permission strings only.
- `user_roles(user_id, role_id, org_id)` — assignment is org-scoped.
- `org_security_policies(org_id, dual_control_required)` — defaults `true`.

**System roles** (seeded by the
`seed_system_roles_on_org_insert` SECURITY DEFINER trigger on
`organizations` INSERT, T-014):

| System role slug      | Pillar                        | Source        |
|-----------------------|-------------------------------|---------------|
| `org.access.admin`    | ACCESS (identity, MFA, SAML)  | §3 F-U4; T-014|
| `org.schema.admin`    | ADMIN (schema, flags, config) | §3 F-U4; T-014|
| `org.platform.admin`  | Apex bootstrap (cross-org)    | T-039 carry-forward → T-069 (downstream) |

> `org.platform.admin` is **carry-forward** — defined here as a future system
> role for Apex bootstrap (cross-org reach). Its row will be added to the
> `seed_system_roles_on_org_insert` trigger by the downstream **schema/seed**
> task (see §9 split ownership). Adding it requires an ADR for cross-org reach.

**Grant API contract (already implemented in T-014):**

```typescript
grantRole({
  actorUserId: string,
  targetUserId: string,
  orgId: string,
  roleSlug: string,
  approvalToken?: string,
}): Promise<GrantRoleResult>
```

`grantRole` MUST execute the following preconditions (T-014 REWORK pattern):

1. `assertActorBelongsToOrg(actorUserId, orgId)` — load `users.org_id` where
   `id = actorUserId` and assert it equals `orgId`. Throw if mismatch.
2. `assertTargetBelongsToOrg(targetUserId, orgId)` — same check on the target.
3. Reject legacy aliases (see §3).
4. Apply SoD guard (§5 below).
5. Insert `user_roles` row + `audit_events` row (§7 below).

**Red lines:**

- No `tenant_id` business grants. RBAC tables are `org_id`-scoped exclusively.
- `actorUserId` and `targetUserId` MUST be members of `orgId`. Cross-org grants
  are forbidden in this contract; cross-org reach is reserved for
  `org.platform.admin` (downstream Apex bootstrap, requires its own ADR).

---

## 5. Separation of Duties (SoD)

The canonical SoD pair lock is `SOD_EXCLUSIVE_PAIRS` in T-004:

```typescript
SOD_EXCLUSIVE_PAIRS = [
  ['org.access.admin', 'org.schema.admin'],
] as const;
```

A user MAY NOT simultaneously hold both `org.access.admin` and
`org.schema.admin` without a valid second-admin **dual-control approval token**.

**`org_security_policies.dual_control_required`** defaults `true` (T-014 mig
017 line 41 + seed trigger line 147). When `true`, granting either side of the
SoD pair to a user who already holds the sibling REQUIRES a HMAC-signed
approval token (T-014 `generateApprovalToken` contract).

**Approval token contract (T-014 — already implemented):**

- HMAC-SHA256 keyed by `RBAC_APPROVAL_HMAC_KEY` (production-required, fail-closed
  per T-014 REWORK Fix 1).
- TTL = 5 min.
- Embeds `{ actorUserId, approverUserId, orgId, targetUserId, roleSlug, exp }`.
- `approverUserId !== actorUserId` strictly enforced — **self-approval is
  REJECTED** (red line) at both `generateApprovalToken` (throws) and `grantRole`
  (returns `error: 'self_approval'`).

**SoD scope correction (T-014 REWORK Fix 3):** the SoD guard checks the
**target's** existing roles (target-centric — "a user holding
`org.access.admin` cannot RECEIVE `org.schema.admin`"), not the actor's.

---

## 6. Action Preflight

Before any mutating Server Action runs, callers MUST invoke the preflight
helper:

```typescript
preflightAction({
  userId: string,        // = JWT.sub
  orgId: string,         // = derived org from §2
  action: string,        // canonical permission, e.g. 'fg.edit'
  resource: { type: string; id?: string },
}): Promise<{ allowed: boolean; reason?: string }>
```

**Behaviour contract:**

- Resolves the user's effective canonical permissions via `user_roles →
  role_permissions` for the bound `org_id`.
- Returns `{ allowed: true }` iff `action` is in the resolved set.
- Returns `{ allowed: false, reason }` with one of: `not_member` (user not in
  org), `missing_permission`, `sod_blocked` (resource enforces SoD context),
  `mfa_required` (per `org_security_policies.mfa_required_for_roles[]` —
  carry-forward).
- MUST be side-effect-free (no audit row written by preflight itself).

**Companion helper contracts (signatures + behaviour, NO implementation here):**

```typescript
requireOrgPermission(args: {
  userId: string;
  orgId: string;
  action: string;
}): Promise<void>  // throws AuthorizationError if not allowed.

assertSodGrantAllowed(args: {
  targetUserId: string;
  orgId: string;
  candidateRoleSlug: string;
  approvalToken?: string;
}): Promise<void>  // throws SodViolationError or SelfApprovalError.

withAuditContext<T>(args: {
  userId: string;
  orgId: string;
  action: string;
  resource: { type: string; id?: string };
  retentionClass?: 'security' | 'standard' | 'operational' | 'ephemeral';
}, fn: () => Promise<T>): Promise<T>
// wraps fn; on success/failure emits one audit_events row with the supplied
// context + result_status; defaults retentionClass = 'operational'.
```

> **Red line:** these are **contracts only**. No implementation lives in this
> document or in this task's deliverable. The downstream
> **helpers/actions/preflight** task (see §9) implements them.

---

## 7. Audit

`withAuditContext` wraps every mutating action and emits exactly one row to
`public.audit_events` (T-009 schema, mig 004). Required column population:

| Column            | Source                                                        |
|-------------------|---------------------------------------------------------------|
| `org_id`          | bound `org_id` from §2                                        |
| `actor_user_id`   | `userId` (= JWT.sub)                                          |
| `actor_type`      | `'user'` (or `'system'`/`'scim'`/`'impersonation'` per T-009) |
| `action`          | canonical action verb, e.g. `'role.assigned'`, `'fg.edited'`  |
| `resource_type`   | from helper input                                             |
| `resource_id`     | from helper input                                             |
| `request_id`      | propagated from middleware (UUID v4/v7)                       |
| `retention_class` | per table below                                               |
| `payload_jsonb`   | (mapped to `before_state`/`after_state` per T-009 schema)     |

**Retention classes** (per T-009 CHECK constraint —
`audit_events_retention_class_check`):

| `retention_class` | When to use                                                    |
|-------------------|----------------------------------------------------------------|
| `security`        | Auth, RBAC, role grants (mandated by T-014 CHECK constraint    |
|                   | for `action='role.assigned'`), MFA enrolment, SAML/SCIM events |
| `standard`        | Domain mutations (FG/Brief/factory_spec lifecycle)             |
| `operational`     | Default for non-security state changes                         |
| `ephemeral`       | Short-lived diagnostics; retention 30 d                        |

> **Constraint:** `audit_events_role_assigned_security_check` (T-014 mig 017
> line 53) — any row with `action = 'role.assigned'` MUST have
> `retention_class = 'security'`.

**`forensic`** is not in the current CHECK constraint enum. The helper contract
allows it as a future value; if needed, the schema/seed task (§9) extends the
CHECK constraint via migration.

---

## 8. Settings Quality Placeholder Decision

> **LOCKED (per §W0-v4.3 §7):** Settings module's quality features
> (Quality placeholder UI, lab-result read-model toggles, NCR feature flags)
> use the existing `settings.flags.edit` permission. **Do NOT create a new
> `settings.quality.*` permission namespace.**

**Rationale:**

- §W0-v4.3 §7 explicitly states: *"Settings Quality placeholders use the
  existing Settings flag permission model (`settings.flags.edit`), not a new
  `settings.quality.*` namespace."*
- Keeps the permission graph small (each new top-level namespace inflates the
  RBAC product surface, the SCIM group-mapping surface, and the test matrix).
- Defers feature-specific permission decisions to module-owned ADRs: when
  Quality module needs a finer-grained permission, it MUST land via a Settings
  module ADR + a corresponding atomic task that extends T-004 — never as a
  unilateral addition.

**Implementation guidance for Settings module:** wrap Quality placeholder
actions with `requireOrgPermission({ action: 'settings.flags.edit', … })`.
Extend the T-033 PostHog feature-flags pattern (Settings owns the flag
registry); Quality features become rows on the flag table, not new permission
strings.

**Red line (this contract):** any module attempting to introduce a
`settings.quality.*` permission key MUST be rejected at code review;
`permissions.enum.ts` (T-004) and this contract are the single source of truth.

---

## 9. Split Ownership (downstream tasks consuming this contract)

This contract is **read-only by 3 downstream tasks**. None of these tasks are
created in T-050; this section enumerates them for traceability only.

| # | Future task name (descriptive)            | Scope                                                             |
|---|--------------------------------------------|-------------------------------------------------------------------|
| 1 | **schema/seed**                            | Extends `017-rbac.sql` with `org.platform.admin` row + ADR for cross-org reach; adds VALIDATE CONSTRAINT for `audit_events_role_assigned_security_check`; optionally extends retention CHECK to include `forensic`. Carry-forward from T-039 → T-069 Apex bootstrap. |
| 2 | **helpers/actions/preflight**              | Implements `requireOrgPermission`, `preflightAction`, `assertSodGrantAllowed`, `withAuditContext` per §6 contracts; wraps every Server Action with the preflight + audit pattern; carry-forward T-062 `withOrgContext`. |
| 3 | **UI (settings/team/roles)**               | Settings module Team & Roles screen — list system roles, grant/revoke flow with dual-control modal, SoD warning banner, audit log preview. Consumes `preflightAction` + `grantRole` from tasks 1 + 2. |

**Cross-module carriers (T-050 JSON `cross_module_dependencies`):**

- `02-SETTINGS T-122` — Settings module split that consumes §3 (canonical
  permissions), §6 (preflight contract), and §8 (Quality placeholder decision).

---

## 10. References (file paths and PRD sections cited above)

**PRD anchors:**
- `docs/prd/00-FOUNDATION-PRD.md` §3 (Personas — Org Admin / Schema Admin SoD,
  F-U4 split).
- `docs/prd/00-FOUNDATION-PRD.md` §5 [R3] (RLS default, safe non-spoofable
  pattern, LEAKPROOF qualification).
- `docs/prd/00-FOUNDATION-PRD.md` §5.x (Auth & Identity Stack — JWT, 15-min
  access TTL, 60-min idle, 8-h absolute, 7-d magic-link).
- `docs/prd/00-FOUNDATION-PRD.md` §5.y (Shared UI primitives — modal-schema
  base for Team & Roles UI).
- `docs/prd/00-FOUNDATION-PRD.md` §8 / §8.x (Multi-tenant L1–L4,
  `tenant_idp_config`).
- `docs/prd/00-FOUNDATION-PRD.md` §11 (Audit log — 13-field schema, 4 retention
  tiers).
- `docs/prd/00-FOUNDATION-PRD.md` §W0-v4.3 §1 (`org_id` is canonical business
  scope).
- `docs/prd/00-FOUNDATION-PRD.md` §W0-v4.3 §7 (Authorization/RLS — safe
  non-spoofable, no GUC SET, LEAKPROOF non-default, **`settings.flags.edit`
  not `settings.quality.*`**).

**Foundation contracts and code:**
- `_foundation/glossary/domain-terms.md` (T-048) — `org_id`, `tenant_id` rows.
- `_foundation/contracts/shared-bom-ssot.md` (T-049) — sibling contract.
- `_foundation/contracts/d365-posture.md` (T-051) — sibling contract.
- `packages/rbac/src/permissions.enum.ts` (T-004) — `Permission`,
  `LegacyPermissionAlias`, `SOD_EXCLUSIVE_PAIRS`, `normalizePermission`.
- `packages/rbac/src/grant.ts` (T-014) — `grantRole`, `generateApprovalToken`.
- `packages/db/migrations/004-audit.sql` (T-009) — `audit_events` 13-field
  schema and CHECK constraints.
- `packages/db/migrations/017-rbac.sql` (T-014) — `roles`, `role_permissions`,
  `user_roles`, `org_security_policies`, `seed_system_roles_on_org_insert`
  trigger, `audit_events_role_assigned_security_check`.

**Carry-forward task references:**
- T-007 — `app.set_org_context` wrapper (server-side org binding).
- T-011 — Supabase auth wiring (JWT verification middleware).
- T-039 — Apex bootstrap origin.
- T-062 — `withOrgContext` action wrapper.
- T-069 — Apex bootstrap downstream task (will land `org.platform.admin`).
