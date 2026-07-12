# NPD consolidation — Round 2 (Fable refinement of Codex R1)

Round of the 3× brainstorm: **R1 Codex → R2 Fable (this doc) → R3 Codex validation**.
Base: `CONSOLIDATION-R1-CODEX.md`. R1 is accepted as the spine; this doc (a) rules on
R1's 7 open questions, (b) sharpens the ordering into our wave pipeline, (c) flags the
one place the "NPD end-to-end" goal can be blocked by hidden scope.

---

## A. Decisions on R1's 7 questions (these are now locked)

1. **Unlinked legacy FGs → indefinitely read-only.** No forced migration, no auto-adoption.
   `/fg/[code]` with no linked project stays a read-only legacy detail behind the resolver.
   "Adopt into a project" is an explicit owner-initiated action, built only if/when asked.
   *Why:* history is product-bound and correct where it is; inventing a project wrapper for
   dead FGs rewrites nothing useful and risks fake gate/signature state.

2. **D365 reference cache stays informational (read-only); export is anti-corruption only.**
   Do not remove inbound D365 connectivity in this effort (out of scope), but firewall it:
   the cache and any export result may **never** write canonical MES/release state. Export
   produces an artifact + audit row, nothing more.

3. **Risks: persistent project-level drawer (read-only summary) + full editing under Approval.**
   Because an open High/V18 risk blocks gates from any stage, the *blocker* must be visible
   everywhere; the *editing surface* lives in Approval. One evaluator feeds both (see §B).

4. **One product → many projects: no linkage table now.** Default identity is
   `npd_projects.id` + `npd_projects.product_code`. The resolver returns **ambiguity**, not a
   newest-project guess → chooser UI. Build the additive `npd_project_product_links` table
   **only if** the Phase-0 live inventory finds a real 1-product-many-active-projects case.
   No speculative schema.

5. **Legacy product fields — editable vs read-only during pipeline:**
   - *Editable via pipeline actions* (they ARE the workflow): formulation/recipe, process/WIP,
     ProdDetail, compliance docs, allergen overrides, risk records.
   - *Read-only historical once G3-linked*: product master identity — `product_code`, base/output
     UoM, category, item-master attributes. Changed only through the item master, never the
     pipeline. *Why:* these are SSOT on `items` (product is a view, mig 359); the pipeline consumes
     them, it doesn't own them.

6. **Initial BOM: Recipe = draft/preview, Handoff = authoritative release.** One SSOT
   (`bom_headers`), draft-first ordering (header → lines → supersede → activate). Recipe
   materializes/updates a **draft** BOM for preview; Handoff owns the transition to active/released.
   *Why:* prevents the double-materialization corruption risk R1 flags (Recipe and Handoff both
   writing an authoritative BOM).

7. **Sensory stays in the rail as a read-only Technical status panel.** It's a real stage; writes
   remain owned by Technical. Don't delete it, don't let pipeline write it.

---

## B. The two backend additions are the whole ballgame

R1 is right that this is mostly a **UI move + link repoint**, because the server actions are
already product-code/project-scoped and reusable as-is. Only two things are genuinely *new code*,
and everything else depends on them:

1. **`resolveProjectProduct` / `resolveProductProject`** — the org-scoped, ambiguity-returning
   resolver. Every redirect, every pipeline page that calls a product-code action, and every
   compatibility route goes through it. **Nothing moves before this lands and is tested** (incl.
   the ambiguity/chooser path and the org-scope/not-found path — a redirect must never leak
   cross-org existence).

2. **One server-side V01–V08 evaluator** — consumed by Recipe panels, Approval, the gate
   blocker check, and the export preflight. Today this logic is scattered/duplicated across the
   department screens. Until it's single-sourced, moving the UI just relocates the duplication.
   **This lands before any redirect rollout.**

If these two are solid, the rest (mount FormulationWipPanel in Recipe, mount compliance/risk/
allergen panels in Approval, repoint nav, redirect `/fg`+`/npd`, delete last) is low-risk
mechanical work our wave pipeline already does well.

---

## C. The one thing that can silently block the goal: D365 Handoff is a BUILD GAP

R1 correctly flags this and it's the biggest risk to "NPD end-to-end without problems":
the D365 export modal is a **placeholder** — there is no working builder. So Phase 4 is not a
*move*, it's a *build*. To keep the end-to-end goal unblocked:

- **Decouple factory-release from D365 export.** Handoff's job for the E2E flow is the explicit
  **factory release** (release event + usable BOM version downstream). That already exists and is
  what makes the pilot WO schedulable. The full-flow acceptance (project → … → schedulable WO →
  released) does **not** depend on D365.
- **Ship D365 export as a separate follow-on track (C6)**, gated on its own artifact/audit
  acceptance. If it's not ready, Handoff still completes; the D365 panel shows "export not yet
  available" rather than a dead CTA. *Don't let a missing exporter block declaring NPD end-to-end
  working.*

---

## D. Sharpened ordering (maps R1's phases onto our Composer→Codex→Fable waves)

Each is one wave = one worktree, one Composer impl, one Codex cross-review, Fable arbitrate,
PREPARE any SQL, tsc/build/tests, deploy, prod E2E. Serial merge; no wave combines UI-move +
redirect + delete.

| Wave | R1 phase | Scope | Gate before next |
|---|---|---|---|
| **P0** | Phase 0 | Live inventory of FG-016 / NPD-013/14/15 (the preflight report), resolver + ambiguity tests, route/link fixture, V01–V08 behavior matrix, D365 gap report | Every named record classified; existing E2E green; **no writes** |
| **E1** | Phase 1 | Recipe owns process/WIP/ProdDetail (**FormulationWipPanel mount — already done in D3/B5**) + draft-BOM preview | Add component/assign process/create-WIP in Recipe survives reload; old `/fg?tab=production` shows same rows |
| **E2** | Phase 2 | Single V01–V08 evaluator wired to Recipe/Approval/Gate/Handoff; extend `gate-checklist-auto-satisfy`; legacy dept-close read-only | Each V-check has a failing fixture; FAIL blocks gate server-side; no UI-tamper bypass |
| **E3** | Phase 3 | Approval: mount compliance docs + risk/V18 + allergen cascade & sign-off; repoint child-route links | Upload/version/download works from Approval; derived allergens read-only; override additive+audited; High risk blocks |
| **E4** | Phase 4 | Handoff **factory release** solid; D365 export panel as follow-on (C6) — informational if builder absent | Release event + downstream BOM usable; export (if built) records artifact, never mutates canonical |
| **E5** | Phase 5 | Remove `/npd`+`/fg` from nav; repoint every internal link; deploy temporary redirects/resolver pages | `rg` finds no canonical nav to `/npd`/`/fg`; bookmarks land safely; ambiguity never auto-picks |
| **E6** | Phase 6 | Retire department close/reopen from UI; gate checklist is sole active workflow; keep columns+history | New project completes with no dept-close; existing projects still readable/advanceable |
| **E7** | Phase 7 | Delete dead view code — **only after 2 soak releases** | `rg` proves no imports from deleted components; full NPD lifecycle E2E green on merged tree + preview |

Hard sequencing: **P0 → resolver+V-evaluator (E2 backend parts can start once P0 resolver lands)
→ everything else.** Redirects (E5) never ship before the resolver (P0) and the panels they point
into (E1/E3) exist. Deletion (E7) is always last, gated on soak.

---

## E. Where this differs from / adds to R1

- R1 left 7 questions open → **all now decided** (§A).
- Made explicit that **the resolver + single evaluator are the only real new code**, and are hard
  predecessors for the redirect work (§B) — so the wave order is dependency-driven, not cosmetic.
- **Decoupled the end-to-end goal from the D365 build gap** (§C): factory-release carries the flow;
  D365 export is a follow-on that must not block "NPD works end-to-end."
- Everything else in R1 (no destructive migration; product-as-view; temporary redirects; read-only
  legacy fallback; combined read-only history; draft-first BOM; org-scoped resolver) is **adopted
  unchanged**.

---

## F. For R3 (Codex) to validate

1. Do §A's 7 decisions hold against the live schema/actions, or does any one force a migration or
   a linkage table now?
2. Is the resolver truly a hard predecessor for **every** redirect, or are there `/fg` links that
   can move without it?
3. Is §C right that factory-release (not D365 export) is sufficient for the E2E "schedulable WO →
   released" acceptance — i.e. does any downstream consumer hard-depend on a D365 artifact?
4. Does the wave order (P0 → resolver/evaluator → E1/E3 → E5 redirects → E6 → E7 delete) have a
   hidden cycle — any panel Approval needs that itself imports a soon-deleted `/fg` component?
5. Given the live inventory of FG-016/NPD-013/14/15, is a single-vote per-record remediation enough,
   or is one of them in a state (product without project at/after G3) that needs a repair step
   before P0 can declare "classified"?
