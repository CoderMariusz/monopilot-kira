# Foundation Wave A — PRD vs Code Drift Audit (2026-05-07)

Auditor: Opus DEEP-REVIEWER
Scope: 21 DONE tasks in `_meta/atomic-tasks/00-foundation/STATUS.md` vs `docs/prd/00-FOUNDATION-PRD.md` v4.3
Method: read every migration / source file claimed to cover a PRD section and compared literal contract.

## Executive summary

Foundation Wave A scaffolding is real and largely faithful: schema-driven (T-017), Reference.Rules with the 4 ADR-029 `rule_type` values (T-018), R13 placeholder tables (T-040), outbox 12-event CHECK matching `events.enum.ts` (T-008/T-003), audit_events with 13 numbered fields + retention_class CHECK (T-009), and idempotency_keys (T-024). However coverage.md overstates done-ness in three load-bearing places: **(a) the SoD split (§3, F-U4) is not enforceable** because T-014 (RBAC enforcement library) is `⬜ PENDING` — only the enum SoD pair lock exists; **(b) `tenant_idp_config` (§8.x F-A2) ships ~8 of ~17 PRD-specified columns** — all SAML/SCIM/JIT/password-expiry fields are missing; **(c) F-U5 NIST password policy (§13)** is implemented as the literal string `'strong'` with zero NIST behavior (no min-12, no HIBP, no last-5 history). PRD §13 success criteria cannot be claimed as covered. T-035 (workflow-as-data executor), T-039 (canary upgrade orchestration), and many auth tasks (T-011..T-016) are pending despite coverage.md marking the corresponding sections "covered". Net: the migrations/data plane is solid; the auth/identity/policy plane is only stubbed.

## Coverage table

| PRD ref | What PRD requires | What code delivers | Drift severity | Evidence (file:line) |
|---|---|---|---|---|
| §1 six principles | Six principles embedded in product contract; ADRs reference them | ADR-035 references §1 conceptually but does not enumerate P1-P6 or trace each principle to an ADR/test | P2 | `_foundation/decisions/ADR-035-marker-discipline.md:5` |
| §2 marker discipline | 4 markers; checker enforcing per heading; allowlist for front-matter | ADR-035 defines markers; `scripts/check-markers.mjs` enforces; CHANGELOG confirms exit 0/1 fixture | none | `_foundation/decisions/ADR-035-marker-discipline.md:16-22`, `CHANGELOG.md:20` |
| §3 personas + Org Admin / Schema Admin SoD | Two system roles `org.access.admin` / `org.schema.admin` mutually exclusive at grant level by default; dual-control mode toggle `org_security_policies.dual_control_required=true` | `permissions.enum.ts` defines both perms + `SOD_EXCLUSIVE_PAIRS = [[ORG_ACCESS_ADMIN, ORG_SCHEMA_ADMIN]]`. NO enforcement library, NO `org_security_policies` table, NO dual-control flow | **P0** | `packages/rbac/src/permissions.enum.ts:1-28`; T-014 ⬜ PENDING per `STATUS.md:28` |
| §4.2 build sequence | Phase E-0 atomic tasks; impl-j critical-path | T-005 seeded registry; `modules.json` built; STATUS reflects sequence | P2 (impl-j parallel constraint not codified anywhere as a test) | `_foundation/registry/modules.json` |
| §4.3 15-module table | 16 entries (00 + 15) with id/slug/phase/build_order/file/dependencies | `modules.json` matches: 16 entries, ids 00-15, build_order 1-15, business_scope_column=org_id everywhere | none | `_foundation/registry/modules.json:1-146` |
| §5 Postgres+JSONB+RLS | `org_id UUID NOT NULL` everywhere; safe non-spoofable RLS pattern; LEAKPROOF only when justified | `001-baseline.sql` org/users use `org_id`; `002-rls-baseline.sql` uses session_org_contexts + active_org_contexts SECURITY DEFINER pattern, no LEAKPROOF, no GUC-based; force RLS enabled | none | `packages/db/migrations/001-baseline.sql:40-56`, `002-rls-baseline.sql:1-99` |
| §5 Outbox + Zod + i18n + GS1 + idempotent | outbox_events; Zod runtime; 4-locale i18n; GS1 (GTIN/SSCC/GLN/GRAI/GDTI); idempotent UUID v7 | All present. outbox 12-event CHECK = `ALL_EVENTS`; events.enum has `LegacyEventAlias`; i18n routing.ts `pl/en/uk/ro`; gs1 has 5 parsers; `idempotency_keys` table | none | `003-outbox.sql:15-30`, `events.enum.ts:1-22`, `apps/web/i18n/routing.ts`, `packages/gs1/src/parse.ts`, `015-idempotency.sql` |
| §5 PWA Workbox | Workbox SW + manifest + IndexedDB sync queue | `app/manifest.ts` (8-icon set spec'd; only 2 sizes shipped); `app/sw.ts` uses Serwist (Workbox v7 successor) | P2 (Serwist not Workbox; manifest.ts ships 2 of typical 8 icons; `theme_color` is white) | `apps/web/app/manifest.ts:1-24`, `apps/web/app/sw.ts:1-25` |
| §5 IndexedDB sync queue | enqueue/list/remove + UUID v7 + R14 dedup flusher | T-043, T-044 are ⬜ PENDING per `STATUS.md:57-58`; `packages/sync-queue` directory exists but flusher unverified | **P0** vs coverage.md claim of "covered" | `STATUS.md:57-58` (T-043/T-044 PENDING) |
| §5/§13 RLS app-role | Tests run as app-role never superuser; ESLint guard | T-045 ⬜ PENDING per `STATUS.md:59`; `0010_app_role.sql` does CREATE ROLE monopilot_app + monopilot_app_local + app_user with NOSUPERUSER NOBYPASSRLS — but split-connection wiring + ESLint guard not verified done | **P0** (coverage.md claims covered; STATUS says PENDING) | `0010_app_role.sql:1-83`, `STATUS.md:59` |
| §5.x Auth & Identity (6 OSS libs) | Supabase Auth + saml-jackson + otplib + simplewebauthn + argon2 wired; SAML/SCIM/TOTP/verify-PIN endpoints | T-011..T-016 ALL ⬜ PENDING per `STATUS.md:25-30` | **P0** vs coverage.md "covered" | `STATUS.md:25-30` |
| §5.y UI primitives + 10 MODAL-SCHEMA | 5 modal primitives + 5 tuning + 10 patterns + Storybook ≥21 stories + axe-core | Only `Modal.tsx` shipped (T-025). T-026..T-031 ⬜ PENDING per `STATUS.md:40-45` | **P0** vs coverage.md "covered" | `packages/ui/src/`, `STATUS.md:40-45` |
| §6 Schema-driven foundation (ADR-028) | Reference.DeptColumns + Reference.FieldTypes + Reference.Formulas + json-schema-to-zod runtime + LRU cache per schema_version | `009-schema-driven.sql` creates all 3 tables with R13 cols + RLS; 8 FieldTypes seeded (string/number/integer/boolean/date/datetime/enum/formula); LRU cache referenced in STATUS notes | none | `009-schema-driven.sql:14-220` |
| §6 Admin UI wizard backend + 5-step UI | draft/publish + schema_version bump + Stepper UI | T-036, T-037 ⬜ PENDING per `STATUS.md:50-51` | **P0** vs coverage.md "covered" | `STATUS.md:50-51` |
| §7 Rule engine DSL (ADR-029) — 4 rule_types | rule_type ∈ {cascading, conditional_required, gate, workflow}; JSON DSL stored in Reference.Rules with `tenant_id, rule_type, definition_json, version, active_from, active_to` | `010-rules.sql` creates table with EXACT 4 rule_types CHECK + version + active_from/to + R13 cols; **uses `org_id` not `tenant_id`** (intentional Wave0 §W0-v4.3 §1) | P2 (PRD §7 sample DDL still says `tenant_id`; that's a PRD-text drift not a code drift) | `010-rules.sql:13-32` |
| §7 Workflow-as-data 4th rule_type executor | State-machine evaluator | T-035 ⬜ PENDING per `STATUS.md:49` | **P0** vs coverage.md "covered" | `STATUS.md:49` |
| §8 Multi-tenant L1-L4 + RLS + tenant_idp_config | All 17 columns of F-A2 DDL block: `tenant_id, provider_type, provider_label, metadata_url, entity_id, x509_cert, jit_provisioning, scim_token_hash, scim_token_last_four, enforce_for_non_admins, idle_timeout_min, session_max_h, mfa_required, mfa_required_for_roles, mfa_allowed_methods, password_complexity, password_expiry_days, created_at, updated_at` | `005-tenant-idp-config.sql` ships only 8 of those: `tenant_id, provider_type, idle_timeout_min, session_max_h, mfa_required, mfa_required_for_roles, mfa_allowed_methods, password_complexity`. Missing: provider_label, metadata_url, entity_id, x509_cert, jit_provisioning, scim_token_hash, scim_token_last_four, enforce_for_non_admins, password_expiry_days, created_at, updated_at | **P0** | `005-tenant-idp-config.sql:5-16` vs PRD §8.x DDL block lines 439-461 |
| §8 Upgrade orchestration tenant_migrations | `(tenant_id, component, current_version, target_version, last_run_at)` + canary cohort progression | `013-tenant-migrations.sql` ships PRD's 5 fields + `cohort` (canary/early/general CHECK) + `status` CHECK + `failure_reason`. PRD says current_version is the version per component; code has `current_version text not null`. **No FK to organizations** (documented carry-forward in T-038 notes). T-039 (advanceCohort + recordMigrationRun actions) ⬜ PENDING | P1 (table exists; orchestration actions don't) | `013-tenant-migrations.sql:8-23`, `STATUS.md:53` |
| §9 Configurable dept taxonomy (ADR-030) | Reference.Departments + organizations.dept_overrides JSONB + 7 Apex dept seed | `011-departments.sql` creates Reference.Departments with org_id, code, display_name, role_description, marker default 'APEX-CONFIG'; `organizations.dept_overrides JSONB DEFAULT '{}'` added; **seed comment says "Seeded via apex-departments.sql (called separately)" — actual seed script unverified** | P2 (seed file referenced but not located in this audit) | `011-departments.sql:13-52` |
| §9.1 ManufacturingOperations + cascade | Reference.ManufacturingOperations table + bakery/pharma/fmcg seed + Chain-2 cascade rule | T-020, T-021 ⬜ PENDING per `STATUS.md:34-35`. **No `012-manufacturing-operations.sql` migration found** (STATUS lists "012 manufacturing-operations (T-020)" as planned but the file does not exist on disk) | **P0** vs coverage.md "covered" | `STATUS.md:34-35`, `packages/db/migrations/` directory listing |
| §10 Outbox 12-event CHECK | 12 canonical event_type values matching events.enum.ts | `003-outbox.sql` CHECK lists exactly the 12 EventType members in events.enum.ts; LegacyEventAlias maps 3 fa.* aliases — alias-only never canonical | none | `003-outbox.sql:15-30` vs `events.enum.ts:1-22` |
| §10 R13 columns on lot/work_order/quality_event/shipment/bom_item | 7 R13 fields (id UUID v7 preferred, external_id, org_id, created_at monotonic, created_by_user, created_by_device, app_version) + 2 hooks (model_prediction_id NULL, epcis_event_id NULL) — total 9 PRD-required columns. Plus `schema_version INT` per §6 | `0014_r13-placeholder-tables.sql` — every table has: id/external_id/org_id/created_at/created_by_user/created_by_device/app_version/model_prediction_id/epcis_event_id/schema_version = 10 cols. UUID is `gen_random_uuid()` (UUIDv4) NOT v7 as PRD states "(v7 time-ordered preferred)" | P1 (UUID v7 preference not honoured; otherwise complete on all 5 tables) | `0014_r13-placeholder-tables.sql:7-148` |
| §10 GS1-first | GTIN/SSCC/GLN/GRAI/GDTI parsers + mod-10 | 5 parsers in `packages/gs1/src/parse.ts`; check-digit.ts; 43/43 tests | none | `packages/gs1/src/parse.ts` |
| §10 Idempotent mutations (R14) | UUID v7 client-generated transaction_id; deterministic replay | `015-idempotency.sql` ships `transaction_id UUID PK + org_id + request_hash + response_json + expires_at`. canonicalStringify per STATUS notes. UUID v7 not enforced at type level (PG accepts any UUID); design correctly defers v7 to client | none (acceptable interpretation) | `015-idempotency.sql:1-37` |
| §11 i18n + Audit log | 4 locales pl/en/uk/ro; ICU; audit_events 13 fields + retention tiers | i18n: 4 locale JSON files + routing.ts; audit_events: all 13 numbered fields present + retention_class CHECK matches 4 tiers | P1 only on indexes — PRD specifies 3 indexes with tenant_id + DESC ordering and a partial index on actor_user_id IS NOT NULL; code ships 3 different indexes: `(org_id, occurred_at)` (no DESC), `(request_id)` (PRD does not specify), `(resource_type, resource_id)` (no org_id prefix, no DESC). Functionally adequate but not faithful to PRD §11 | `004-audit.sql:51-60` vs PRD §11 lines 931-933 |
| §11 Regulatory artifact | `_foundation/regulatory/` with FSMA204/EUDR/Peppol/etc deadlines | T-032 ⬜ PENDING per `STATUS.md:46` | **P0** vs coverage.md "covered" | `STATUS.md:46` |
| §12 ADRs 028-031 active | All four ADRs Active + R1-R15 candidates | ADR-028..031 referenced in PRD frontmatter and ADR-035; not independently verified in this audit | P2 (assumed present from references; recommend deep ADR scan) | PRD frontmatter |
| §13 F-U5 MFA-by-default both admin roles | `tenant_idp_config.mfa_required_for_roles` seed = `[org.access.admin, org.schema.admin]` | seed function in `005-tenant-idp-config.sql` line 41 sets exactly that array | none | `005-tenant-idp-config.sql:41` |
| §13 F-U5 NIST password policy | min 12 chars, no expiry, HIBP k-anonymity, last-5 history; `password_complexity='strong'` is the SEED value, the BEHAVIOR is NIST | `005-tenant-idp-config.sql` defaults `password_complexity='strong'` as a literal label only. **No min-length enforcement, no HIBP, no history table** anywhere in the codebase | **P0** | `005-tenant-idp-config.sql:13` |
| §13 F-U5 idle TTL 60min / session 8h | seed defaults | seeded correctly: `idle_timeout_min=60`, `session_max_h=8` | none | `005-tenant-idp-config.sql:8-9, 38-39` |
| §13 F-U5 magic-link 7d, single-use, signed | TTL = 7 days, codified not Supabase-default | T-011 (Supabase Auth wiring) ⬜ PENDING. No code for magic-link TTL exists | **P0** vs coverage.md "covered" | `STATUS.md:25` |
| §13 F-U5 SSO baseline SAML 2.0 + Entra ID | saml-jackson endpoints `/api/auth/saml/{login,callback,logout,metadata}` | T-012 ⬜ PENDING; no SAML routes | **P0** vs coverage.md "covered" | `STATUS.md:26` |
| §13 niefunkcjonalne — drift detection + RLS coverage 100% | Daily drift job + RLS policy on every business table | T-034 ⬜ PENDING per `STATUS.md:48`. RLS is on every table that has been created (organizations/users/audit_events/outbox_events/idempotency_keys/Reference.*/lot/work_order/quality_event/shipment/bom_item/Rules) — so 100% coverage **of currently extant tables** | P1 (drift detection job not built) | `STATUS.md:48` |

## Critical drifts (P0)

1. **§3 SoD enforcement is missing.** Coverage.md claims §3 + F-U4 is covered by T-004 + T-014; T-014 is ⬜ PENDING. The enum file ships a `SOD_EXCLUSIVE_PAIRS` constant but no code consumes it — there is no `assertNoSoD()`, no role-grant API, no `org_security_policies.dual_control_required` table. Cannot claim SOC 2 CC6.3.
2. **§8.x `tenant_idp_config` is ~50% built.** Missing F-A2 columns: `provider_label, metadata_url, entity_id, x509_cert, jit_provisioning, scim_token_hash, scim_token_last_four, enforce_for_non_admins, password_expiry_days, created_at, updated_at`. SAML/SCIM cannot wire onto this table without a follow-up migration.
3. **§13 F-U5 NIST password policy** is implemented as the literal string `'strong'` only. No 12-char minimum, no HIBP integration, no last-5 history table, no expiry-disabling logic. PRD §13 success criterion is not met.
4. **§13 F-U5 magic-link 7-day codified TTL** + **SSO Entra ID baseline** + **SCIM endpoints**: all depend on T-011/T-012/T-013 which are ⬜ PENDING. Coverage.md still marks §13 row as covered.
5. **§5.x 6-OSS-libs auth subsystem (T-011..T-016)** not started. Coverage.md row marks "covered" — should be "Wave A scaffolding only; auth wave pending".
6. **§5.y UI primitives** — only `<Modal/>` (T-025) merged; T-026..T-031 ⬜ PENDING but row marks "covered". 10 MODAL-SCHEMA pattern templates not built.
7. **§5 IndexedDB sync queue + flusher** (T-043/T-044) ⬜ PENDING; coverage marks "covered".
8. **§5/§13 RLS app-role tests** (T-045) ⬜ PENDING; coverage marks "covered".
9. **§6 Admin UI wizard** (T-036/T-037) ⬜ PENDING; coverage marks "covered".
10. **§7 Workflow-as-data executor** (T-035) ⬜ PENDING; coverage marks "covered".
11. **§9.1 ManufacturingOperations** (T-020/T-021) ⬜ PENDING; **no `012-manufacturing-operations.sql` exists** despite STATUS migration-ordering reference.
12. **§11 Regulatory roadmap artifact** (T-032) ⬜ PENDING; coverage marks "covered".
13. **§13 drift detection job** (T-034) ⬜ PENDING; coverage marks "covered".

## Notable drifts (P1)

- **R13 UUID v7 preference not enforced.** PRD §10 says "id UUID (v7 time-ordered preferred)". `0014_r13-placeholder-tables.sql` uses `gen_random_uuid()` (UUIDv4). Acceptable as a placeholder, but document or upgrade pgcrypto/uuidv7 extension before production.
- **§11 audit_events indexes deviate from PRD.** PRD specifies three indexes: `(tenant_id, occurred_at DESC)`, `(tenant_id, resource_type, resource_id, occurred_at DESC)`, partial `(tenant_id, actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL`. Code ships `(org_id, occurred_at)` (no DESC), `(request_id)` (not in PRD), `(resource_type, resource_id)` (no org_id prefix, no DESC). Functionally adequate — but query plans for "actor history" + "resource history within an org" will be slower than PRD assumed.
- **§8 tenant_migrations has no FK to organizations** — documented carry-forward in T-038 notes; orchestrator (T-039) is the safety net but isn't built.
- **§5 PWA manifest** ships 2 icons (192/512); typical PWA install requires more sizes (maskable, apple-touch). Theme/background both white — non-branded.

## Minor drifts (P2)

- ADR-035 references §1 "six principles" but does not enumerate P1-P6 in the ADR body — readers must round-trip to the PRD.
- PRD §7 example DDL block still uses `tenant_id` for `Reference.Rules` while §W0-v4.3 §1 mandates `org_id`. Code (`010-rules.sql`) correctly uses `org_id` — drift is in PRD text, not code.
- `events.enum.ts` exports `LegacyEventAlias` with three `fa.*` keys (created/allergens_changed/intermediate_code_changed). Outbox CHECK only allows the canonical 12. PRD §10 says aliases are "compatibility only, not canonical". Behaviour is correct (alias resolves at TS layer, never reaches DB CHECK).
- `005-tenant-idp-config.sql` uses `varchar` for `provider_type` and `password_complexity` while PRD DDL uses `TEXT`. Cosmetic.
- `004-audit.sql` allows `actor_type IS NULL` in CHECK; PRD §11 has `actor_type TEXT NOT NULL CHECK (actor_type IN ...)`. Code drops the NOT NULL — minor permissiveness. Same risk: a row with NULL actor_type cannot answer "who did this".
- `011-departments.sql` declares the seed step in a comment ("Seeded via apex-departments.sql … this migration only ensures the schema is ready") but the seed file location is not validated by this audit. STATUS notes "7 Apex depts" suggest it lives elsewhere.
- `0014_r13-placeholder-tables.sql` uses non-standard numbering (4 digits + underscore) while siblings use 3-digit dash. Already flagged in STATUS migration-ordering note for T-024 collision; cosmetic but worth normalising.
- `manifest.json` registry `business_scope_column` is "org_id" on all 16 entries — correct.

## Coverage corrections

`coverage.md` overstates "covered" status. Proposed minimum corrections:

| Row in coverage.md | Current claim | Proposed correction |
|---|---|---|
| §3 + F-U4 (T-004, T-014) | covered | **partial — enum lock only; T-014 enforcement library pending** |
| §5 Tech stack — Outbox + Zod + i18n + GS1 + idempotent | covered | covered (verified) |
| §5 frontend — PWA Workbox (T-041, T-042) | covered | **partial — T-041 manifest+sw shipped; T-042 install/offline E2E pending** |
| §5 frontend — IndexedDB sync queue (T-043, T-044) | covered | **NOT covered — both pending** |
| §5 RLS app-role (T-045) | covered | **NOT covered — pending; role DDL exists but split-conn + ESLint guard pending** |
| §5.x Auth & Identity (T-011..T-016) | covered | **NOT covered — all 6 tasks pending** |
| §5.y UI primitives + 10 MODAL-SCHEMA (T-025..T-031) | covered | **partial — T-025 Modal only; T-026..T-031 pending** |
| §6 Admin UI wizard backend + UI (T-036, T-037) | covered | **NOT covered — both pending** |
| §7 Workflow-as-data executor (T-035) | covered | **NOT covered — pending** |
| §8 Upgrade orchestration (T-038, T-039) | covered | **partial — T-038 table shipped; T-039 actions pending** |
| §8 tenant_idp_config (T-010) | covered | **partial — 8 of 17 PRD columns; SAML/SCIM/JIT/expiry fields missing** |
| §9.1 ManufacturingOperations (T-020, T-021) | covered | **NOT covered — both pending; migration 012 not on disk** |
| §11 i18n + Audit log + regulatory (T-022, T-009, T-032) | covered | **partial — i18n + audit shipped; regulatory T-032 pending** |
| §13 F-U5 baseline (T-010, T-011) | covered | **partial — defaults seeded; NIST policy enforcement, magic-link TTL, SSO Entra connector all pending** |
| §13 niefunkcjonalne — drift detection + RLS coverage (T-007, T-034) | covered | **partial — RLS yes, drift detection T-034 pending** |
| §14 dry-run scope + regulatory (T-018, T-032) | covered | **partial — rule executor stub yes, regulatory pending** |

## Reply to me (≤300 words)

**Top 3 P0 drifts:**

1. **`tenant_idp_config` (T-010) ships only 8 of ~17 PRD §8.x columns.** All SAML (`metadata_url`, `entity_id`, `x509_cert`, `provider_label`), SCIM (`scim_token_hash`, `scim_token_last_four`), JIT (`jit_provisioning`), enforcement (`enforce_for_non_admins`), and password lifecycle (`password_expiry_days`, `created_at`, `updated_at`) columns are missing. T-011..T-013 cannot land cleanly on top — they need a follow-up ALTER migration first. This blocks F-A2/F-U2 claims.
2. **F-U5 NIST password policy is a label, not a policy.** `password_complexity='strong'` is seeded as a string with zero behavior backing it. PRD §13 demands min-12, HIBP k-anonymity, no-expiry, last-5 history. None exists in code. PRD §13 success criterion currently fails closed.
3. **§3 SoD split is unenforced.** `SOD_EXCLUSIVE_PAIRS` constant exists in `permissions.enum.ts` but no consumer. T-014 (RBAC enforcement library) and `org_security_policies.dual_control_required` table are absent. SOC 2 CC6.3 cannot be claimed.

**Does coverage.md need updating?** Yes — at least 12 rows currently marked "covered" should be "partial" or "not covered" (full list in the Coverage corrections section above). The most misleading are §5.x Auth, §5.y UI primitives, §6 wizard, §9.1 ManufacturingOperations (no migration on disk despite STATUS reference), and the entire §13 F-U5 row.

**New tasks needed before claiming Foundation §xyz "done"?** Yes:
- **NEW-T-A**: ALTER `tenant_idp_config` to add the 11 missing F-A2 columns + auto-update `updated_at` trigger.
- **NEW-T-B**: Password policy enforcement library (HIBP client, history table, min-length validator) consumed by T-011 sign-up.
- **Unblock T-014, T-020, T-021, T-032, T-034, T-035, T-036, T-037, T-039, T-042, T-043, T-044, T-045** — 13 of the 21 "Wave A" coverage rows depend on them. Marking Foundation Wave A "done" without these is a coverage-map drift, not just an implementation drift.
