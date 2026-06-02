---
description: "Phase 3 — audit/update/add/remove skills against consolidated reality; refresh MON-INDEX.md"
argument-hint: "[skill-name | all]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit
model: opus
---

# /kira:skills-overhaul — Phase 3 Skills Overhaul

Target: `$1` (a skill name or `all`). Prereq: Phases 0–2 done (reality + plan exist).

Make the 18 skills in `.claude/skills/` match reality and the new workflow, write
the missing ones, and delete dead weight. Skills are the project's real config
(there is no root CLAUDE.md by convention) — keep them authoritative.

## Procedure

1. **Inventory + drift check.** Read `MON-INDEX.md` and every `SKILL.md`. For
   each, check its claims against Phase-0 reality and Phase-1 graph (e.g. canonical
   owners, contract task IDs in `cross_module_dependencies`, file paths, commands).
   Flag stale statements. Fan out with Sonnet for the read-heavy drift scan; you
   (Opus) decide edits — `prd-decompose-hybrid` quality requires Opus judgment.

2. **Update stale skills.** Fix wrong task IDs, paths, commands, and invariants.
   Bump `version` + add a `Version history` line noting the change.

3. **Add missing skills** where domain density now justifies a dedicated skill
   (currently layer-only): candidates `MON-domain-npd` (01), `MON-domain-settings`
   (02), `MON-domain-technical` (03), `MON-domain-reporting` (12),
   `MON-domain-multi-site` (14), `MON-domain-scanner` (06). Create only those the
   reality audit shows are genuinely dense; match the existing SKILL.md frontmatter
   (`name`, `description`, `version`, `model`, optional `canonical_spec`) and house
   style. Add a workflow skill if the loop needs one (e.g. `MON-codex-review` codifying Gate 4).

4. **Remove dead/obsolete skills.** The broken `kira-hq-*` symlinks point to a
   retired ACP machine path (`/Users/.../.kira-hq/...`) — propose removal (they
   resolve to nothing off that machine). Do NOT delete anything still referenced
   by `MON-INDEX.md` or task `skills[]` without first removing the references.
   **List deletions for human confirmation before `git rm`.**

5. **Refresh `MON-INDEX.md`.** Update the inventory table (count, lines, model,
   tier), routing tables, reading-order recipes, and the cross-link graph. Keep
   folder name == frontmatter `name`.

## Gate (STOP here)

Print the skills diff: `updated[] / added[] / removed-proposed[]` with one-line
rationale each, and the new inventory count. Get explicit human confirmation
before any deletion. Then wait for "go" to start Phase 4.
