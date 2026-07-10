# Wave 18 — LOTO enforcement + calibration e-sign (summary)

## Feature 1 — LOTO enforcement gate on MWO transitions (N-39)

**Problem:** Schema mandated dual-actor LOTO on `equipment.requires_loto` + `mwo_loto_checklists`, but `transitionMwo` never read them — MWOs could start/complete with zero LOTO enforcement.

**Implemented:**
- `verifyMwoLotoLockout` — `mnt.loto.apply`, `signEvent` intent `mnt.loto.lockout`, sets `zero_energy_verified_by` + `verified_at`, emits `maintenance.loto.applied`.
- `verifyMwoLotoRelease` — `mnt.loto.clear`, `signEvent` intent `mnt.loto.release`, sets `released_by` + `released_at`, app-layer `loto_same_actor` when release signer equals lockout verifier (DB mig 220 backstop), emits `maintenance.loto.released`.
- `transitionMwo` gate inside the same `withOrgContext` txn (validate before write): equipment with `requires_loto=true` blocks `in_progress` without lockout verify and `completed` without release verify (`loto_not_verified`).

**Tests:** `mwo-actions.test.ts` — lockout gate, release gate, distinct-actor rejection, non-LOTO unchanged, e-sign + outbox on lockout/release.

**Permissions:** `mnt.loto.apply` / `mnt.loto.clear` already seeded (migration 202); no new SQL migration.

---

## Feature 2 — Calibration recording e-sign (N-40)

**Problem:** `recordCalibration` wrote ISO/NIST records with session + `mnt.calib.record` only — no PIN, no `e_sign_log`.

**Implemented:**
- `recordCalibration` requires `signature: { password, nonce? }` (zod).
- `signEvent` intent `mnt.calib.record` runs **before** insert in the same txn; PIN failure → `esign_failed`, no row written.
- `certificate_sha256` stores the e-sign `subjectHash` on the calibration record.
- W16 behaviors preserved: OUT_OF_SPEC/FAIL deactivation, future-date reject, inactive-instrument active-check.

**UI:** Record calibration modal collects account password/PIN; maps `esign_failed` inline.

**Tests:** `calibration-actions.test.ts` — esign_failed + no insert; valid PIN records + `certificate_sha256`; OUT_OF_SPEC/future-date/active-check still hold.

**Permissions:** `mnt.calib.record` already seeded (migration 202); no new SQL migration.

---

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter web exec tsc --noEmit` | exit 0 |
| `pnpm --filter web run build` | exit 0 |
| Vitest (mwo-actions + calibration-actions) | 18 passed |
