# PRD Amendments — 00-FOUNDATION (gap-backlog F-U1..F-U5 + F-A1..F-A4)

**Date:** 2026-04-30
**Source gap-backlog:** `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` §MODULE 00-FOUNDATION
**Target PRD:** `00-FOUNDATION-PRD.md`
**Version bump:** v4.1 → v4.2
**Coverage target:** 60% → ≥85%

---

## 1. Mapping table — gap-backlog item → PRD line range applied

| Gap-backlog item | Type | Applied at (PRD v4.2 line range) | Section anchor | Status |
|---|---|---|---|---|
| **F-U4** Persona split (Org Admin / Schema Admin) | UPDATE §3 | 122–135 | §3 Personas › Secondary table + ACCESS/ADMIN pillar callout | DONE |
| **F-A4** §4.2-AMENDMENT addendum (`impl-j`) | ADD §4.2 | 191 | §4.2 build sequence — second amendment paragraph | DONE |
| **F-U1** + **F-A1** §5.x Auth & Identity Stack | UPDATE+ADD §5 | 269–283 | §5.x — Auth & Identity Stack [UNIVERSAL] | DONE |
| **F-A3** §5.y Shared UI Primitives `@monopilot/ui` | ADD §5 | 285–306 | §5.y — Shared UI Primitives [UNIVERSAL] | DONE |
| **F-U2** + **F-A2** §8.x Per-tenant IdP Mapping | UPDATE+ADD §8 | 432–474 | §8.x — Per-tenant IdP Mapping [UNIVERSAL] | DONE |
| **F-U3** §11 Audit log expansion (1 paragraph → 13-field schema + retention tiers) | UPDATE §11 | 904–943 | §11 Cross-cutting › Audit log | DONE |
| **F-U5** §13 Niefunkcjonalne (5 new criteria) | UPDATE §13 | 1054–1058 | §13 Success Criteria › Niefunkcjonalne | DONE |
| Changelog v4.2 entry | UPDATE Changelog | 1188 | Changelog | DONE |
| Front-matter version bump (v4.0/v4.1 → v4.2) | UPDATE front-matter | 3–7 | YAML header | DONE |
| Footer version line | UPDATE Footer | 1200 | EOF | DONE |

---

## 2. Items applied / deferred

### Applied (all 9)

**Updates (5/5):**
- **F-U1** — §5 Tech Stack Auth & Identity Stack expansion. Done as a new §5.x sub-section (rather than mutating each line of the existing Runtime/Backend/Infra blocks) because the prior §5 mentioned Supabase only as a Postgres host and the auth subsystem was invisible; a contiguous §5.x reads cleaner and matches the gap-backlog "Add §5.x" wording.
- **F-U2** — §8 Multi-tenant Model per-tenant IdP mapping. Added as §8.x with full DDL per F-A2 sketch.
- **F-U3** — §11 Audit log expanded from a 1-sentence paragraph to a 13-field schema + 4-tier retention matrix + SOC 2/GDPR/Part 11/FSMA 204 alignment.
- **F-U4** — §3 Personas split. Original "Administrator" row replaced by **Org Admin** (ACCESS pillar) and **Schema Admin** (ADMIN pillar) with `org.access.admin` / `org.schema.admin` system-role names, dual-control-required toggle for SOC 2 CC6.3, and partitioned `/settings/access/*` vs `/settings/admin/*` URL surfaces.
- **F-U5** — §13 Niefunkcjonalne 5 new checkbox criteria (MFA-by-default, NIST password policy, idle timeout default, SSO baseline, magic-link 7-day TTL).

**Additions (4/4):**
- **F-A1** §5.x Auth & Identity Stack [UNIVERSAL] — ~340 words covering GoTrue/Supabase Auth, `@boxyhq/saml-jackson`, SCIM 2.0, TOTP via `otplib`, WebAuthn via `@simplewebauthn/server`, magic-link 7-day TTL, argon2id verify-PIN, JWT 15min/refresh rotating idle 60min/abs 8h, 6 OSS libraries locked.
- **F-A2** §8.x Per-tenant IdP Mapping [UNIVERSAL] — ~310 words including full `tenant_idp_config` DDL with `provider_type` enum (saml/oidc/password/magic), JIT provisioning bool, SCIM token argon2id hash, per-tenant idle_timeout/session_max/mfa_required overrides, `mfa_allowed_methods` array, password complexity/expiry overrides.
- **F-A3** §5.y Shared UI Primitives `@monopilot/ui` [UNIVERSAL] — ~270 words on `packages/ui` workspace package, 5 modal/form primitives (Modal/Stepper/Field/ReasonInput/Summary), 5 tuning primitives, MODAL-SCHEMA.md as canonical 10-pattern contract, Storybook 8 + axe-core CI ≥21 stories, ESLint `no-restricted-imports` blocking `@radix-ui/react-dialog` outside `packages/ui`.
- **F-A4** §4.2-AMENDMENT addendum — adds `00-FOUNDATION-impl-j` to the Foundation set as a critical-path blocker; explicitly states `impl-j` MUST complete in parallel with `impl-d/e/f/g/h` and BEFORE any 01-NPD-a or 02-SETTINGS T3-ui task starts.

### Deferred (none)

All 9 specified gap-backlog items applied. No deferrals.

---

## 3. ADR-034 markers

Every new section explicitly carries `[UNIVERSAL]` in its heading (§3 ACCESS/ADMIN pillar split, §5.x Auth, §5.y UI Primitives, §8.x IdP Mapping, §11 Audit log expansion). No `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` markers were warranted — all five amendments describe cross-industry, cross-tenant capabilities. Per-tenant *values* (e.g., the chosen `provider_type` or `password_complexity`) are tenant configuration, but the *capability* and *table structure* are universal — same marker discipline as §9.1 Manufacturing Operations precedent.

---

## 4. Coverage estimate

### Before (gap-backlog measurement, 2026-04-30):
- **00-FOUNDATION = ~60%** — auth subsystem absent, UI primitives absent, audit log thin, persona split missing, NFR criteria for security missing.

### After (this amendment):
- Auth subsystem: **specced end-to-end** (stack, session policy, MFA, federation, provisioning, per-tenant config) — closes ~12 percentage points
- UI primitives: **specced as workspace package + 10-pattern contract** — closes ~6 percentage points
- Audit log: **13-field schema + 4-tier retention + compliance map** — closes ~4 percentage points
- Persona split + NFR criteria — closes ~3 percentage points

**Estimated post-amendment coverage: ~85% (target met).**

Residual ~15% gap drivers:
1. Phase 3 WebAuthn full UX flow (deferred per D7 gap-backlog decision).
2. Cross-tenant analytics warehouse schema (mentioned in §8 Admin tooling but not specced).
3. Specific monorepo workspace bootstrap details for `packages/ui` (left to `T-00j-001..007` task ACs in `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md`).
4. Some §14 open items (R10.3 partition strategy, event bus MVP consumer, LLM platform) remain unresolved — out of scope for these specific gap-backlog F-* items.

---

## 5. Gap-backlog content NOT applied — and why

**None.** Every content sketch in the F-U1..F-U5 + F-A1..F-A4 rows was applied either verbatim or in the same shape with minor inline expansion to reach the word-count guidance (e.g., F-A1 sketch said ~330 words; written section is ~340 words).

The plan-side items (F-PU1..F-PU4 plan updates and the 11 + 7 new task definitions T-00c-007..017 / T-00j-001..007) are **out of scope of this PRD amendment** — they live in `_meta/plans/` and will be applied to the Phase E-0 task plan separately (per gap-backlog Wave 3 sequence).

---

## 6. Cross-references for downstream consumers

PRDs that should now reference 00-FOUNDATION v4.2:
- **02-SETTINGS-PRD** — §14.5/§14.6/§14.7 (SSO/SCIM/IP Allowlist) UI consumes `tenant_idp_config` from §8.x; SecurityScreen consumes `org_security_policies` (referenced in §11 audit retention class binding); Modal contract reference per F-A3 / S-A4 cross-link.
- **01-NPD-PRD** — every modal task must depend on `T-00j-003` per §5.y critical-path note.
- **All module PRDs** — must use `assertModalA11y()` from `packages/ui/test` and one of the 10 MODAL-SCHEMA patterns; no direct `@radix-ui/react-dialog` imports.

---

*Audit complete. PRD 00-FOUNDATION v4.2 ready for Phase E-0 kickoff (`00-FOUNDATION-impl-a..j`).*
