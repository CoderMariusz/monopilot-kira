# Side-car audit — RBAC permission-seed gaps (referenced-but-unseeded)

**Scope:** built modules 00-foundation, 01-npd, 02-settings. **Mode:** READ-ONLY analysis (no source touched).
**Date:** 2026-06-04. **Branch context:** `kira/long-run` (01-npd sign-off in progress).
**Canon DB:** `postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot` — migrations applied through `147-restore-fa-edit-outbox-event.sql`.

## Bug class

Every Server Action / route / page loader gates on a literal permission string via a **local** `hasPermission` /
`requirePermission` that does an **exact-match** lookup against `public.role_permissions` (plus, in some actions, the
legacy `roles.permissions` jsonb cache). There is **no superuser bypass and no alias normalization** at the gate site
(`normalizePermission` / `LegacyPermissionAlias` from `packages/rbac` is **not** applied). Therefore:

> If a checked permission string is never INSERTed into `role_permissions` for any role the user holds → the gate
> returns `forbidden` for **every** user, including org owner/admin → the feature is permanently unreachable.

Representative gate (identical shape copy-pasted into ~40 action files), `apps/web/actions/d365/get.ts:73-85`:

```sql
select true as ok
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
  join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
 where ur.user_id = $1 and ur.org_id = $2 limit 1
```

This is exactly how `npd.allergen.write` (fixed by migration 146) and `gdpr.erasure.execute` (fixed by 116) failed.

## Where seeds actually come from (live source of truth)

Org-bootstrap permissions are seeded by **SQL migrations with AFTER-INSERT-on-`organizations` triggers**, NOT by
`packages/rbac/src/role-seed.ts` (that TS `SYSTEM_ROLE_SEEDS` array is not wired into org creation in the live path).

| Migration | Seeds | Roles targeted |
|---|---|---|
| `037-settings-core.sql` | creates roles `org.access.admin`, `org.schema.admin`, `org.platform.admin` (permissions `[]`) on org insert | — |
| `049-onboarding-outbox-grants.sql` | `settings.onboarding.complete` | admin roles |
| `050-settings-manage-permissions.sql` | `settings.users.manage`, `settings.security.manage` | `owner/admin/org_admin` + `org.*.admin` |
| `064-unit-of-measure.sql` | `settings.units.manage` (one-time backfill, **no org-insert trigger**) | `owner/admin/org_admin` |
| `080-role-permissions.sql` | full NPD matrix + creates roles `npd_manager/core_user/dept_manager/dept_user/admin/viewer` | per matrix |
| `116-gdpr-erasure-permission-seed.sql` | `gdpr.erasure.execute` | `admin` |
| `133-fa-bom-view.sql` | `npd.bom.export` | npd roles |
| `146-npd-allergen-write-permission-seed.sql` | `npd.allergen.write` | `npd_manager/core_user/admin` |

**Distinct permissions actually present in canon `role_permissions` (24):**
`brief.convert_to_npd_project, brief.create, fg.create, gdpr.erasure.execute, npd.allergen.write, npd.bom.export,
npd.closed_flag.unset, npd.compliance_doc.write, npd.core.write, npd.d365_builder.execute, npd.dashboard.view,
npd.formulation.create_draft, npd.formulation.lock, npd.gate.advance, npd.gate.approve, npd.pilot.promote_to_bom,
npd.project.delete, npd.recipe.submit_for_trial, npd.risk.write, npd.rule.edit, npd.schema.edit,
settings.onboarding.complete, settings.security.manage, settings.users.manage`.

### Secondary defect found: migration 064 ordering bug
`064` grants `settings.units.manage` to `code IN ('owner','admin','org_admin')`, but `064 < 080` and the `admin` role
is **created by 080**. At the time 064's one-time backfill ran, no matching role existed, and 064 installs **no
org-insert trigger**. Result: `settings.units.manage` is in **zero** rows in canon (verified). The Units admin page is
unreachable even though a seed migration "exists".

## P1 GAP TABLE — referenced-but-unseeded (settings module, all confirmed live gates)

Each row = a P1 reachability bug: feature 403s for every user. "In enum?" flags canonical-enum drift (see §Drift).

| Permission | Blocks (feature) | Gate file:line | Recommended role grants | In enum? |
|---|---|---|---|---|
| `settings.org.read` | Tenant settings read; import/export capability checks | `apps/web/actions/tenant/get.ts:37` | owner, admin, org.access.admin, org.platform.admin | yes |
| `settings.org.update` | Tenant upgrade/canary/rollback, rule-variant, dept set | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx:280`; `apps/web/actions/tenant/start-upgrade.ts` | owner, admin, org.access.admin, org.platform.admin | yes |
| `settings.rules.view` | Rules registry view / dry-runs | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx:173`; `apps/web/actions/rules/list.ts` | owner, admin, org.access.admin, auditor | yes |
| `settings.reference.view` | Reference-data browse | `apps/web/actions/reference/get.ts:5`; `list.ts` | owner, admin, org.access.admin | yes |
| `settings.reference.edit` | Reference-data upsert / soft-delete | `apps/web/actions/reference/upsert.ts:5`; `soft-delete.ts` | owner, admin, org.access.admin | yes |
| `settings.reference.import` | Reference CSV import | `apps/web/actions/reference/import-csv.ts:7` | owner, admin, org.access.admin | yes |
| `settings.audit.read` | Audit log read; migrations export route; impersonation banner | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/migrations/export/route.ts:5`; `settings/audit/audit-log-loader.ts` | owner, admin, org.access.admin, auditor | yes |
| `settings.flags.edit` | Feature-flag toggle; quality GRN-QC flag; local-flag set | `apps/web/app/[locale]/(app)/(admin)/settings/quality/page.tsx:29`; `actions/tenant/set-local-flag.ts` | owner, admin, org.access.admin, org.platform.admin | yes |
| `settings.units.manage` | Units-of-measure admin page edit (also broken by 064 ordering) | `apps/web/app/[locale]/(app)/(admin)/settings/units/page.tsx:215`; `units/_actions/manage-units.ts` | owner, admin, org.access.admin | **no** |
| `settings.d365.view` | D365 config + field-mapping read | `apps/web/actions/d365/get.ts:6`; `get-field-mapping.ts` | owner, admin, org.access.admin, org.platform.admin | yes |
| `settings.d365.manage` | D365 set-constant write | `apps/web/actions/d365/set-constant.ts:6` | owner, admin, org.platform.admin | **no** (enum has `settings.d365.edit`) |
| `settings.d365.rotate_secret` | D365 secret rotation | `apps/web/actions/d365/rotate-secret.ts:6` | owner, admin, org.platform.admin | **no** |
| `settings.d365.test_connection` | D365 connection test | `apps/web/actions/d365/test-connection.ts` | owner, admin, org.platform.admin | **no** |
| `settings.email.view` | Email-config read | `apps/web/actions/email/load-email-config.ts:17` | owner, admin, org.platform.admin | yes |
| `settings.email.edit` | Email-config edit (load path) | `apps/web/actions/email/load-email-config.ts:18` | owner, admin, org.platform.admin | yes |
| `settings.email_config.edit` | Email-config upsert; provider test | `apps/web/actions/email/upsert-config.ts:7`; `test-provider.ts` | owner, admin, org.platform.admin | **no** (enum has `settings.email.edit`) |
| `settings.sso.edit` | SSO upsert / disable / test | `apps/web/actions/sso/upsert-config.ts`; `disable.ts:5` | owner, admin, org.platform.admin | yes |
| `settings.scim.edit` | SCIM token management | `apps/web/actions/scim/tokens.ts:23` | owner, admin, org.platform.admin | yes |
| `settings.ip_allowlist.edit` | IP allowlist add/list; security page | `apps/web/actions/security/ip-allowlist-add.ts:6`; `security/page.tsx` | owner, admin, org.access.admin | yes |
| `settings.authorization.edit` | Authorization policy edit; import/export capability | `apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx`; `actions/import-export/import.ts:59` | owner, admin, org.access.admin | yes |
| `settings.users.invite` | User invitation flow | `apps/web/app/[locale]/(app)/(admin)/settings/invitations/page.tsx:25`; `actions/users/invite.ts` | owner, admin, org.access.admin | yes |
| `settings.roles.assign` | Role assignment | `apps/web/actions/users/assign-role.ts:67`; `invitations/page.tsx:26` | owner, admin, org.access.admin | yes |
| `impersonate.tenant` | Cross-org impersonation gate (audit page) | `apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx:302` | owner, admin, org.access.admin | **no** (enum has `settings.impersonate.tenant`) |
| `org.access.admin` (as a *permission* string, not role) | Feature-flags page+toggle, security page, user deactivate, promotions submit | `apps/web/actions/flags/set-core.ts:145`; `actions/users/deactivate.ts:67`; `settings/flags/page.tsx:176`; `settings/promotions/_actions/submitPromotion.ts` | owner, admin, **org.access.admin** (role must hold its own name as a permission) | yes (enum) / role-code in DB |
| `org.schema.admin` (as a *permission* string) | Schema preview/shadow-publish, schema promote, security page, promotions | `apps/web/app/[locale]/(app)/(admin)/settings/schema/preview/page.tsx:125`; `settings/security/page.tsx`; `settings/promotions/_actions/submitPromotion.ts` | owner, admin, **org.schema.admin** | yes (enum) / role-code in DB |

### `settings.users.view` (P2 — lower confidence)
Defined as `VIEW_PERMISSION = 'settings.users.view'` and only observed in an e2e spec
(`apps/web/e2e/settings-users-parity-evidence.spec.ts`) and a UI constant; not confirmed on a server gate in the
current tree. Seed it alongside the users group to be safe (cheap, idempotent), but it is not a confirmed live block.

## 01-NPD gap candidates (report-only — source NOT touched, module in progress)

These literal permission strings are gated in the NPD route trees but are **not** in `role_permissions` AND **not** in
the canonical enum. They originate from the legacy `apps/web/app/(npd)/...` tree and the localized
`apps/web/app/[locale]/(app)/(npd)/...` tree, which use different strings than the seeded `080` matrix. Flagging only;
**defer to the 01-npd sign-off owner** — do not seed here.

| Permission | Gate file:line | Note |
|---|---|---|
| `fa.create` | `apps/web/app/[locale]/(app)/(npd)/fa/page.tsx`; `dashboard/page.tsx` | legacy alias of `fg.create` (seeded) but **alias not normalized at gate** → still 403 |
| `fa.delete` | `apps/web/app/(npd)/fa/actions/delete-fa.ts` | not seeded, not in enum (`npd.project.delete` is the canonical sibling) |
| `brief.convert_to_fa` | `apps/web/app/(npd)/brief/actions/convert-brief-to-fa.ts`; `briefs/page.tsx` | legacy alias of `brief.convert_to_npd_project` (seeded) — alias not normalized → 403 |
| `npd.fa.read` | `pipeline/[projectId]/costing/page.tsx`, `nutrition/page.tsx`, `fa/[productCode]/layout.tsx` | not seeded, not in enum |
| `npd.fa.build` | `fa/[productCode]/layout.tsx` | not seeded, not in enum |
| `npd.fa.close` | `fa/[productCode]/layout.tsx` | not seeded, not in enum |
| `npd.brief.read` / `npd.brief.write` | `briefs/[briefId]/page.tsx` | not seeded, not in enum |
| `npd.project.create` / `npd.project.view` | `apps/web/app/(npd)/pipeline/_actions/shared.ts` | not seeded, not in enum (`npd.project.delete` is seeded) |

These suggest the NPD UI is partly gating on a *parallel, unseeded* permission vocabulary — the same root cause that
required migration 146. The 01-npd owner should reconcile these to the canonical enum + extend `080`'s matrix before
sign-off.

## §Drift — code↔enum mismatch (root contributor)

The settings actions reference 6 permission strings that are **not in `packages/rbac/src/permissions.enum.ts`**, while
the enum defines the intended canonical sibling. This naming drift is *why* seeds were never written (nobody added
them to the matrix). Reconcile at the gate site, not just the seed:

| Code uses (unseeded) | Canonical enum string |
|---|---|
| `settings.d365.manage` | `settings.d365.edit` (`SETTINGS_D365_EDIT`) |
| `settings.d365.rotate_secret` | (no enum entry — add or fold into `settings.d365.edit`) |
| `settings.d365.test_connection` | (no enum entry — add or fold into `settings.d365.view`) |
| `settings.email_config.edit` | `settings.email.edit` (`SETTINGS_EMAIL_EDIT`) |
| `settings.units.manage` | (no enum entry) |
| `impersonate.tenant` | `settings.impersonate.tenant` (`SETTINGS_IMPERSONATE_TENANT`) |
| `settings.infra.read` / `settings.infra.update` | `settings.infra.view` / `settings.infra.edit` |

**Recommendation:** The proposed seed migration (below) seeds the **strings the code actually checks** so the features
become reachable immediately (P1 fix). A separate follow-up task should converge code + enum onto one vocabulary and
collapse the duplicate strings, then re-seed canonically.

## P2 — dead / unverified-seeded note

A naive `SEEDED − REFERENCED` diff flagged `npd.core.write, npd.d365_builder.execute, npd.schema.edit, npd.rule.edit,
npd.pilot.promote_to_bom, npd.project.delete, brief.convert_to_npd_project` as "seeded but unreferenced." On manual
re-check these are **false positives** — they are referenced via constants/literals my regex missed (e.g.
`npd.core.write` in `apps/web/app/(npd)/fa/actions/update-fa-cell.ts`). **No confirmed dead permissions** in canon at
this time. Re-run after the NPD route-tree consolidation, since collapsing the legacy `(npd)` tree may orphan some.

## Severity & remediation

- **Severity:** every P1 row above is a reachability bug — the screen renders but every write/read action 403s.
- **Remediation:** one consolidated, idempotent seed migration with an org-insert trigger (mirrors 116/146), proposed
  as `_meta/runs/sidecar/proposed-tasks/rbac-seed-gaps.sql` (numbered **211**, PROPOSAL ONLY — not applied to canon).
- **Also fix** the 064 ordering defect: the proposed migration re-seeds `settings.units.manage` and installs the
  missing org-insert trigger so future orgs inherit it.
- **Follow-up (separate task):** resolve §Drift — converge gate strings ↔ enum, then collapse duplicate seeds.

## Verification commands used (reproducible)

```bash
# seeded set
psql postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot -tAc \
  "select distinct permission from role_permissions order by 1"
# org.access.admin / org.schema.admin are NOT seeded as permission strings (0 rows):
psql ... -tAc "select count(*) from role_permissions where permission in ('org.access.admin','org.schema.admin')"
# settings.units.manage absent despite migration 064 (0 rows):
psql ... -tAc "select count(*) from role_permissions where permission='settings.units.manage'"
```
