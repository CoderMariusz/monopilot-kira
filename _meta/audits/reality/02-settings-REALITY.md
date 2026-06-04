# 02-settings — REALITY (ground-truth audit)

**Date:** 2026-06-04 · **Branch:** kira/long-run · **HEAD:** ~5534d0c1 · **Supabase:** @175
**Method:** read all 153 `T-NNN.json` + inspect real repo (Sonnet, evidence-cited). Audit-only. Supersedes 2026-06-02.

## Count reconciliation
- Task files: **153** · manifest: **153** · no phantom/missing.
- Reality: **IMPLEMENTED 95 · STUB 57 · MISSING 1 · PHANTOM 0 · BROKEN 0**.
- STATUS.md declared: 70 ✅ / 53 🔄 / 29 ⏸ / 1 ⬜.
- This audit is STRICT — "STUB" includes real-data pages lacking a **live Playwright parity screenshot** (~40 of the 57). The module is more functional than "57 stub" implies.

## Verdict groups
- **IMPLEMENTED (95):** all T1-schema (T-001..T-014, T-039, T-122), all T2-api backend (T-015..T-040, T-110, T-124..T-126, T-130), most settings UI pages with live Gate-5 screenshots (T-058..T-073/076/077/096..103/108..115/118..121/127/128), seeds (T-091..095/116/123), W4-W7 E2E parity specs (T-143..T-153 captured live 2026-06-03).
- **STUB (57):** onboarding step screens (T-041..046, real data, no parity), settings modal components (T-047..057/078, code + tests, no parity screenshot), infra/notification pages (T-071/104..107), T4 E2E specs authored-not-executed (T-080/081/085/086/088) or fixme-blocked (T-082/087), depth-light tests (T-089/090), over-stated T0 roots (T-135..142).
- **MISSING (1):** T-084 schema-wizard E2E spec (RTL covers schema suite 22/22).

## GENUINE gaps (not just missing screenshots) — fix candidates
1. **T-074 My Profile / T-075 My Notifications / T-129 Language Picker = 10-line REDIRECT STUBS** → all `redirect('/settings/company')`. STATUS marked 🔄 "real data wired" but pages don't render. **Real user-visible gap.**
2. **T-111 D365 Sync Config (SET-082) = fallback defaults, NOT real data** — no d365 sync-config table; saves would be lost. (Overlaps the in-flight D-1 D365 work under settings.)
3. **T-082 SAML + T-087 IP-allowlist E2E = permanently `test.fixme`** — security middleware (`proxy.ts` + `edge-middleware-policy.ts`) has NO executed integration coverage (needs mock SAML IdP + seeded IP/SCIM fixtures). Infra blocker.
4. **T-034 SCIM token write latent** — create-token-via-UI → SCIM-provision → verify-user never run live (unit bridge tested in T-083).
5. **T-089/T-090 test depth** — audit-log partition rotation (7y) + tenant_variations dept_resolver runtime are file-content/mock only, no live-DB assertion.

## Re-open bugs — VERIFIED FIXED
RBAC over-grant (mig 155 + SOD_EXCLUSIVE_PAIRS green), open-redirect (safeReturnTo same-origin), company-save (mig 175 + zod), dropdown category (Select fixed). All confirmed.

## STATUS.md corrections applied
- T-074, T-075, T-129: 🔄 → ⏸ (redirect stubs).
- T-111: → ⏸ (fallback defaults, no real data).
- Audit-date banner + reconciliation note added.

## Verdict
Sign-off **holds for the backend + live-verified UI (95 implemented)**, but carries **5 genuine gaps** (profile/notification redirect stubs the most user-visible). Recommended follow-up: build real My Profile / My Notifications / Language Picker (T-074/075/129), wire T-111 D365 sync-config persistence (with the D-1 D365 work), capture pending parity screenshots for the ~40 evidence-only stubs.
