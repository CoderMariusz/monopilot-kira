# Prototype reuse for T3 UI tasks

**Status: ACTIVE for projects with stable prototype indexes (e.g. MonoPilot-kira `_meta/prototype-labels/`).** When indexes do not exist, this pattern is deferred — write T3 tasks blank.

## Quick rule for SKILL.md Step 7

If `<root_path>/_meta/prototype-labels/master-index.json` exists:

1. Look up the matching prototype entry by `component_type` + `data_domain` + `interaction`.
2. Add the prototype path to `pipeline_inputs.scope_files` tagged `[ref]` (read-only reference).
3. Copy relevant snippets from `_meta/prototype-labels/translation-notes-<module>.md` into `pipeline_inputs.details` (shadcn/Radix/RHF-Zod gotchas, known bugs, estimated translation time).
4. Production target file goes under `scope_files` as `[create]` or `[modify]`.
5. Do NOT paste full prototype JSX into the prompt — reference path + line ranges only.

If no index → skip prototype reuse, write the T3 from PRD requirements directly.

## Context

Some projects carry a large JSX prototype library (e.g., MonoPilot Design System with ~48k lines across ~15 modules: ~200 modals + forms + tables). A naive "agent reads prototype file + writes production" approach would overflow context and waste tokens, because prototypes carry ~30-40% delta vs. production (window globals vs. Radix imports, mock data vs. Drizzle queries, `useState` vs. RHF + Zod, hardcoded labels vs. i18n, no RLS/audit/outbox awareness).

## Proposed strategy (not yet enabled)

1. **Haiku pre-pass labels prototypes** across 5 dimensions: `component_type`, `ui_pattern`, `data_domain`, `interaction`, `complexity`. Haiku is ~60× cheaper than Opus for rote extraction.
2. Index persisted as `_meta/prototype-labels/master-index.json` with per-module JSON + translation-notes markdown.
3. **T3 task dispatch hook** queries the index by feature AC (fuzzy match on component_type + data_domain + interaction). If match confidence >70% → prepend JSX snippet + translation checklist + shadcn equivalents to agent context (~7-15k overhead).
4. Agent **translates** (not copies) the snippet to the production stack.
5. A follow-up T4 task wires the translated component to the Server Action + DB + E2E test, same as any T4.

## Expected speedup

Realistic: ~50% wall-clock reduction for T3 tasks that have a prototype match (30-45 min vs. 60-90 min). Not 100% because translation is still real work.

## When to defer

Skip this pattern if any of:

- `_meta/prototype-labels/master-index.json` does not exist for the project,
- prototypes are still churning weekly,
- T3 volume in the wave is low (<5 matched components),
- the index is stale relative to current PRD (outdated translation-notes).

## If re-enabled

Key artifacts to (re-)create:

- **Haiku prompt template** — enforces 5-dimension taxonomy, JSON schema, cross-references to known bugs
- **JSON schema** for prototype entries (label, file, lines, component_type, ui_pattern, data_domain, interaction, complexity, depends_on_prototypes, translation_notes, shadcn_equivalent, known_bugs, estimated_translation_time_min)
- **Pre-hook** that runs at T3 dispatch time, fetches snippet + notes, prepends to context
- **Pilot** on one module (e.g., warehouse — a typical reference module with well-understood patterns) before 15-module rollout
- **Maintenance policy** — re-run Haiku for a single module when its prototypes change, then flag dependent T3 tasks for manual review

Keep the prototype-linker as a **separate skill**, not inline in `prd-decompose-hybrid`. Separation lets the label index be updated without regenerating the backlog.
