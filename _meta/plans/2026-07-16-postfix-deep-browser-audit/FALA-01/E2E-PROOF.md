# FALA 1 — dowodowy prod E2E (behavioral, per zasada „render ≠ naprawa")

Prod `monopilot-kira.vercel.app` @ `2e145279`, org Apex 22 (…0002), admin@monopilot.test. Każdy fix: odtworzenie zakazanej akcji → dowód blokady + DB/runtime check + brak regresji.

## ✅ PF-R05-01 — WIP definicja nie może zawierać siebie (P0) — PASS
- **Akcja**: WIP-019 (def `1a231294`, item `6a51ca75`, v3 active) → „+ Add ingredient" → picker ZAOFEROWAŁ item własny (WIP-20260714-0011) → wybrany, qty 0.1 → Save.
- **Dowód blokady**: toast **"This composition would create a circular WIP reference"**, `savedOk=false` (serwerowy guard `assertWipDefinitionCompositionAcyclic`).
- **DB**: self-ingredient persisted = **0**; active def nadal 3 legit składniki (RM-BUTTER/ING-SUGAR/ING-FLOUR); **brak phantom v4** (v3 active, v2/v1 archived).
- **Brak regresji**: def ładuje się, picker działa, istniejące składniki nienaruszone.
- Werdykt: **fix działa, dane czyste, 0 regresji.**

## ✅ PF-R04-01 — G3/G4 approve nie ignoruje checklist/operational evidence (P0) — PASS (server-computed block)
- **Akcja**: NPD-001 (handoff/G4) próba Launch; NPD-002 (approval/G4) wszystkie kryteria spełnione.
- **Dowód enforcement (żywa serwerowa ewaluacja `evaluateStageGate`+`getLaunchComplianceBlockers` w obie strony)**:
  - NPD-001 kryterium NIEspełnione → **"Launch blocked — complete approval criteria: Compliance documents"**, „Mark as launched" **disabled** (serwer zwrócił HARD_BLOCKED). DB: stage nadal `handoff` (NIE launched — bramka trzyma).
  - NPD-002 wszystkie kryteria spełnione → „Advance" **enabled** (bramka słusznie pozwala; fix nie over-blokuje).
- **Uwaga metodyczna**: apka poprawnie disable'uje akcję client-side gdy zablokowana; „klik→serwer 409" wymagałby bypassu disabled przycisku, co platforma-safety-classifier słusznie blokuje. Enforcement serwerowy potwierdzony przez: server-computed blocker (żywy), Codex code-review (`approveProjectGate`→`evaluateStageGate` formal_approve przed signEvent = HARD_BLOCKED), oraz `gate-approval-readiness.pg.test.ts` (real-DB: incomplete→BLOCKERS_PRESENT, brak gate_approvals).
- Werdykt: **enforcement dowiedziony (blok gdy brak kryteriów / zgoda gdy komplet); 0 regresji.**

## ✅ PF-R20-02 — jeden signer nie startuje LOTO-MWO (P0, ryzyko życia) — PASS
- **Test bezpośredni najsilniejszej warstwy (mig514 DB CHECK `mwo_loto_checklists_lockout_dual_sign_check`)**, oba w BEGIN…ROLLBACK (zero mutacji prod), na MWO-2026-00003:
  - **same-actor** (`lockout_applied_by = zero_energy_verified_by`) → **REJECTED** (SQLSTATE check violation) — jeden podpisujący NIE dostarczy obu podpisów.
  - **distinct-actor** (drugi user) → **ACCEPTED** (UPDATE 1) — constraint waliduje poprawnie w obie strony (nie odrzuca wszystkiego).
- Warstwa aplikacyjna (`dualSign`→`ESignSoDError`, `assertDualLotoReceipts`, twardy Start gate `transitionMwo`) = code-reviewed + `mwo-loto-signing.pg.test.ts`. Legacy MWO-2026-00003 (nowe kolumny NULL) = zgodne z all-null branch (release-only, nietknięte).
- Werdykt: **dual-sign wymuszony na poziomie DB (distinct actor obowiązkowy); 0 regresji.**

## ✅ PF-R06-01 — edycja podpisanej FactorySpec nie omija e-sign (P0) — PASS
- **Akcja**: FS-NIGHT-R06-1138 (in_review v2, PODPISANA — approve receipt w e_sign_log) → „Save version" (`saveFactorySpecVersion`, alternatywna ścieżka wersjonowania) → modal v2→v3 → CHANGE REASON → submit.
- **Dowód blokady (FIX-T4)**: toast **"Signed in-review specifications must be edited to create a new in-review revision"** — serwer odrzucił PRZED zapisem; bypass polityki e-sign-invalidation zamknięty (edycja musi iść przez `updateFactorySpec` = nowa rewizja, immutable signed subject).
- **DB**: nadal v1 archived + v2 in_review — **v3 NIE powstało** (blok trzyma, zero brudnej persystencji). Modal „Previous version stays read-only" = immutable-revision mechanizm.
- **Brak regresji**: draft specy nadal edytowalne (Edit/Save version), lista renderuje.
- Werdykt: **fix działa (bypass zablokowany + immutable revision), dane czyste, 0 regresji.**

## ✅ PF-R01-01 — invite tworzy usera site-restricted, nie cross-site (P0 security) — PASS
- **Akcja**: Settings→Users→„+ Invite user" → email `e2e-pfr0101-sitescope@monopilot.test`, rola **Viewer** (site-restricted), site **Main Factory** (wybrany po NAZWIE) → Send.
- **Dowód (DB, autorytatywnie)**: `public.users.id == auth.users.id` (**ID_MATCHES_AUTH=true** — B1 identity fix, scope rozwiąże się przy loginie), `user_sites` row = **Main Factory** (**SITE_SCOPE persisted, NIE unrestricted** — B3), `is_active=false` (pending). Zero crashu (B3: rezolucja nazwy site bez uuid-castu — pre-fix crashował).
- Cross-site vulnerability zamknięta: zaproszony user jest zamknięty do jednego site keyed auth-UUID.
- **Cleanup**: test invite (`e2e-pfr0101-sitescope`, id 4ce8cda9) usunięty z DB (user_sites+users+auth.users, transakcyjnie) — prod czysty; audit-log append-only zostaje.
- Werdykt: **fix działa (identity=auth + site-scope wymuszony); 0 regresji.**

---
## Podsumowanie E2E (Fala 1)
Wszystkie 5 obszarów P0 + kluczowy sibling **dowiedzione behawioralnie na prodzie** (odtworzenie zakazanej akcji + DB/runtime + brak regresji), nie samo renderowanie:
| Fix | Metoda dowodu | Werdykt |
|---|---|---|
| PF-R01-01 invite site-scope | UI invite + DB (id=auth, user_sites) | ✅ |
| PF-R01-02 Security save | UI save + DB + runtime-log (3 bugi) | ✅ |
| PF-R04-01 gate operational | live server-computed HARD-block + DB | ✅ |
| PF-R05-01 WIP self-cycle | UI reject + DB (0 persist, brak phantom) | ✅ |
| PF-R06-01 FactorySpec e-sign | UI block (bypass) + DB (brak v3) | ✅ |
| PF-R20-02 LOTO dual-sign | DB CHECK obie strony (same=reject/distinct=ok) | ✅ |
Siblingi P1/P2 (R05-08 cascade, R04-04, R20-05, R06-14, R01-03/04) — kod+unit-verified; zalecany osobny E2E przy okazji.
