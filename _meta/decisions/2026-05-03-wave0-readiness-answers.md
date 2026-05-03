# Wave 0 Readiness Decisions — User Answers

Date: 2026-05-03
Repo: monopilot-kira
Purpose: lock product/architecture answers needed to harden modules 00-03 atomic tasks to 95%+ ACP implementation readiness.

## Locked decisions

1. RLS/business scope column: use `org_id` as canonical business scope. Do not use `or_id`; intended answer is `org_id`. Tenant/data-plane concerns may exist above org scope, but app/business tables use `org_id`.
2. Event namespace/domain naming: change legacy/internal event/domain naming from `fa.*` toward `fg.*` / FG canonical. `FA` remains only a legacy compatibility alias where needed.
3. Shared BOM SSOT: yes, define a foundation-level shared BOM SSOT skeleton/contract in 00-FOUNDATION.
4. factory_spec/internal_product_spec: yes, define a foundation-level contract and Technical implementation contract.
5. D365 foundation scope: yes, include a D365 integration posture contract/scaffold. D365 remains optional import/export/integration only, never source of truth.
6. RLS implementation: follow recommended safe non-spoofable org-context pattern; do not rely on unsafe direct custom GUC SET or LEAKPROOF unless explicitly justified.
7. legacy convertBriefToFa: ok to keep only as compatibility wrapper; canonical flow is Brief -> NPD Project.
8. Product/FG code timing: FG/Product code is chosen at G3, not during Brief completion.
9. Trial/Pilot/Handoff/Packaging: ok; must be represented in NPD flow/evidence.
10. Sensory in NPD approval: ok to follow recommendation; NPD can treat sensory as N/A/not_required unless org policy requires Technical sensory read model.
11. D365 export timing: ok to follow recommendation; D365 export is not factory release and should not precede factory-use approval unless explicitly policy-enabled as non-usable preload/export.
12. Settings Quality placeholder permission: use existing flag permission, not new `settings.quality.*`. Use `settings.flags.edit` / existing Settings flag permission model.
13. Global Import/Export Phase 1: yes, include backend jobs/capability registry, not just shell.
14. Pending Invitations Phase 1: yes, include backend lifecycle list/resend/revoke.
15. Split T-122: ok; split authorization policies into schema/seed, helpers/actions/preflight, and UI.
16. Root settings/import-export.jsx canonical policy: ok; use final stated canonical policy from Settings source-of-truth and mark non-canonical roots clearly.
17. Release model ownership: ok; NPD T-097 is canonical release model, Technical T-081 is adapter only.
18. Initial factory_spec after NPD Builder: `in_review`.
19. FG/WIP after NPD Builder: visible to Planning/Technical as pending, but not factory-usable until Technical approval.
20. G4 NPD approval and Technical factory_spec/BOM approval: ok; two gates. G4 closes NPD, Technical approval unlocks factory use.
21. Closed_Technical department closure: ok; means Technical supplied/closed NPD department data, not factory_spec approval.
22. NCR lifecycle owner: ok; Quality owns lifecycle, Technical produces `non_conformance.requested`.
23. Lab results ownership: ok; Quality-owned read model, Technical consumes; Technical write only through Quality permission/service bridge if present.
24. Supplier specs: yes, Phase 1 includes supplier_specs upload/view/review.
25. Sensory: add Technical-owned sensory task/contract.
26. Technical no-prototype screens: yes, if in MVP, create/prototype/spec-driven tasks; do not leave no-prototype blockers unresolved.
27. ACP task shape: do not invent cross-module dependency semantics. Inspect the real `agent-control-plane` project for actual task shape/import behavior and make all atomic tasks match real ACP expectations with rich prompts. The user's preference: spend ~2k tokens in prompt for correct implementation rather than cheap vague tasks and rework.
28. Priority convention: follow the skill convention; lower priority value is picked sooner.
29. Atomic task type: yes, enforce exactly one task type per atomic task; split mixed tasks.
30. UI evidence: require both screenshots/artifacts and Playwright traces/artifacts where applicable.

## Consequence

Run Wave 0 hardening before implementation:
- patch PRD/UX/coverage/task JSONs for 00/01/02/03;
- inspect ACP real schema/examples and adjust tasks accordingly;
- prefer longer, self-contained prompts with exact implementation details, dependencies, files, tests, and closeout evidence;
- validate JSON/manifests and readiness rules before import/promotion.
