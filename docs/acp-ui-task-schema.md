# ACP UI Task Schema

Canonical, mandatory schema for every **T3-ui** atomic task in the ACP pipeline (`_meta/atomic-tasks/<module>/tasks/T-NNN.json`). Without this, autonomous ACP agents invent ad-hoc UI and the design system drifts across the 127-task backlog.

## 1. What this is

Every task labelled `T3-ui` in `pipeline_inputs.task_type` MUST contain a `## Prototype reference` section at the end of its `prompt` string. The section binds the production implementation to a specific JSX prototype, line-range, and translation-notes entry from `_meta/prototype-labels/prototype-index-<module>.json`.

## 2. Required `## Prototype reference` block

Append verbatim to the end of the `prompt` field (markdown string):

```
## Prototype reference
**Source:** `prototypes/design/Monopilot Design System/<module>/<file>.jsx:<start>-<end>`
**Label:** `<label from prototype-index>`
**Component type:** modal | form | table | page-layout | tabs | wizard

### Parity requirements (mandatory ACs)
The production implementation MUST match the prototype on three dimensions — add these as explicit ACs:
1. **Structural parity** — same sections, same field labels, same shadcn primitives invoked, same modals triggered from same actions.
2. **Visual parity** — same density tokens, same shadcn/Radix primitives (no drift to plain HTML), same layout proportions.
3. **Interaction parity** — same enable/disable rules, same loading/empty/error states, same keyboard focus order.

### Translation notes (from prototype-labels index)
- <copy each translation_notes[] item as a bullet>

### shadcn primitives to use
`Primitive1`, `Primitive2`, …
```

Additionally set `pipeline_inputs.prototype_match: true` and add a `pipeline_inputs.prototype_reference` object mirroring the source/lines/label/component_type for downstream tooling.

## 3. How to find the right prototype

1. Open `_meta/prototype-labels/prototype-index-<module>.json` and scan its `entries` array.
2. Filter by `data_domain` (Org, Permission, Integration, User, Spec, WO, Allergen, …) and `component_type` (page-layout, form, table, tabs, wizard, modal).
3. Pick the entry whose `ui_pattern` matches the screen intent (e.g. `list-with-actions`, `crud-form-with-validation`, `search-filter-list`, `detail-view`).
4. Read the actual JSX at the referenced `file:lines` to confirm structure.
5. Copy `translation_notes[]` and `shadcn_equivalent[]` from the entry into the task prompt — these are non-negotiable: they encode how prototype patterns convert to production Next.js/shadcn/Drizzle code.

## 4. Parity AC template

The three parity statements above MUST appear as acceptance criteria — either expanded into the `acceptance_criteria` array verbatim or referenced from a single AC line such as:

> Given the production page renders, when compared to `<file>:<lines>` (`<label>`), then it has structural, visual, and interaction parity per the three dimensions in the Prototype reference section — verified by an RTL snapshot test plus the parity checklist.

## 5. When no prototype exists

If `prototype-index-<module>.json` has no entry whose `data_domain` + `component_type` + `ui_pattern` matches the task, fall back as follows:

1. Pick the **closest visual pattern** entry (same `component_type`, neighbouring `data_domain`, or a sibling screen used as a structural template).
2. Add an explicit note in the Prototype reference block:
   > **No exact prototype** — closest visual pattern: `<label>` at `<file>:<lines>`. Build in the same structural style as this screen. <one-line description of which parts to re-use>.
3. Still include the Parity requirements ACs — parity is relative to the chosen pattern.
4. Set `pipeline_inputs.prototype_reference.is_exact_match: false`.

Never invent UI without referencing *some* prototype pattern. The closest-match rule guarantees structural consistency even where 1:1 fidelity is impossible (e.g. audit trails, diff viewers, migration logs).

## 6. Why this matters

ACP agents are autonomous: when a T3-ui task does not reference a prototype, the agent will generate a plausible-looking UI from scratch, and every agent invents a different one. With 127 UI tasks executed by parallel autonomous agents, that drift compounds into an inconsistent design system that no human has time to retrofit. 1:1 prototype fidelity — enforced at the task-prompt layer before the agent ever runs — is the only scalable way to ship a coherent product across the full backlog.
