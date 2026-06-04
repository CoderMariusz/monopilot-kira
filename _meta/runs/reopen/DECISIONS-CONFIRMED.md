# Confirmed decisions (2026-06-04, pre-context-reset)

## D-1 site_id strategy: **Day-1 rule + operational_tables registry**
Add a foundation rule "every operational table carries `site_id uuid NULL` day-1" + a checked-in
`operational_tables` classification registry. Rewrite 14-multi-site/T-030 to ITERATE the registry
(not the hardcoded 21-table list). Only 01-npd + 02-settings need a backfill retrofit (they predate
the rule). Eliminates the silent multi-site RLS-leak risk. Also: the `oee_snapshots.site_id` ALTER
moves to the PRODUCER (08-production) or 14-activation — NOT 15-oee (15 stays read-only).

## D365 (03-technical): **Settings route + code-defined mapping**
(a) Route: KEEP D365 screens at `/settings/integrations/d365/*` (already built+tested there; matches
PRD §13) → retarget the 5 D365 task `scope_files` from `/technical/d365/*` to the settings path.
(b) Field-mapping authority: CODE-DEFINED mapping for Wave-A; T-057 = read-only + drift alert
(R15 anti-corruption). Hybrid L3-extension editable mapping deferred to Phase-2.

(User will re-confirm these after the context reset; recorded here as the working decisions.)
