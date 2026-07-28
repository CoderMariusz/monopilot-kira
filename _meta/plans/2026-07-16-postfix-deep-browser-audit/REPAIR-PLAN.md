# PLAN FAL NAPRAWCZYCH — post-fix audit 2026-07-16 (113 problemów)

Źródło: `_meta/plans/2026-07-16-postfix-deep-browser-audit/FULL-REPORT.md` (20 runów, PF-RNN-NN).
Bilans: **5 P0 · 60 P1 · 43 P2 · 5 P3 = 113**. Baza produkcyjna: `main` (sprawdzić HEAD przed startem), deploy Vercel auto-migrate.

## Zasady wykonania (każda fala)
- **Fanout**: ~5 torów/fala, ≤2 bugi/tor, pliki ROZŁĄCZNE (grupowanie po module = brak kolizji).
- **Pipeline standard** (logika/matematyka/backend): Composer `composer-2.5` pisze → Codex `gpt-5.6-sol@xhigh` review → Opus arbitraż+fix. **UI EXCEPTION** (RSC-boundary, stale-UI, reorder, dead-end, modale, empty-state): Opus/Claude pisze → Codex review.
- **Launch config** (reguła 2026-07-17): Codex `codex exec --sandbox workspace-write`, BEZ `make verify` w promptcie — bramkę odpala Opus PO agencie. Cursor: agent TYLKO impl, testy uruchamia orchestrator (unikamy reap długiego wrappera).
- **Bramka/fala**: `tsc --noEmit` + `pnpm --filter web test` + `next build` + PREPARE każdej nowej migracji na owner-prod (`begin;\i file;rollback;`). next wolny numer migracji > 509.
- **Regresja**: `git stash push -u` fali → baseline suite → `pop` → `comm` diff zbiorów failów; 0 nowych = warunek merge.
- **Deploy**: merge→push→Opus browser-E2E na prod (Playwright, admin@monopilot.test, org Apex …0002); **browser TYLKO gdy 0 cursorów**. Fable regression co 4 fale (jeśli credits).
- **Dyscyplina danych**: nigdy `git add -A` (stage scoped); backup przed data-migracją; guard w współdzielonej funkcji nie per-caller; numeric bez float w koszcie.

---

## FALA 1 — P0 GOVERNANCE / SAFETY / E-SIGN (5 P0 + 5 siblingów)
Najwyższy priorytet regulacyjny (21 CFR Part 11, SoD, food-safety). Każdy tor = jeden P0 + pokrewny defekt tego samego domenu.
| Tor | Findings | Pipeline | Domena / plik |
|---|---|---|---|
| T1 | **PF-R01-01 P0** invite site-restriction ignorowane (user bez ograniczenia) + PF-R01-02 P1 Security settings nie zapisują się | standard | actions/users/invite.ts, settings/security |
| T2 | **PF-R04-01 P0** G3/G4 ignoruje checklist/dowody + PF-R04-04 P1 stage evidence = unauth soft-override | standard | npd stage-gate actions |
| T3 | **PF-R05-01 P0** definicja WIP może zawierać siebie + PF-R05-08 P2 cascade myli liście z max-depth | standard | lib/npd wip, cascade.ts |
| T4 | **PF-R06-01 P0** edycja in-review FactorySpec nie unieważnia e-sign + PF-R06-14 P1 reopen bundle ukrywa e-sign/receipts | standard | technical factory-specs |
| T5 | **PF-R20-02 P0** jeden signer weryfikuje zero-energy i startuje LOTO-MWO + PF-R20-05 P1 calibration dual-sign reviewer-UUID dead-end | standard | maintenance mwo/calibration |

## FALA 2 — NPD GATE GOVERNANCE (R04) — 10× P1/P2
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R04-02 signed G4 mutable bez wersji + PF-R04-03 gate-truth modal≠server (C025 niepełny) | standard |
| T2 | PF-R04-05 „margin vs target" pokazuje revenue + PF-R04-06 yield 0% = brak straty | standard (matematyka) |
| T3 | PF-R04-07 handoff „all gates pass" gdy 2 fail + PF-R04-08 locked formulation nie generuje BOM | standard |
| T4 | PF-R04-09 e-sign „Valid" ale pusty cert/hash + PF-R04-10 delete NPD sierocieje sensory (Technical) | standard |
| T5 | PF-R04-11 clone → martwy Review + PF-R04-12 trial/pilot CRUD niepełny | UI exception |

## FALA 3 — WIP COST + NPD TAIL (R05 + R04 tail + R19) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R05-02 clone-on-write v3 bez notyfikacji pinów v2 + PF-R05-03 fałszywy koszt do hard-refresh | standard + UI |
| T2 | PF-R05-04 live WIP cost pomija labor/setup/yield + PF-R05-05 canonical costing pada dla nested-WIP | standard (matematyka) |
| T3 | PF-R05-06 pilot ops akceptowane przy G0 + PF-R05-07 waluta EUR→GBP relabel bez konwersji | standard |
| T4 | PF-R05-09 archive zostawia edytowalny detail + PF-R04-13 sensory ownership sprzeczne z danymi | UI exception |
| T5 | PF-R04-14 P3 stale nav/untranslated + PF-R19-03 P2 WO cost waluta nie ujawniana | UI exception |

## FALA 4 — BOM / ROUTING / SPECS (R06) — 10× P1/P2
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R06-02 authoring nie zapisuje wartości z Review + PF-R06-03 scrap% immutable po utworzeniu linii | standard |
| T2 | PF-R06-04 linie BOM bez reorder + PF-R06-05 operacje routingu bez reorder | UI exception |
| T3 | PF-R06-06 draft routing bez delete/retire + PF-R06-07 picker linii bez site (ładuje wszystkie org) | standard |
| T4 | PF-R06-08 active-BOM edit obiecuje Draft, tworzy In-review + PF-R06-09 decimal setup min blokuje Save | standard |
| T5 | PF-R06-10 released/archived BOM invalid controls + PF-R06-11 planned WO nieobecne w snapshot audit | standard |

## FALA 5 — ITEMS / UoM (R03) + BOM/Identity tail — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R03-01 identyczne base i secondary UoM + PF-R03-02 catch-weight invariant tylko tekst | standard |
| T2 | PF-R03-03 shelf-life 0 dni bez trybu + PF-R03-04 każda mutacja Units&conversions = ten sam prod error | standard |
| T3 | PF-R03-05 UoM registry odłączony od selektorów item + PF-R03-06 fractional packaging generic fail | standard + UI |
| T4 | PF-R06-12 item Review pomija shelf-life + PF-R06-13 routing empty-state bez CTA create | UI exception |
| T5 | PF-R01-03 stale listy po invite/revoke + PF-R01-04 pending invite fałszywy deactivate | UI exception |

## FALA 6 — IDENTITY tail + SITES/INFRA (R01+R02) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R01-05 poprawny lifecycle invite niewykrywalny + PF-R01-06 audit attribution zawsze „System" | UI + standard |
| T2 | PF-R01-07 P3 display name ignorowany + PF-R02-01 line default output fake-save do złej kolumny | standard |
| T3 | PF-R02-02 Printers RSC-boundary closure crash + PF-R02-03 active storage pod inactive parent | UI exception + standard |
| T4 | PF-R02-04 inactive locations jako active-line destinations + PF-R02-05 warehouse addr niepoprawialny | standard |
| T5 | PF-R02-06 P3 dup site jako „missing field" + PF-R02-07 P3 dock dialog bez Radix DialogTitle | UI exception |

## FALA 7 — SUPPLIERS / PO / GRN (R07) + LP hooks — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R07-01 PO price over-precision→0 + PF-R07-02 6dp qty nie zawsze w pełni receivowalne | standard (matematyka) |
| T2 | PF-R07-03 priced g/pcs nie do przyjęcia + PF-R07-04 cancel GRN crash przed reversal | standard |
| T3 | PF-R07-05 wac_unresolved_uom zamaskowany + PF-R07-06 GRN fabrykuje supplier batch z internal | standard + UI |
| T4 | PF-R07-07 PO ukrywa precyzję ceny + PF-R07-08 PO/GRN hydration error | UI exception |
| T5 | PF-R08-04 GRN „0 items" dla completed 1-line + PF-R08-09 site-filter LP bypass przez detail-URL | standard |

## FALA 8 — WAREHOUSE LP / SCANNER / GENEALOGY (R08+R17+R14-02) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R08-01 occupied location deactivate → LP znika + PF-R08-02 split dziedziczy source loc zamiast wymagać dest | standard |
| T2 | PF-R08-03 blind-count bez LP identity + PF-R08-05 LP print omija config workflow | standard + UI |
| T3 | PF-R08-06 reprint Direct-PDF→queued ZPL + PF-R08-07 expiry off-by-one (time-of-day) | standard |
| T4 | PF-R08-08 expiry dashboard gubi batch/status + PF-R17-01 revisit received-line = generic fail | UI exception |
| T5 | PF-R17-02 putaway RECV→RECV no-op powtarzany + PF-R14-02 genealogia raw-UUID, brak bi-nawigacji | standard + UI |

## FALA 9 — MRP / TO / WO-chains / SCHEDULER (R09+R10+R11-01+R12-01) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R09-01 „Save run" pada gdy read-only MRP działa + PF-R09-02 pierwszy bucket jako pełny horyzont | standard (matematyka) |
| T2 | PF-R09-03 site supply + global forecast/threshold + PF-R09-04 BUY vs blocked supplier | standard |
| T3 | PF-R09-05 time-phased BUY ukrywa lead-time lateness + PF-R10-01 mixed-UoM transfer nie może ship | standard |
| T4 | PF-R10-02 re-receive po reversal zamyka TO bez brakującej linii + PF-R10-03 partial TO Cancel nie anuluje reszty | standard |
| T5 | PF-R11-01 edit FG date zostawia child WIP na starej + PF-R12-01 scheduler odpala WIP+FG jednocześnie | standard |

## FALA 10 — PRODUCTION EXECUTION + SCHEDULER tail (R11-13,R14-01,R15,R20-04/07) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R11-02 P2 child qty bez history-entry + PF-R11-03 WO detail omija site-filter | standard |
| T2 | PF-R12-02 capacity liczy slot + draft alternatywę + PF-R13-01 prod dashboard niedostępny (sub-route działa) | standard + UI |
| T3 | PF-R13-02 cancelled WO elapsed rośnie w nieskończoność + PF-R13-03 resume akceptuje 0-min downtime | standard |
| T4 | PF-R14-01 controlled FEFO deviation = desktop dead-end + PF-R15-01 completed WO traci signed output bez yield-gate | UI + standard |
| T5 | PF-R20-04 calibration akceptuje inverted range + PF-R20-07 Multi-Site sumuje unlike-quantities (unitless) | standard (matematyka) |

## FALA 11 — QUALITY / NCR + SHIPPING / SO (R16+R18) — 10×
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R16-01 out-of-spec zapisany jako PASS + PF-R16-02 signed failed inspection bez hold/NCR | standard |
| T2 | PF-R16-03 NCR nie linkuje inspection/LP/product/hold + PF-R16-04 NCR close stale/writable do refresh | standard + UI |
| T3 | PF-R16-05 blank result → raw validation JSON + PF-R16-06 P3 closed NCR powtarza signature notice | UI exception |
| T4 | PF-R18-01 allergen restriction CRUD bez ref-data + PF-R18-02 duplicate SO submit → 2 SO | standard |
| T5 | PF-R18-03 SO line amounts nie sumują się do total + PF-R18-04 partial packing seal niekompletnego shipmentu | standard (matematyka) |

## FALA 12 — MAINTENANCE CRUD + GLOBAL cleanup (R20 tail) — 3× + regresja końcowa
| Tor | Findings | Pipeline |
|---|---|---|
| T1 | PF-R20-01 asset register bez correction/retirement path + PF-R20-03 PM read-only placeholder (brak recurrence) | standard |
| T2 | PF-R20-06 Production UI reklamuje zakazane D365 pull/import mimo export-only | UI exception |
| T3 | **Regresja pełna** + weryfikacja pozostałości audytu (asset NIGHT-R20…-AST, MWO-2026-00003 In-progress LOTO) — cleanup/re-verify | Opus |

---

## Podsumowanie planu
- **12 fal**, wszystkie 113 findingów pokryte (weryfikacja mapowania: R01×7,R02×7,R03×6,R04×14,R05×9,R06×14,R07×8,R08×9,R09×5,R10×3,R11×3,R12×2,R13×3,R14×2,R15×1,R16×6,R17×2,R18×4,R19×1,R20×7 = 113 ✓).
- **Kolejność severity**: Fala 1 = wszystkie 5 P0. Fale 2-11 = P1 dominują (governance→cost→BOM→items→infra→PO→WH→MRP→execution→quality/ship). Fala 12 = maintenance CRUD + P2/P3 tail + regresja końcowa.
- **Podział pracy**: ~55% torów standard-pipeline (backend/matematyka: koszty, WAC, MRP, UoM, e-sign, state-machine), ~45% UI-exception (stale-UI, RSC-boundary, reorder, dead-end, empty-state, hydration).
- **Szacunek**: 12 fal × (impl+review+bramka+deploy+E2E). P0 fala najostrożniej (dual-verify Codex+Opus na prod).
- **Migracje**: prawdopodobne przy R03 (UoM constraints), R06 (scrap/reorder), R05/R04 (WIP cycle guard, gate-truth), R16 (spec-limit persist), R08 (location deactivate guard). Serializować numery >509, PREPARE każdą na owner-prod.

## Znane powiązania (nie zmniejszają licznika)
- PF-R04-03 = niepełne domknięcie historycznego C025 (modal≠server) — Fala 2 T1 musi zamknąć OBIE strony.
- Site-filter bypass: PF-R08-09 (LP) i PF-R11-03 (WO) osobno — różne encje/guardy.
- Catch-weight (PF-R03-02) = potwierdzony gap z katalogu testów 2026-07-18 (brak capture w kodzie) — decyzja: implementować czy udokumentować jako świadome.

## Po compact — start fali
Fresh context: przeczytaj ten plik + FULL-REPORT.md (rejestr) + odpowiednie run-NN/REPORT.md dla szczegółów/dowodów danego findingu. Skill `engine-delegation` prowadzi pipeline. Start od Fali 1.
