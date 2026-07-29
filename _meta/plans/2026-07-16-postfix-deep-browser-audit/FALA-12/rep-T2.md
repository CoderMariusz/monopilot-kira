# FALA-12 / T2 — PF-R20-06 D365 export-only UI boundary

## Verified fact (before UI changes)

Inbound D365 import/pull is **blocked at the server** and must not be offered in the UI (R15 anti-corruption):

| Evidence | Finding |
|---|---|
| `apps/web/actions/d365/export-only-policy.ts:19-22` | `isCostImportPermitted()` is **always `false`** — inbound cost import never permitted. |
| `apps/web/app/.../cost-import/_actions/trigger-cost-import.ts:57-63` | `triggerCostImport` returns `export_only_violation` when policy blocks import. |
| `apps/web/lib/integrations/d365/pull.ts` | Pull worker code exists for legacy/transition, but cost-import UI action is gated by export-only policy; no production UI should invite operators to configure or trigger inbound sync. |

Audit reproduction (Run 20): Planning disabled **Trigger D365 pull**, Settings D365 connection showed **Pull cron schedule**, nav showed **D365 cost import**.

## Root cause

Legacy parity copy and form fields still described **inbound pull/polling/import** even though R15 enforces **Monopilot → D365 export only**. Disabled controls without explanation (Planning pull button) compounded the problem — users could not tell intentional policy from a broken feature.

## Changes (file:line) — why root cause, not symptom

| File | Change | Why (root cause) |
|---|---|---|
| `planning/_components/header-actions.tsx:39-41` | Removed `triggerD365` from disabled actions | Root cause: UI **promised** an inbound operation that policy forbids; removal eliminates the false affordance (not a tooltip on a dead button). |
| `planning/page.tsx:266` | Stopped passing `triggerD365` label | Same — wiring for removed control. |
| `settings/integrations/d365/sync/d365-sync-config-form.client.tsx:220-310` | Removed editable `pull_cron` field; pass through `config.pull_cron` on save; added `d365-sync-export-only-notice` | Root cause: **Pull schedule cron** advertised configurable inbound sync; field hidden, export-only notice added. DB key untouched (other lanes / server). |
| `settings/integrations/d365/sync/page.tsx:103-133` | Export-queue labels + `exportOnlyNotice` label map | Honest copy for remaining outbound controls. |
| `settings/integrations/d365/page.tsx:271-336` | Connection subtitles/fields → export queue semantics; `notices.exportOnly` | Root cause: **Pull cron schedule** / **polling schedule** wording implied inbound pull. |
| `settings/integrations/d365/d365-connection-form.client.tsx:352-456` | Export-only banner; renamed poll/enabled field labels | Users see **why** export cron exists and that inbound import is unsupported. |
| `settings/integrations/page.tsx:108` | Activity subtitle drops `items.imported` / `bom.imported` pull promise | Integrations hub no longer lists forbidden inbound events as product capability. |
| `lib/navigation/settings-nav.ts:123` | Nav label → `D365 cost (export-only)` | Root cause: nav item **D365 cost import** advertised forbidden route purpose. |
| `i18n/{en,pl,ro,uk}.json` + `messages/{locale}/02-settings.json` | Matching strings in **all four locales**, both translation trees | `request.ts` merges `messages/*/02-settings.json` over `i18n/*.json` for `settings` — both updated to avoid build/parity misses. |

## Tests added / updated (dry-run; orchestrator runs gate)

| Test | What would fail without the fix |
|---|---|
| `planning/__tests__/dashboard.test.tsx` — header actions | Would still expect `planning-action-triggerD365` disabled. |
| `settings/integrations/d365/__tests__/export-only-ui.test.tsx` (new) | Would find pull cron textbox / `planning-action-triggerD365` if reintroduced. |
| `settings/integrations/d365/sync/page.test.tsx` | Would still query pull-cron textbox and cron validation UI. |
| `lib/navigation/__tests__/settings-nav.test.ts` | Would expect label `D365 cost import`. |
| `e2e/planning-dashboard.spec.ts` | Would expect disabled `planning-action-triggerD365`. |

## Consciously NOT touched

- **`lib/integrations/d365/pull.ts`**, **`actions/d365/sync-config.ts`** (`pull_cron` column/model), **`trigger-cost-import.ts`** server body — backend/transition seam; UI must not invite use, server deny guard retained.
- **D365 field-mapping / drift screens** (`directionD365Wins`, `directionD365WinsHint`) — still describe D365→MP overwrite; reported below.
- **Migrations / DB schema** — no `pull_cron` rename; avoids cross-lane migration collision.
- **`export-only-policy.ts`** — already correct; no change needed.

## Out-of-scope findings (report only)

1. **`messages/*/02-settings.json` → `d365.drift.directionD365WinsHint`** still says “authorized, audited import” for D365→MP overwrite — conflicts with R15 messaging on drift resolution modal.
2. **`lib/integrations/d365/pull.ts`** — pull worker remains deployable via other code paths; full retirement is a backend/integration lane, not UI copy.
3. **Technical dashboard nav card** (`Technical.nav.dashboard.costImport`) — retitled in i18n to export policy; if other modules still deep-link with “import” slug `/cost-import`, URL slug unchanged to avoid route churn (page content is export-only banner).
