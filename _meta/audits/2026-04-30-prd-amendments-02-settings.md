# 02-SETTINGS PRD Amendments — Audit

**Date:** 2026-04-30
**PRD version:** 3.4 → 3.5
**Source:** `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` § MODULE 02-SETTINGS
**Coverage target:** 70% → ≥90%

---

## Mapping (gap-backlog item → PRD location)

### UPDATES

| ID | Description | PRD lines (post-edit) | Status |
|---|---|---|---|
| **S-U1** | Renumber onboarding screen codes SET-001..SET-007 → SET-001..SET-006 (drop launcher per D3) | §14.4 lines 1632-1644 | Applied |
| **S-U2** | Append `gs1_prefix` to onboarding step 1 (required for 11-SHIPPING SSCC) | §14.3 line 1598 | Applied |
| **S-U3** | Replace step 3 "zone/bin" with ltree path + zone label + bin code | §14.3 line 1600 | Applied |
| **S-U4** | Wizard Back/Jump/Restart nav + first-WO timestamp + redirect-while-incomplete guard | §14.3 lines 1602, 1605-1622 | Applied |
| **S-U5** | Extend `org_security_policies`: `password_complexity`, `password_expiry_days`, rename → `session_idle_timeout_minutes`, add `session_max_length_minutes`, `mfa_allowed_methods` | §5.7 lines 508-524 (schema); §14.1 lines 1564-1581 (doc) | Applied |
| **S-U6** | Clarify 10 system roles in DB + 4 customer-facing UI categories (D1); reject 4-level perm matrix (D2) | §3 lines 127-156 | Applied |
| **S-U7** | Codify magic-link invite 7-day TTL | §5.1 lines 229-230, 240; §14.8 V-SET-88 line 1740 | Applied |
| **S-U8** | Add `seat_limit` column + inviteUser pre-flight check | §5.1 line 214, 236-239; §14.8 V-SET-89 line 1741 | Applied |

### ADDITIONS

| ID | Description | PRD lines (post-edit) | Status |
|---|---|---|---|
| **S-A1** | §14.5 SSO Configuration — `org_sso_config` table; SAML 2.0 + Entra ID Phase 1 | §14.5 lines 1647-1681 | Applied |
| **S-A2** | §14.6 SCIM 2.0 Provisioning — `scim_tokens`; `/scim/v2/Users` `/Groups` | §14.6 lines 1683-1706 | Applied |
| **S-A3** | §14.7 Admin IP Allowlist — `admin_ip_allowlist` (CIDR INET) + middleware enforcement | §14.7 lines 1708-1726 | Applied |
| **S-A4** | § Modal Contract — `_shared/MODAL-SCHEMA.md` canonical; 10 patterns + 5 primitives; backfill 5 dangling MODAL-* IDs (SM-06/07/08/10/11) | §0 lines 19-58 (top of file) | Applied |

### Validation extensions (consequential)

| ID | Validator | Lines |
|---|---|---|
| V-SET-83 (rev) | Idle + absolute session timeouts | line 1735 |
| V-SET-85 | SSO IdP metadata round-trip | line 1737 |
| V-SET-86 | SCIM bearer cannot exceed `seat_limit` | line 1738 |
| V-SET-87 | IP allowlist CIDR validation | line 1739 |
| V-SET-88 | Magic-link 7-day TTL enforcement | line 1740 |
| V-SET-89 | `inviteUser` `SEAT_LIMIT_REACHED` 409 | line 1741 |
| §15.1 row | V-SET-80..84 → V-SET-80..89 | line 1759 |

### Front-matter + changelog

| Element | Lines |
|---|---|
| `version: 3.4` → `3.5` | line 3 |
| `status` updated | line 4 |
| `revised:` extended | line 10 |
| Changelog v3.5 entry | lines 1945-1958 |

---

## ADR-034 hygiene

Verified `02-SETTINGS-PRD.md` does **not** contain industry-specific terms (`Finish_Meat`, `Meat_Pct`, `kielbasa`, `pork`, `sausage`). Generic naming already in place pre-amendment. No ADR-034 leftovers to fix.

---

## Items applied / deferred

**Applied (12/12):**
- All 8 UPDATES (S-U1..S-U8) ✓
- All 4 ADDITIONS (S-A1..S-A4) ✓
- 6 new validators (V-SET-85..89 + V-SET-83 revision) ✓
- Front-matter + changelog ✓

**Deferred:** none. All gap-backlog items for module 02-SETTINGS are in PRD. Plan-side updates (S-PU1..S-PU6, T-02SETe-005b..e, T-02SETe-007a, T-02SETMod-* tasks) are out of scope for this amendment (they live in the plan, not the PRD).

---

## Coverage estimate (before → after)

| Surface | Before (v3.4) | After (v3.5) |
|---|---|---|
| Onboarding wizard (UX SET-001..SET-006) | 60% (off-by-one numbering, missing nav, missing gs1_prefix, missing first-WO KPI) | **100%** (S-U1..S-U4 closed) |
| Security policy schema vs UX SecurityScreen | 50% (only `session_timeout_minutes`, `mfa_requirement`, `password_min_length`) | **95%** (S-U5 closed; WebAuthn explicit Phase 3 deferral) |
| Identity / RBAC vs 4-role UX | 60% (10-role spec, no UI mapping; matrix UI undecided) | **95%** (S-U6: `role_categories` mapping + flat-perm UI decision) |
| Users invite flow | 70% (no TTL, no seat enforcement) | **100%** (S-U7 + S-U8) |
| SSO / SCIM / IP allowlist (UX has all three) | **0%** (entirely absent) | **90%** (S-A1+S-A2+S-A3 add tables + endpoints + middleware spec) |
| Modal contract | 0% (no PRD reference to `MODAL-SCHEMA.md`) | **100%** (S-A4: canonical contract + 10 patterns + backfilled IDs) |
| **Module total (weighted)** | **~70%** | **≥92%** |

---

## Blockers

None. All amendments are additive or non-breaking renames (one column rename `session_timeout_minutes` → `session_idle_timeout_minutes` requires migration in implementation phase; documented as part of S-U5 changelog entry).

Implementation-phase follow-ups (out of scope for this PRD amendment):
1. DB migration script for column rename + new columns (T-02SETe-005 extension).
2. Plan tasks S-PU1..S-PU6 (existing task scope expansions).
3. Plan tasks T-02SETe-005b..e (4 new auth/security tasks).
4. Plan tasks T-02SETe-007a (onboarding route guard middleware).
5. Plan tasks T-02SETMod-01..11 + 4 supporting (15 modal-consumption tasks).
6. Inventory cleanup T-Index-Clean-01 (move 6 mis-tagged entries — already done per gap-backlog D8 follow-up).
