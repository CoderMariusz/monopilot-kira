# RUN 01/20 — Identity, roles, authorization and profile adversarial lifecycle

## Verdict

**FAIL — 7 production defects reproduced: 1 P0, 1 P1, 4 P2 and 1 P3.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The walk was executed directly in the Codex/Sol Playwright browser as the supplied Apex 22 administrator. No direct database or application API mutation was used. Every state change below was made through visible controls and checked after a hard navigation/refresh where applicable.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Administrator login and Settings access | PASS | [login](evidence/R01-01-login.yml), [dashboard](evidence/R01-02-dashboard.yml) |
| Invite required-field boundary | PASS | Browser-native required controls prevented an empty invite. |
| Invite Viewer scoped to Main Factory | **FAIL / P0** | The request succeeded, but refresh showed `All sites`; Assign Sites confirmed zero assignments and explicitly described the account as unrestricted. [submitted](evidence/R01-08-invite-ready.yml), [created](evidence/R01-09-invite-created.yml), [after refresh](evidence/R01-10-invite-after-refresh.yml), [assignment truth](evidence/R01-13-assign-sites-dialog.yml) |
| Correct site assignment through Assign Sites | PASS | Main Factory saved and the row updated immediately. [selected](evidence/R01-14-main-factory-selected.yml), [saved](evidence/R01-15-sites-save-immediate.yml) |
| Duplicate invite / resend | PASS | The existing identity and Viewer role were preserved; the earlier duplicate-overwrite defect did not reproduce. [dialog](evidence/R01-11-duplicate-dialog.yml), [result](evidence/R01-12-duplicate-result.yml) |
| Viewer → Core User → Viewer role lifecycle | PASS | Both transitions were confirmed and reflected in the row. [changed](evidence/R01-17-role-core-user-saved.yml), [restored](evidence/R01-19-role-restored.yml) |
| Deactivate pending invite | **FAIL / P2** | UI reported success and displayed Disabled although the server performed an idempotent no-op on an already inactive invitation. [dialog](evidence/R01-20-deactivate-dialog.yml), [false Disabled state](evidence/R01-21-deactivated.yml) |
| Reactivate the same pending invite | **FAIL / P2** | The visible Reactivate action then failed with `not_disabled`, contradicting the Disabled row state. [dialog](evidence/R01-22-reactivate-dialog.yml), [rejected](evidence/R01-23-reactivated.yml) |
| Security policy save and refresh | **FAIL / P1 REGRESSION** | Removing SMS returned `persistence_failed`; refresh restored SMS. [before save](evidence/R01-25-security-sms-off-before-save.yml), [failure](evidence/R01-26-security-saved.yml), [server result](evidence/R01-security-save-response.txt), [after refresh](evidence/R01-27-security-after-refresh.yml) |
| Security failed-write rollback | PASS | No partial value survived refresh. |
| Audit resource semantics | PASS | User lifecycle entries now use resource `users`; the earlier wrong-table defect did not reproduce. [audit](evidence/R01-28-audit-log.yml) |
| Authorization-policy discovery and initialization | PASS | Navigation exists and seeded policies render. [policies](evidence/R01-29-authorization-policies.yml) |
| Authorization reason gate and discard | PASS | Save without a reason was blocked; Discard restored the policy. [reason gate](evidence/R01-31-auth-reason-required.yml), [discard](evidence/R01-32-auth-discarded.yml) |
| Profile display-name persistence | PASS with cross-surface defect | The field persisted after refresh, but the global shell kept the old Supabase-metadata name. [edit](evidence/R01-34-profile-display-edit.yml), [saved](evidence/R01-35-profile-saved-immediate.yml), [refresh](evidence/R01-36-profile-after-refresh.yml) |
| MFA enrollment | BLOCKED — environment | UI states that `MFA_MASTER_KEY` is missing. This is an explicit deployment capability limitation, not counted as an application finding. [profile](evidence/R01-33-profile.yml) |
| PIN boundary | BLOCKED — browser infrastructure | A long tool delay allowed the authenticated session to expire before the response could be observed. No PIN was changed and no defect is claimed. [idle redirect](evidence/R01-38-tool-delay-idle-login.yml) |
| Pending Invitations lifecycle | PASS with defects | Direct route can revoke the invite, but it is absent from Settings navigation; inviter is shown as System and successful revoke leaves a stale Pending row until refresh. [lifecycle](evidence/R01-39-invitations-lifecycle.yml), [success but stale](evidence/R01-41-revoked.yml), [after refresh](evidence/R01-42-revoked-after-refresh.yml) |
| Cleanup | PARTIAL by product design | Invitation was revoked; its audit-preserved user row remains Disabled because no deletion control is offered. Profile was restored and no policy/security mutation persisted. [cleanup](evidence/R01-43-cleanup-users.yml) |

## Findings

### PF-R01-01 — P0 — Invite site selection is ignored and creates an unrestricted user

**Reproduction:** Users & roles → Invite → Viewer → select `Main Factory` → send. After refresh the user shows `All sites`. Opening Assign Sites shows no selected site and the product's own warning: `No sites selected — user can see ALL sites (unrestricted)`.

- Expected: the invited identity is assigned to Main Factory atomically with the invitation, or invitation fails without creating a partially scoped account.
- Actual: the invitation succeeds with zero `user_sites` assignments, widening the requested site scope to all sites.
- Impact: once accepted, a low-privilege Viewer can receive cross-site visibility despite the administrator explicitly selecting one site. This is a multi-site authorization-boundary failure.
- Source correlation: the dialog sends a human-readable `site` string at [`InviteDialog.tsx:143`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/users/_components/InviteDialog.tsx>), while the insert in [`invite.ts:210`](../../../../apps/web/actions/users/invite.ts) creates only `public.users`; the site value is written to audit/outbox metadata but no `user_sites` assignment is created. The separate Assign Sites flow proves that a proper assignment works.
- Browser evidence: [invite payload view](evidence/R01-08-invite-ready.yml), [All sites after refresh](evidence/R01-10-invite-after-refresh.yml), [unrestricted truth](evidence/R01-13-assign-sites-dialog.yml).

### PF-R01-02 — P1 REGRESSION — Organization Security settings still cannot be saved

**Reproduction:** Settings → Security → remove SMS from allowed MFA methods → Save.

- Expected: success and a durable TOTP-only setting.
- Actual: visible `persistence_failed`; the Server Action returned `{ok:false, code:"persistence_failed"}` and refresh restored SMS.
- Regression: this is the same user-visible failure as canonical finding C003, previously marked repaired.
- Root-cause inference: [`upsert-policy.ts:58`](../../../../apps/web/actions/security/upsert-policy.ts) treats a false result from `app.upsert_my_tenant_idp_policy` as a persistence exception. Migration [`509-tenant-idp-policy-writer.sql:31`](../../../../packages/db/migrations/509-tenant-idp-policy-writer.sql) performs only an `UPDATE` and returns false when a tenant has no `tenant_idp_config` row. The production Apex 22 behavior is consistent with that missing legacy row. Confirm the exact row/log server-side before implementing.
- Browser evidence: [failed save](evidence/R01-26-security-saved.yml), [response](evidence/R01-security-save-response.txt), [rollback after refresh](evidence/R01-27-security-after-refresh.yml).

### PF-R01-03 — P2 — Invite and revoke success leave stale, actionable lists

**Reproduction A:** send a valid invitation. The success banner appears, but counts/list do not change until refresh. **Reproduction B:** revoke on Pending Invitations. The success banner appears while the row remains Pending with Resend/Revoke actions until refresh.

- Expected: a successful mutation immediately reconciles the list or triggers an RSC refresh.
- Actual: the screen contradicts the committed server state and continues offering actions on a revoked invitation.
- Source correlation: invite success only reports feedback, resets and closes at [`InviteDialog.tsx:152`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/users/_components/InviteDialog.tsx>). Revoke success only reports feedback at [`invitations-screen.client.tsx:494`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/invitations/invitations-screen.client.tsx>); neither path removes the record nor refreshes route data.
- Evidence: [invite immediate state](evidence/R01-09-invite-created.yml), [invite after refresh](evidence/R01-10-invite-after-refresh.yml), [revoke immediate state](evidence/R01-41-revoked.yml), [revoke after refresh](evidence/R01-42-revoked-after-refresh.yml).

### PF-R01-04 — P2 — Pending invitation can be falsely “deactivated” and then cannot be reactivated

**Reproduction:** from Users & roles, click Deactivate on the pending invited account, confirm, then click Reactivate.

- Expected: invitation lifecycle uses Revoke/Resend, or Deactivate changes a state that Reactivate can reverse.
- Actual: Deactivate reports success and paints the pending user Disabled; Reactivate then returns `not_disabled`.
- Root cause: [`deactivate.ts:110`](../../../../apps/web/actions/users/deactivate.ts) updates only active rows and treats an already-inactive row as successful at line 129. The client blindly adds the optimistic Disabled state at [`users-screen.client.tsx:396`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/users/users-screen.client.tsx>). [`reactivate.ts:76`](../../../../apps/web/actions/users/reactivate.ts) explicitly rejects any record that still has an invite token.
- Evidence: [false success](evidence/R01-21-deactivated.yml), [contradictory rejection](evidence/R01-23-reactivated.yml).

### PF-R01-05 — P2 — Correct invitation lifecycle UI is undiscoverable

The working Resend/Revoke screen exists at `/en/settings/invitations`, but no Settings navigation item or Users-page link exposes it. The normal surface instead offers the invalid Deactivate/Reactivate lifecycle described above.

- Expected: administrators can discover and operate pending invitations from Users & roles or Access navigation.
- Actual: only a source-derived/direct URL reaches the correct lifecycle screen.
- Source correlation: the Access navigation at [`settings-nav.ts:91`](../../../../apps/web/lib/navigation/settings-nav.ts) exposes Users, Security and Audit only.
- Evidence: [Settings navigation](evidence/R01-04-users.yml), [direct lifecycle route](evidence/R01-39-invitations-lifecycle.yml).

### PF-R01-06 — P2 — Invitation audit attribution is always shown as “System”

An invitation created interactively by the signed-in Apex Admin appears on Pending Invitations with `Invited By = System`.

- Expected: the initiating administrator is displayed.
- Actual: human attribution is discarded from the read model.
- Root cause: both the list and single-record queries hard-code `null::uuid as invited_by` and `null::text as invited_by_name` in [`invitations-lifecycle.ts:150`](../../../../apps/web/actions/users/invitations-lifecycle.ts) and [`invitations-lifecycle.ts:239`](../../../../apps/web/actions/users/invitations-lifecycle.ts). The page maps null to System.
- Impact: invitation governance and forensic attribution are misleading even though mutation audit/outbox metadata records an actor.
- Evidence: [admin-created invitation shown as System](evidence/R01-39-invitations-lifecycle.yml).

### PF-R01-07 — P3 — Persisted profile display name is ignored by the application shell

**Reproduction:** change Display name, save and refresh. The profile field retains the new value, while the shell user-menu accessible name remains `Apex Admin`.

- Expected: the field described as shown in the UI becomes the visible shell identity.
- Actual: only the profile form reflects the persisted value.
- Root cause: [`profile-data.ts:253`](<../../../../apps/web/app/[locale]/(app)/(admin)/account/profile/profile-data.ts>) writes `public.users.display_name`; [`layout.tsx:122`](<../../../../apps/web/app/[locale]/(app)/layout.tsx>) constructs shell identity exclusively from Supabase `user_metadata.name/full_name`.
- Evidence: [new display value](evidence/R01-35-profile-saved-immediate.yml), [persisted field with old shell identity](evidence/R01-36-profile-after-refresh.yml).

## Prior-fix verification

| Prior issue | Result |
|---|---|
| C001 duplicate invitation overwrites identity/role | **PASS** — resend preserved the existing name and Viewer role. |
| C003 Security persistence | **REGRESSED** — `persistence_failed` reproduced. |
| C006 user audit resource type | **PASS** — audit screen shows `users`. |
| C007 authorization route discoverability | **PASS** — Authorization policies now appears in Sign-off navigation. |
| S22 minimum approvers / audit reason | **PASS at policy boundary** — reason is required and Discard restores state. A two-human sign-off belongs to a later Technical/NPD run. |
| Reactivation removes auth ban | NOT RE-RUN on an accepted active identity; the pending-invite path exposed the separate PF-R01-04 defect. |

## Cleanup and retained artifact

- `night-r01-20260717-0548@monopilot.test` was revoked through Pending Invitations.
- The product retains its `public.users` representation as a Disabled Viewer assigned to Main Factory; the UI provides no safe delete control. This retained audit row is documented in [cleanup evidence](evidence/R01-43-cleanup-users.yml).
- The profile display name was restored to `Admin`.
- The Security write failed and rolled back; SMS remains allowed.
- Authorization edits were discarded; no authorization policy was changed.
- The supplied administrator was never deactivated and no password or PIN was changed.

## Limitations

- Email delivery/acceptance and expired-link behavior were not exercised because the invite message is not available in this browser session.
- The sole supplied administrator was not self-deactivated.
- MFA enrollment is intentionally unavailable on this deployment while `MFA_MASTER_KEY` is absent.
- A PIN attempt became unobservable after browser-tool delay and session expiry; it is recorded as blocked, not as a product defect.
