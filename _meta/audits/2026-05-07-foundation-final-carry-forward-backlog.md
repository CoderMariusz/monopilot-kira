# Foundation FINAL Carry-Forward Backlog (2026-05-07)

Independent OPUS audit consolidating ALL carry-forward proposals across 00-foundation REVIEW notes (T-008..T-061), resolving T-062..T-082+ ID collisions and re-numbering to a single canonical sequence. Supersedes the per-task T-062..T-082 numbering used by individual reviewers. Wave-A new tasks T-053..T-061 are already filed and either DONE or in flight (see `2026-05-07-foundation-wave-a-carry-forward-backlog.md`); this audit picks up the post-Wave-A reviewer carry-forwards.

## Method

Walked every `_meta/atomic-tasks/00-foundation/notes/T-XXX.md` REVIEW section, extracted carry-forward proposals + originating task + scope. Built dedup table. Re-numbered colliding T-062..T-082 to a single canonical sequence FT-001..FT-NN ("FT" = Foundation-followup-Task; intent is the orchestrator promotes these to real T-NNN slots when they enter Wave D).

## A. Collision dedup table (raw → canonical)

Each row is a DISTINCT carry-forward item. Where multiple originators shared a T-06x ID for a different concern, the IDs are de-collided into a single canonical FT-NN.

| Originator(s) | Reviewer-proposed ID | Distinct concern | Canonical FT |
|---|---|---|---|
| T-011 | T-062 | `withOrgContext()` Server Action HOF + RLS-enforcement tests | FT-001 |
| T-016 | T-062 | Restore proper org-scoped USING clause on `user_pins` RLS | FT-002 |
| T-031 | T-062 | Document Radix colon-id axe-core quirk + `useSanitiseRadixIds` in `packages/ui/TESTING.md` | FT-003 |
| T-014 | T-062 | `audit_events_role_assigned_security_check`: VALIDATE CONSTRAINT after fresh-DB confirms zero violators | FT-004 |
| T-011 | T-063 | Supabase deploy runbook (JWT_EXP, MAILER_OTP_EXP, refresh rotation) + verification script | FT-005 |
| T-016 | T-063 | `setPin/verifyPin` caller-contract JSDoc + pool.end() lifecycle fix | FT-006 |
| T-031 | T-063 | `aria-label` prop + `forwardRef` on `ReasonInput` | FT-007 |
| T-033 | T-063 | `import 'server-only'` marker on PostHog flags route | FT-008 |
| T-014 | T-063 | Verify `organizations.industry_code` CHECK whitelist accepts `'generic'` | FT-009 |
| T-011 | T-064 | True 8-h absolute session lifetime (separate from idle timeout) + `session_started_at` | FT-010 |
| T-014 | T-064 | Approval-token replay protection (`jti` + `consumed_approval_tokens`) | FT-011 |
| T-031 | T-064 | `shouldFail=true` click-driven error-transition test in `patterns.test.tsx` | FT-012 |
| T-016 | T-064 | REVERT migrations 020/021 (already done in T-016 closeout — **no longer carry-forward**) | — |
| T-011 | T-065 | Tenant-scoped JIT provisioning flag wired to `signInWithMagicLink.shouldCreateUser` | FT-013 |
| T-014 | T-065 | Replace per-call `pool.end()` in `grant.ts` with shared lifecycle + `closeRbacPool()` | FT-014 |
| T-033 | T-065 | Rename `POSTHOG_KEY` → `POSTHOG_API_KEY`; document in `.env.example` | FT-015 |
| T-014 | T-066 | Cross-org grant rejection (`assertActorBelongsToOrg(actorUserId, orgId)`) + integration test | FT-016 |
| T-014 | T-067 | Refactor `grantRole` from BYPASSRLS owner pool → `getAppConnection()` + `set_org_context` | FT-017 |
| T-033 | T-067 | Import `Permission.ORG_ACCESS_ADMIN` from `@kira/rbac` instead of inlined string `'org.access.admin'` | FT-018 |
| T-014 | T-068 | SoD semantic correction: check **target's** existing roles in addition to actor's | FT-019 |
| T-039 | T-069 | Bootstrap `org.platform.admin` seed runbook + Apex-tenant migration (prod returns 403 by default today) | FT-020 |
| T-036 | T-069 | `assertActorBelongsToOrg` guard in schema-driven actions (mirror T-014 REWORK δ) | (folds into FT-016 — same fix) |
| T-039 | T-070 | Fix `migrate.ts` 017-rbac.sql checksum mismatch; replay 023 cleanly | FT-021 |
| T-013 | T-070 | (Same — 017-rbac.sql checksum is the same blocker that forced T-013 to apply mig 024 via psql) | (FT-021) |
| T-036 | T-070 | Replace `dept_code='production'` fallback with explicit `Reference.Departments` lookup | (already fixed in T-036 REWORK — **no longer carry-forward**) |
| T-039 | T-071 | Owner-pool memoization + request-scoped actor org binding for upgrade actions | FT-022 |
| T-036 | T-071 | `audit_events_dept_column_denied_security_check` DB CHECK constraint (mirror T-014's role.assigned guard) | FT-023 |
| T-012 | T-072 | Narrow `tenant_idp_config` grants (column-level GRANT or service-role-only secret reads) | FT-024 |
| T-036 | T-072 | `dept_column_drafts` partial unique `(org_id, dept_id, column_key) WHERE status='draft'` | FT-025 |
| T-012 | T-073 | Replace SAML Issuer regex with xmldom + namespace-aware XPath | FT-026 |
| T-013 | T-073 | Make `audit_events.org_id` nullable for unauthenticated security events; backfill sentinel rows | FT-027 |
| T-012 | T-074 | Invoke `enforceSamlPolicy` from password/magic sign-in routes with real `user_roles` JOIN | FT-028 |
| T-013 | T-074 | Cross-tenant SCIM ambiguity-guard test (>1 hash verifies → 401) | FT-029 |
| T-012 | T-075 | Register Jackson connection (`createConnection`) at tenant onboarding/saml-config write | FT-030 |
| T-013 | T-075 | SCIM Group provisioning (POST/PATCH /Groups, members semantics) | FT-031 |
| T-012 | T-076 | HMAC-bound RelayState (org_id+nonce+exp) — defence vs replay/cross-tenant | FT-032 |
| T-037 | T-076 | **P0**: align `packages/ui` to React 19 peerDeps; reinstall zustand@5 + react-hook-form against React 19; verify `Stepper`/`Field` render in apps/web | FT-033 |
| T-012 | T-077 | SLO session-cookie clearing + Supabase session revoke | FT-034 |
| T-037 | T-077 | Refactor `SchemaColumnWizard` to import `@monopilot/ui/Stepper` and re-implement step 2 with RHF + Zod resolver | FT-035 |
| T-037 | T-078 | Replace custom `jsxPreTransformPlugin` with `@vitejs/plugin-react-oxc` in `apps/web/vitest.ui.config.ts` | FT-036 |
| T-037 | T-079 | Remove `test-setup.ui.ts` userEvent monkey-patch once user-event v15 ships | FT-037 |
| T-034 | T-080 | `getSystemActorConnection()` helper in `@monopilot/db` + constant-time Bearer compare for cron auth | FT-038 |
| T-042 | T-080 | Install `@playwright/test` + `playwright.config.ts` + `apps/web/e2e/pwa.spec.ts` (real Chromium offline) | FT-039 |
| T-021 | T-080 | Wire executor `cascading` branch to dispatch `runCascade` for `manufacturing_operation_to_intermediate_code_cascade` | FT-040 |
| T-034 | T-081 | Enable `extra_in_db` strict mode after dept_code → table registry lands | FT-041 |
| T-021 | T-081 | Promote `public.fg` fixture to migration when 01-NPD module ships (PRD §10) | FT-042 |
| T-034 | T-082 | Wire `@monopilot/ops` TS path alias in `apps/web/tsconfig.json`; swap relative cron import | FT-043 |
| T-021 | T-082 | Replace `nextSeq7()` Date-based collision-prone counter with org-scoped Postgres sequence | FT-044 |
| T-034 | T-083 (nit) | Document Vercel-only deploy assumption for `x-vercel-cron` trust, OR require Bearer-AND-header in production | FT-045 |
| T-035 | (no #) | Surface `EvaluateResult` through `ExecutorResult` if `executeRule` is ever made async | FT-046 |
| T-035 | (no #) | Add outbox-error surfacing (currently swallowed) once an error-reporting mechanism exists upstream | FT-047 |
| T-038 | (no #) | Restore FK on `tenant_migrations.tenant_id → organizations(id)` once T-039 app-layer FK guard is verified in prod | FT-048 |
| T-015 | CF-T015-B | `totp.ts` `masterKey` fail-closed env-var guard (mirror T-014 HMAC pattern) | FT-049 |
| T-026 | (T-056 ref) | Restore `Dialog.Portal` in Modal — RTL-portal fix should now be doable post-T-056 Storybook landing | (covered by T-056 — no new FT) |
| T-061 | (T-062 ref) | Bundle full NIST top-25K common-password list (currently ~200 stub) | FT-050 |

**Total distinct carry-forward items after dedup: 50.** (Original raw count across all REVIEW sections: 64; collapsed 14 collisions or already-resolved entries.)

## B. Severity ranking

### P0 — must-fix before any prod cutover (5)

| FT | Title | Originator | Why P0 |
|---|---|---|---|
| **FT-033** | React 19 peer alignment in `packages/ui` (+ zustand@5, react-hook-form, ui apps) | T-037 | All UI primitives (Stepper, Field, Modal, etc.) are currently unconsumable by `apps/web` until peerDeps are aligned. Bottlenecks T-026..T-032 + T-037 + Wave-D apps. |
| **FT-001** | `withOrgContext()` Server Action HOF + RLS enforcement tests | T-011 | Without it, every tenant-scoped Server Action either denies-or-leaks via RLS. Documented as P0 in T-011 REWORK. |
| **FT-020** | Bootstrap `org.platform.admin` for Apex tenant + seed runbook | T-039 | T-039's canary-upgrade Server Actions return 403 in prod by default — no admin user has the role. Hard ops blocker. |
| **FT-021** | Fix `migrate.ts` 017-rbac.sql checksum mismatch; replay mig 023 cleanly | T-039, T-013 | Production deploy path is broken: any new migration after 017 is currently being applied via direct psql + manual `schema_migrations` insert. T-013 and T-039 both bypassed migrate.ts. |
| **FT-032** | HMAC-bound SAML `RelayState` (org_id + nonce + exp) | T-012 | Defence vs replay + cross-tenant binding even if Issuer-host check is bypassed. Auth-surface integrity. |

### P1 — must-fix in next sprint (16)

FT-002 (user_pins RLS USING true), FT-006 (setPin caller-contract + pool fix), FT-008 (server-only marker), FT-010 (8h absolute session), FT-011 (jti replay protection), FT-016 (cross-org grant rejection), FT-017 (BYPASSRLS → getAppConnection in grantRole), FT-019 (SoD target-roles fix), FT-022 (owner-pool memoization), FT-023 (audit_events_dept_column_denied CHECK), FT-024 (tenant_idp_config column-level GRANT), FT-026 (xmldom Issuer parser), FT-028 (enforceSamlPolicy in password sign-in), FT-029 (SCIM ambiguity-guard test), FT-030 (Jackson createConnection at onboarding), FT-031 (SCIM Group provisioning), FT-038 (`getSystemActorConnection()` + constant-time cron compare), FT-039 (Playwright + real-Chromium PWA E2E), FT-049 (totp masterKey fail-closed guard).

### P2 — nice-to-have (15)

FT-003 (Radix colon-id docs), FT-004 (VALIDATE CONSTRAINT post-fresh-DB), FT-005 (Supabase deploy runbook), FT-007 (ReasonInput aria-label/forwardRef), FT-009 (industry_code='generic' whitelist verify), FT-013 (tenant-scoped sign-up flag), FT-014 (rbac shared pool lifecycle), FT-015 (POSTHOG_KEY rename), FT-018 (Permission constant import), FT-025 (dept_column_drafts partial unique), FT-027 (audit_events.org_id nullable), FT-034 (SLO session-cookie clear), FT-035 (Wizard step 2 RHF+Zod), FT-036 (plugin-react-oxc swap), FT-040 (executor cascading branch wiring), FT-041 (drift-detect strict mode), FT-042 (public.fg promote to migration), FT-043 (@monopilot/ops alias), FT-044 (org-scoped sequence for nextSeq7), FT-045 (Vercel cron documentation), FT-048 (tenant_migrations FK restore), FT-050 (NIST 25K password list).

### P3 — accept-as-debt (3)

FT-012 (shouldFail click-transition test — story-only ergonomics), FT-037 (test-setup userEvent monkey-patch), FT-046 + FT-047 (executor async-result + outbox error surfacing — purely speculative-future).

## C. Consolidated table (Final-T-ID | Originator(s) | Scope | Severity | Effort | Dependencies)

| FT | Originator(s) | Scope (one-line) | Sev | Effort | Depends on |
|---|---|---|---|---|---|
| FT-001 | T-011 | `withOrgContext()` HOF + RLS tests | P0 | M | — |
| FT-002 | T-016 | `user_pins` RLS USING org-scope restore | P1 | S | T-058 (DONE) |
| FT-003 | T-031 | Radix colon-id axe quirk doc in `packages/ui/TESTING.md` | P2 | S | — |
| FT-004 | T-014 | `audit_events_role_assigned_security_check` VALIDATE CONSTRAINT | P2 | S | clean DB pass |
| FT-005 | T-011 | Supabase deploy runbook + verifier script | P2 | M | — |
| FT-006 | T-016 | `setPin/verifyPin` caller-contract JSDoc + pool.end fix | P1 | S | — |
| FT-007 | T-031 | `ReasonInput` aria-label + forwardRef | P2 | S | FT-033 |
| FT-008 | T-033 | `import 'server-only'` on flags route | P1 | XS | — |
| FT-009 | T-014 | Verify `industry_code='generic'` in CHECK whitelist | P2 | XS | — |
| FT-010 | T-011 | 8-h absolute session lifetime + `session_started_at` | P1 | M | FT-001 |
| FT-011 | T-014 | Approval-token `jti` + `consumed_approval_tokens` | P1 | M | — |
| FT-012 | T-031 | `shouldFail=true` click error-transition test | P3 | XS | — |
| FT-013 | T-011 | Tenant-scoped JIT provisioning flag | P2 | S | — |
| FT-014 | T-014 | `closeRbacPool()` + shared rbac pool lifecycle | P2 | S | — |
| FT-015 | T-033 | `POSTHOG_KEY` → `POSTHOG_API_KEY` + .env.example | P2 | XS | — |
| FT-016 | T-014, T-036 | Cross-org grant rejection + `assertActorBelongsToOrg` | P1 | S | — |
| FT-017 | T-014 | Refactor `grantRole` to `getAppConnection()` + RLS | P1 | M | FT-001 |
| FT-018 | T-033 | `Permission.ORG_ACCESS_ADMIN` import (no inlined string) | P2 | XS | — |
| FT-019 | T-014 | SoD: check target's existing roles too | P1 | S | — |
| FT-020 | T-039 | Apex `org.platform.admin` bootstrap + runbook | P0 | S | — |
| FT-021 | T-039, T-013 | Fix migrate.ts checksum on 017-rbac.sql; replay 023+024 | P0 | S | — |
| FT-022 | T-039 | Owner-pool memoization + request-scoped actor org | P1 | M | FT-001 |
| FT-023 | T-036 | `audit_events_dept_column_denied_security_check` CHECK | P1 | S | — |
| FT-024 | T-012 | `tenant_idp_config` column-level GRANT (or service-role-only) | P1 | S | — |
| FT-025 | T-036 | `dept_column_drafts` partial unique on draft status | P2 | S | — |
| FT-026 | T-012 | xmldom + namespace-aware XPath for SAML Issuer | P1 | M | — |
| FT-027 | T-013 | `audit_events.org_id` nullable for unauth security events | P2 | S | — |
| FT-028 | T-012 | `enforceSamlPolicy` in password/magic sign-in routes | P1 | M | FT-001 |
| FT-029 | T-013 | SCIM cross-tenant ambiguity-guard test (>1 hash verifies) | P1 | XS | — |
| FT-030 | T-012 | Jackson `createConnection` at tenant onboarding | P1 | M | — |
| FT-031 | T-013 | SCIM Group provisioning POST/PATCH | P1 | L | — |
| FT-032 | T-012 | HMAC-bound RelayState (org_id + nonce + exp) | P0 | M | — |
| FT-033 | T-037 | Align `packages/ui` to React 19 peerDeps + reinstall deps | P0 | M | — |
| FT-034 | T-012 | SLO session-cookie clearing + Supabase session revoke | P2 | S | — |
| FT-035 | T-037 | `SchemaColumnWizard` step 2 → RHF + Zod | P2 | M | FT-033 |
| FT-036 | T-037 | Swap to `@vitejs/plugin-react-oxc` | P2 | S | FT-033 |
| FT-037 | T-037 | Remove user-event monkey-patch (waiting on v15) | P3 | XS | upstream |
| FT-038 | T-034 | `getSystemActorConnection()` + constant-time cron compare | P1 | S | — |
| FT-039 | T-042 | Playwright + real-Chromium offline E2E for PWA | P1 | M | — |
| FT-040 | T-021 | Wire executor `cascading` → `runCascade` dispatch | P2 | S | — |
| FT-041 | T-034 | Drift-detect strict mode + `extra_in_db` population | P2 | S | dept_code registry |
| FT-042 | T-021 | `public.fg` to real migration when 01-NPD ships | P2 | S | 01-NPD module |
| FT-043 | T-034 | `@monopilot/ops` tsconfig path alias | P2 | XS | — |
| FT-044 | T-021 | Org-scoped Postgres sequence for `nextSeq7()` | P2 | S | — |
| FT-045 | T-034 | Document Vercel-only `x-vercel-cron` trust assumption | P2 | XS | — |
| FT-046 | T-035 | Surface `EvaluateResult` through async `executeRule` | P3 | M | future async |
| FT-047 | T-035 | Outbox-error surfacing once upstream reporter exists | P3 | S | future |
| FT-048 | T-038 | Restore `tenant_migrations.tenant_id` FK | P2 | S | T-039 prod-verified |
| FT-049 | T-015 | `totp.ts` `masterKey` fail-closed env-var guard | P1 | S | — |
| FT-050 | T-061 | Bundle NIST 25K common-password list | P2 | S | — |

Effort key: XS ≤ 1h | S ≤ 4h | M ≤ 1d | L > 1d.

## D. Group by theme

### Auth / RBAC infrastructure (15)
FT-001 (withOrgContext HOF), FT-002 (user_pins RLS), FT-010 (8h session), FT-011 (jti replay), FT-013 (JIT flag), FT-016 (cross-org grant), FT-017 (BYPASSRLS refactor in grantRole), FT-019 (SoD on target), FT-020 (Apex platform.admin bootstrap), FT-022 (request-scoped actor org), FT-024 (tenant_idp_config grants), FT-028 (SAML in password sign-in), FT-029 (SCIM ambiguity-guard test), FT-031 (SCIM Group provisioning), FT-049 (totp masterKey fail-closed).

### Auth / SAML & SLO (5)
FT-026 (xmldom Issuer), FT-030 (Jackson onboarding), FT-032 (HMAC RelayState), FT-034 (SLO cookie clear), FT-006 (setPin caller-contract).

### Schema / migrations (5)
FT-021 (migrate.ts 017 checksum), FT-023 (audit_events_dept CHECK), FT-025 (dept_column_drafts partial unique), FT-027 (audit_events.org_id nullable), FT-042 (public.fg to migration), FT-048 (tenant_migrations FK), FT-004 (VALIDATE CONSTRAINT), FT-009 (industry_code='generic').

### UI infra (6)
FT-033 (React 19 peer — bottleneck), FT-007 (ReasonInput), FT-035 (Wizard RHF), FT-036 (plugin-react-oxc), FT-039 (Playwright PWA), FT-003 (Radix colon-id docs).

### Test infra / quality (5)
FT-014 (closeRbacPool), FT-029 (SCIM ambiguity test — overlaps auth), FT-037 (user-event monkey-patch), FT-040 (executor cascade wiring), FT-041 (drift-detect strict).

### Ops / CI / cron (4)
FT-038 (getSystemActorConnection + constant-time), FT-043 (@monopilot/ops alias), FT-045 (Vercel cron doc), FT-039 (Playwright E2E — overlaps UI).

### Docs / runbooks (3)
FT-005 (Supabase deploy runbook), FT-008 (server-only marker), FT-015 (POSTHOG_API_KEY rename), FT-018 (Permission constant import).

### Observability (3)
FT-046 (executor async result), FT-047 (outbox error surfacing), FT-050 (NIST 25K passwords).

## E. Recommended Wave-D rework sequence

**The bottleneck is FT-033 (React 19 peer alignment).** Until `packages/ui` peerDeps are aligned with React 19, the entire UI surface — Stepper, Field, Modal-anchored patterns (T-026..T-032), `SchemaColumnWizard` (T-037), and any Wave-D consumer in `apps/web` — cannot import the primitives. T-037 already shipped a workaround (`InlineStepper` + custom `jsxPreTransformPlugin`); FT-035, FT-036, FT-007 are all blocked behind FT-033. Ship FT-033 first.

**The second bottleneck is FT-021 (migrate.ts 017 checksum).** Both T-013 and T-039 had to apply migrations via direct `psql` + manual `schema_migrations` row insertion because `pnpm tsx scripts/migrate.ts` aborts on the 017-rbac.sql checksum mismatch. Every Wave-D migration inherits this failure mode. Ship FT-021 second.

**The third bottleneck is FT-001 (withOrgContext HOF).** It is referenced by FT-010, FT-017, FT-022, FT-028 — four other items can't land cleanly without it. T-011 REWORK left a CARRY-FORWARD comment block in `session-check.ts`; the comment is now load-bearing scaffolding for Server Actions across the codebase.

### Wave A.6 — pre-Wave-D unblock sweep (recommended)

1. **FT-033** (React 19 peer) — unblocks 6 P1/P2 items + apps/web UI rendering.
2. **FT-021** (migrate.ts checksum) — unblocks every future migration; closes T-013/T-039 deviation debt.
3. **FT-001** (withOrgContext HOF) — unblocks 4 downstream auth items + closes T-011 REWORK gap.

Then in parallel:
4. **FT-020** (Apex platform.admin bootstrap) — production-deploy gate for canary upgrade (T-039).
5. **FT-032** (HMAC RelayState) — auth-surface integrity gate.

Wave-D-concurrent (P1 batch): FT-002, FT-006, FT-010, FT-011, FT-016, FT-017, FT-019, FT-022, FT-023, FT-024, FT-026, FT-028, FT-029, FT-030, FT-031, FT-038, FT-039, FT-049 — 18 items, mostly S/M effort, parallelizable across 3-4 agents.

P2/P3 — push to Wave E or accept-as-debt.

## Reply

- **Total unique carry-forwards (after dedup)**: 50 (collapsed from 64 raw proposals; 14 were collisions on T-062..T-082 IDs or already-resolved-in-REWORK items).
- **P0 count**: 5 (FT-001, FT-020, FT-021, FT-032, FT-033).
- **Top 3 P0 ranked**:
  1. **FT-033** — React 19 peerDeps in `packages/ui` (+ zustand@5, react-hook-form). Bottleneck: every UI primitive is unconsumable by `apps/web` until aligned. Blocks 6 downstream FTs.
  2. **FT-021** — `migrate.ts` checksum-tolerance fix on 017-rbac.sql; replay migrations 023, 024 cleanly. Blocks every future Wave-D migration; both T-013 and T-039 had to bypass the runner.
  3. **FT-001** — `withOrgContext()` Server Action HOF + RLS enforcement tests. Without it, tenant-scoped Server Actions silently deny or leak across orgs. Blocks FT-010, FT-017, FT-022, FT-028.
- **Recommended first 3 Wave-D tasks**: ship FT-033, FT-021, FT-001 in that order as a "Wave A.6 — pre-Wave-D unblock sweep". FT-033 first (parallel-safe with FT-021 since they touch disjoint trees: `packages/ui` deps vs `scripts/migrate.ts`), then FT-001 once FT-033 lands so the new HOF can be exercised by the UI test harness. FT-020 and FT-032 ride alongside FT-001 in the same wave since both are short-effort security gates with no shared blockers.
