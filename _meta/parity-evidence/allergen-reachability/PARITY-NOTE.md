# Allergen cascade reachability — parity evidence

Prototype anchor (1:1, unchanged from T-040):
  prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118 (allergen_cascade)
  prototypes/design/Monopilot Design System/npd/modals.jsx:389-428 (allergen_override_modal)

Reachability surfaces wired in this gap fix:
  1. FA-detail Technical tab slot — the reserved "Allergens loading…" placeholder
     is replaced by the server-rendered AllergenCascadeWidget fed with REAL,
     org-scoped data (public.fa_allergen_cascade) + server-resolved npd.allergen.write.
  2. Locale allergens sub-route /[locale]/(app)/(npd)/fa/[productCode]/allergens
     (sibling of docs/ + risks/), reusing the same widget + actions.

Structural parity: 3 cascade sections (Derived / Override deltas / FG-final
Contains+May-contain) + EU14 presence grid + Refresh + per-allergen Override → modal.
All five UI states captured: loading, empty, error, permission-denied, ready (+ optimistic refresh).
No widget/engine/action was rebuilt — only wired into the canonical locale tree.
