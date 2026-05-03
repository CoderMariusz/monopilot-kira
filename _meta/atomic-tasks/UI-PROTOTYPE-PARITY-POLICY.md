# UI Prototype Parity Policy

Applies to T3-ui tasks and UI-flow T4-wiring-test tasks across MonoPilot Kira.

## Required source declaration

Every UI task must declare one of:

1. Exact prototype source: `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>`; or
2. Spec-driven source: UX/PRD section plus the nearest reusable prototype pattern.

## Required parity evidence

Closeout must include evidence for:

- structural parity: same major regions, forms, modals, tables, action groups;
- visual parity: same density, spacing, component family, semantic states;
- interaction parity: same validation, disabled/loading/empty/error/permission states;
- screenshots or screenshot artifacts;
- Playwright trace/video/artifacts where applicable;
- axe/accessibility result or documented blocker;
- deviations from prototype/UX with reason.

## Required label/index behavior

Use `_meta/prototype-labels/prototype-index-*.json` and `master-index.json` as canonical traceability. If a JSX source contains `data-prototype-label`, tests may use it; otherwise tests must use role/text/structure selectors and the index path/line range as evidence.

## Legacy/canonical language

Tasks must apply module red-lines, e.g. FG not FA except legacy alias, D365 optional only, and approved factory release model as source of truth.
