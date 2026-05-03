# Next Modules Decisions — Warehouse / Scanner / Planning / Production

Date: 2026-05-03
Repo: monopilot-kira
Purpose: lock PO decisions needed for Wave Next-3 hardening and 07/08 readiness.

## Warehouse decisions

1. WH-008 destination: destination is required.
2. WH-109 Shelf Life Rules CRUD: Phase 1.
3. M-12 Use_by Block Override: existing `use_by_override_modal` is canonical; PRD stale NO-PROTOTYPE wording should be corrected.
4. WH-015 / WH-017: make these first-class labels/surfaces rather than only indirect flow references.
5. If UI/prototype is rebuilt, add literal `data-prototype-label` / equivalent root markers in JSX.

## Scanner decisions

1. Scanner label naming: use canonical scanner-prefixed labels where there is ambiguity, e.g. `scanner_settings_screen`, `scanner_devices_screen`.
2. Done screens: make canonical first-class labels/screens where they are user-visible completion states.
3. `PinSetupScreen`, `PinChangeScreen`, and `CameraScanner`: first-class MVP labels/surfaces.
4. Scanner UI closeout requires mobile viewport evidence, including screenshots/artifacts at 390x844 where applicable.
5. Scanner tasks should carry explicit cross-module dependencies for Warehouse / Planning / Production / Quality where the flow relies on those contracts.

## Planning / Production / 07 / 08 decisions

1. Continue with Wave Next-3 hardening for 04 Planning Basic, 05 Warehouse, 06 Scanner P1.
2. Also audit/harden module 07 Planning Ext and full 08 Production so the production-side flow is ready.
3. After hardening, run review and return with readiness verdict.
4. Re-check whether 01/02/03 have full UI/prototype coverage or whether Opus/Sonnet-style labeling/prototype-building work is still needed.

## Execution instruction

Apply this as docs/meta/task/prototype-index readiness hardening only unless explicitly asked for application implementation. Keep tasks ACP-shaped and rich/self-contained. Do not queue implementation tasks yet.
