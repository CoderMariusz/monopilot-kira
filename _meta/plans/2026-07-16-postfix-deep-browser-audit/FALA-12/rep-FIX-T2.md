# FALA-12 / T2 — Cross-review fix report (rep-FIX-T2)

## [P1] Hidden `pull_cron` blocking legal export saves

**Root cause:** `d365-sync-config-form.client.tsx` validated the full payload including legacy `pull_cron` even after the inbound cron editor was removed. Invalid stored values (e.g. `*/x * * * *`) made `canSubmit` false with no visible field or error.

**Fix:** `d365-sync-config-form.client.tsx:73-78,229-250` — split validation into `visibleSyncConfigSchema` (batch/retry/push only). On save, pass through `config.pull_cron` unchanged without validating it. Removed unused cron-parser helpers that only served the hidden field.

**Test:** `sync/page.test.tsx` — `allows saving export settings when legacy pull_cron is invalid` would fail before fix (save button disabled / mutation never called with invalid hidden cron).

## [P1] Dead “Export queue cron” on connection screen

**Root cause:** Connection page showed an editable cron bound to `D365_POLL_CRON` env, but production never passes `saveD365Connection` — submit silently no-ops. Renaming labels did not remove the false affordance.

**Fix:**
- `d365-connection-form.client.tsx:447-470` — removed editable cron input; added `d365-connection-export-schedule-notice` with honest copy + link to sync config page.
- `d365-connection-form.client.tsx:127-140,311-323` — dropped `pollCron` from client validation; on save (tests/mocks only) pass `config.pollCron` unchanged.
- `page.tsx:232-248,355-370` — same notice in missing-prerequisites guard screen; pass `syncConfigHref` from locale.

**Test:** `export-only-ui.test.tsx` — `does not render an editable export-queue cron field` would find a cron textbox if reintroduced.

## [P1] Deterministically red `page.test.tsx` (prototype parity labels)

**Root cause:** Intentional export-only rename (`Polling & sync` → `Export queue`, `Pull cron schedule` → removed, `Integration enabled` → `Export integration enabled`) was not reflected in `page.test.tsx`.

**Fix:** `page.test.tsx:236-252,395` — updated section titles and field assertions to match new labels. **Why not weaken:** test still enforces prototype regions, shadcn primitives, action order, and modal trigger; only copy aligned with R15 export-only boundary.

| Before (test) | After (UI + test) |
|---|---|
| Section `Polling & sync` | `Export queue` |
| Textbox `Pull cron schedule` | No cron editor; notice + link to sync page |
| Switch `Integration enabled` | `Export integration enabled` |

## [P2] Playwright never reached D365 assertion

**Root cause:** `planning-dashboard.spec.ts:38-43` still expected PO/TO KPIs `data-not-live="true"` and disabled `createPo` — stale after PO/TO went live (migs 262/263). Spec failed before `planning-action-triggerD365` check.

**Fix:** `planning-dashboard.spec.ts:34-45` — PO/TO KPIs must not be `data-not-live`; `createPo`/`createTo` are links with hrefs; sequencing still disabled; `triggerD365` count 0.

## i18n (4 locales × 2 trees)

Added `notices.exportSchedule` + `notices.syncConfigLink` under `settings.integrations.d365.connection` in `i18n/{en,pl,ro,uk}.json` and `messages/{locale}/02-settings.json`.

## Consciously NOT touched

- `actions/d365/sync-config.ts` server validation of `pull_cron` — backend lane; UI no longer blocks saves on legacy bad values.
- `saveD365Connection` server action — does not exist in production route; connection save path remains test-only seam.
- D365 field-mapping / drift inbound copy — out of scope (reported in rep-T2).

## Tests added/updated (dry-run; orchestrator runs gate)

| Test | Would fail without fix |
|---|---|
| `sync/page.test.tsx` invalid `pull_cron` save | Save disabled or mutation not called |
| `page.test.tsx` prototype parity | Section/field label mismatch |
| `export-only-ui.test.tsx` connection cron | Cron textbox present |
| `planning-dashboard.spec.ts` | Fails on KPI/actions before D365 check |

## Out-of-scope (unchanged)

- `d365.drift.directionD365WinsHint` still mentions inbound import on drift resolution modal.
