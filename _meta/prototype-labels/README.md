# Prototype labels

This directory contains prototype-labeling artifacts produced by the
`prototype-labeling` skill (see `.claude/skills/prototype-labeling/SKILL.md`).

## Files

- `master-index.json` — canonical, deduped index across all modules. Every entry
  carries a synthetic `module` field. Where two modules use the same bare label
  (e.g. `delete_confirm_modal`), the master form is module-prefixed
  (`maintenance_delete_confirm_modal`, `planning_delete_confirm_modal`, …).
- `prototype-index-<module>.json` — per-module index, wrapper format:
  ```json
  {
    "module": "<module>",
    "generated_at": "<ISO 8601>",
    "generator": "<model or human>",
    "mode": "labeling",
    "entries": [ ... 13-field objects ... ]
  }
  ```
  Per-module entries use **bare semantic labels** (no module prefix) for
  human readability inside the file. Uniqueness is guaranteed by the
  `(module, label)` compound key — the wrapper's `module` field provides
  disambiguation. The same bare label may appear in multiple modules
  (e.g. `delete_confirm_modal` exists in maintenance, planning, reporting).
- `translation-notes-<module>.md` — human-readable companion to each per-module
  index.
- `_archive/` — vestigial files retained for historical context only. Tools
  must not consume `_archive/` content.

## depends_on_prototypes syntax

After audit-fix-2026-04-30, every entry uses one of these forms:

- `<file-path>#<componentExport>` — canonical reference to a component in a
  specific JSX file (e.g. `design/Monopilot Design System/finance/modals.jsx#StdCostCreateModal`).
- `<bare-or-prefixed-label>` — reference to another entry's master `label`.
- `primitive:<ComponentName>` — reference to a shadcn/Radix primitive
  (Modal, Field, Btn, Topbar, …); not a project prototype.
- `unresolved:<original-text>` — sentinel for refs that could not be
  auto-canonicalized; needs human review.

## Audit history

- 2026-04-30 — `_meta/audits/2026-04-30-prototype-labeling-integrity.md`
  identified BLOCKER + HIGH defects. Remediation log:
  `_meta/audits/2026-04-30-prototype-labeling-fix-report.md`.
