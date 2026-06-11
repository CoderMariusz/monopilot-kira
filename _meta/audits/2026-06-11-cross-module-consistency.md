# MonoPilot — Cross-Module Consistency Audit (2026-06-11)

Audyt read-only na worktree `origin/main` (f26d46da) + żywa baza Supabase (SELECT-only).
4 równoległe tory: A=SSOT/ownership, B=wersjonowanie/derywacje, C=bramki server-side,
D=eventy/RLS/drift. Komplement raportu z klikania:
`_meta/reviews/2026-06-11-live-clickthrough-gaps.md` — każdy bug z klikania ma tu
zlokalizowany root-cause w kodzie.

---

## 5.1 Executive summary

**Liczby:** 4 BLOCKER/CRITICAL · 19 HIGH · 23 MED · 5 LOW (51 znalezisk; 6 inwariantów
zweryfikowanych jako PASS).

**Top 5 ryzyk systemowych:**
1. **Cykl życia palety nie ma put-away** — żaden kod nigdy nie ustawia
   `license_plates.status='available'`, a `v_inventory_available` tego wymaga → inventory
   puste, konsumpcja desktop martwa; scanner consume omija bramki QA w ogóle. (F-A01+F-A03+F-C02)
2. **Catch-22 zatwierdzeń**: bundle spec wymaga BOM `draft/in_review`, a Technical
   niezależnie publikuje BOM → spec nie do zatwierdzenia → **start każdego WO = 409**. (F-C01)
3. **Alergeny: ≥7 rozłącznych magazynów danych bez SSOT**; panel NPD persystuje dane od
   klienta (`save-draft.ts:81`) i nigdy nie czyta `item_allergen_profiles` → fałszywie
   negatywne deklaracje (potwierdzone na żywych danych). (F-A06+F-A07+F-B06)
4. **Bramki food-safety brakujące w mutacjach**: consume (desktop+scanner) nie sprawdza
   qa_status/holds/expiry mimo kontraktu "Every consume path MUST call holdsGuard";
   V18/V01-V08 nieobecne w release preflight. (F-C02/04/06/07)
5. **Łańcuch traceability niebudowalny z konstrukcji**: output nie tworzy LP
   (`register-output.ts:362`), genealogia (`parent_lp_id`) nie ma ŻADNEGO writera, expiry
   zapisywane do `best_before_date` a czytane z `expiry_date`. (F-B07+F-B08+F-A04)

**Diagnoza:** Fundamenty są solidne (RLS org_id w 278/282 politykach, idempotencja
przemyślana, clone-on-write na BOM w DB, jedna biblioteka konwersji UoM, wspólny service
layer scanner↔desktop). Moduły zawodzą NA STYKACH: writer i reader tej samej danej mają
różne kontrakty (status LP, kolumna expiry, słownik qa_status, źródło alergenów, kolejność
zatwierdzeń). To nie jest brak kodu — to brak jednego właściciela kontraktu per dana.
Wzorzec zgodny z `tests/test_wiring_contract.py`-lekcją: każde pole musi mieć
producenta+konsumenta+test E2E.

---

## 5.2 Entity map (Phase 0, tor A — skrót)

253 migracje (000–271), 184 pgTable. Tenant key: **org_id wszędzie** (Wave0 lock trzyma;
`tenant_id` tylko w organizations/tenant_idp_config/legacy). Pełna mapa rodzin tabel per
moduł — w wynikach toru A; kluczowe odchylenia:

- **W kodzie/żywej bazie, ale w ŻADNYM PRD:** placeholdery R13 z mig 014 (`lot`,
  `work_order`, `quality_event`, `shipment`, `bom_item`, `work_order_items`) — wciąż
  czytane! (F-A11); `npd_legacy_closeout`, `fa_builder_outputs`.
- **W PRD, ale brak w kodzie:** `lp_reservations` (05 §5.4) i `wo_material_reservations`
  (04 §5.10) — zaimplementowano INNY model (kolumny LP) → CONTRACT-DRIFT F-A10; pakiet
  Quality P2 (haccp_*, sampling_*, complaints…).

---

## 5.3 Findings

### Tor A — SSOT & ownership

**F-A01 | I-06/I-07 | BLOCKER** — Brak przejścia put-away: `receive-po.ts:488` wstawia LP
`status='received'`; QA release zmienia TYLKO `qa_status` (`lp-qa-actions.ts:70-76`);
`v_inventory_available` (mig 191:189-190) wymaga `status='available'` — **zero writerów
'available' w repo**; żywa baza: 6/6 LP = 'received'. Blast: inventory, FEFO, konsumpcja,
rezerwacje. Fix: put-away received→available (+lp_state_history); doraźnie auto-promote
przy QA release. Task: "WH: put-away transition; unbreak v_inventory_available".

**F-A02 | I-06 | HIGH** — Fork słownika qa_status: LP `('pending','released','on_hold','rejected')`
vs wo_outputs `('PENDING','PASSED','FAILED','ON_HOLD','RELEASED')` (mig 181:81) vs Quality
DSL 7 stanów (PRD 09:1352) vs PRD 08 `PASSED` gdzie kod chce `released`; ad-hoc mapping w
`output-qa-actions.ts:100`. Fix: ADR jeden kanoniczny enum + migracja mapująca.

**F-A03 | I-06 | HIGH** — Scanner consume bez bramki: `api/production/scanner/wos/[id]/consume/route.ts:95-107`
UPDATE bez predykatu status/qa_status → konsumowalny stock w kwarantannie. Fix: wspólny
guard z desktopem.

**F-A04 | I-07 | MED** — Jedyny INSERT do license_plates w repo = receive-po.ts:481; output
produkcji nie tworzy LP → FG niewidoczne dla inventory/shipping. (→ F-B08)

**F-A05 | I-02 | MED** — items↔product sync punktowy: `create-fa.ts:88-96` tworzy product
BEZ items; update'y jednostronne. Żywa baza: 13 product vs 9 fg items, 6 sierot, 1 rozjazd
nazwy. Fix: create-fa wymaga/tworzy items; propagacja nazw/statusów.

**F-A06 | I-10 | BLOCKER** — Alergeny formulacji NPD client-supplied: `save-draft.ts:81,87`
persystuje co przyśle klient; picker ustawia tylko code/name/cost (komentarz w
`formulation-editor.tsx:765-767`); NIC w NPD nie czyta `item_allergen_profiles`. Żywy
dowód: AUDIT2-RM1 ma mustard w profilu, formulation_ingredients ma `[]`. Fix: resolve
server-side z item_allergen_profiles; allergens_inherited = derived cache.

**F-A07 | I-10 | HIGH** — ≥7 magazynów alergenów bez SSOT: item_allergen_profiles(+overrides,
op-additions, contamination) / Reference.RawMaterials.allergens_inherited /
Reference.Allergens_by_RM+Allergens_added_by_Process (źródła widoku fa_allergen_cascade,
mig 114) / formulation_ingredients.allergens_inherited / nutrition_allergens /
supplier_specs.declared_allergens. Dwa silniki kaskady liczą z RÓŻNYCH wejść. Fix: ADR
SSOT=item_allergen_profiles, reszta derived.

**F-A08 | I-10 | MED** — Obcięcie multi-alergenów do 1 elementu: `formulation/page.tsx:579`
`allergens_inherited?.[0]` + round-trip `[r.allergen]` → cicha utrata danych przy ≥2 alergenach.

**F-A09 | I-04 | MED** — NPD podszywa się pod Technical: `materialize-npd-bom.ts:393-399`
wstawia factory_specs `status='approved_for_factory', source='technical'` omijając
draft→in_review; `factory-release-status.ts:301-334` emituje `technical.factory_spec.approved`
z kodu NPD. Fix: decyzja (skrót błogosławiony i udokumentowany ALBO seed jako draft).

**F-A10 | I-09 | MED (CONTRACT-DRIFT)** — PRD-owe tabele rezerwacji nie istnieją;
zaimplementowano kolumny LP (reserved_qty/reserved_for_wo_id). Jeden model żywy = OK, PRD
stale; pułapka: shipping `inventory_allocations` (schema-only) nie zdejmuje reserved_qty.

**F-A11 | Phase-0 | MED** — Placeholdery R13 żywe i czytane: `skeleton-data.ts:20-24`,
`close-out-legacy-stages.ts:356` (public.work_order), `lib/cron/catch-weight-variance.ts:93`
czyta `work_order_items` które NIE MA writera → cron liczy po wiecznie pustej tabeli.
Fix: repoint na wo_outputs, drop placeholderów.

**PASS:** I-01 (jeden model BOM, NPD pisze SSOT przez materialize), I-03 (fa = read-only
VIEW z triggerem), I-05 (lab_results revoke + brak ścieżek INSERT), I-08 (D365 nigdy
kanoniczne; V-TEC-73 zaimplementowane z testami; R15/mig 218).

### Tor B — wersjonowanie & derywacje

**F-B01 | I-11 | HIGH** — BOM "Add component" forkuje 1-linijkową wersję:
`bom-edit-dialog.tsx:307-321` woła `createBomDraft({lines:[tylko nowa]})`; brak akcji
"append line"; DB clone-on-write (mig 168) poprawny — defekt czysto serwisowo-UI.
Fix: merge istniejących linii + nowej, albo akcja addBomLine dla draftów.

**F-B02 | I-12 | HIGH** — Routing nigdy nie snapshotowany: `wo_operations` ma ZERO INSERTów
w repo (tylko 2 SELECTy); createWorkOrder snapshotuje tylko materiały. Fix: materializacja
routing_operations→wo_operations przy create/start.

**F-B03 | I-12 | MED** — BOM mrożony dopiero przy START (nie create/release); WO bez
aktywnego BOM przechodzi z `warning:'no_active_bom'` i zero materiałów.

**F-B04 | I-13 | MED** — Immutability wo_materials/wo_operations tylko konwencją (brak
triggera DB wzorem mig 168).

**F-B05 | I-18 | HIGH** — Nutrition panel NPD pusty: `get-formulation.ts:104-117` nie
SELECTuje nutrition; editor buduje mapę z pola, którego nikt nie wypełnia; silnik liczenia
istnieje i działa gdzie indziej (recompute.ts:74-118 czyta Reference.RawMaterials).
Fix: jeden LEFT JOIN. Pozytyw: brak free-typed nutrition na FG (upsert odrzuca typy ≠ rm/
ingredient/intermediate).

**F-B06 | I-19 | HIGH** — Kaskada alergenów odpala się TYLKO przy materializacji BOM z NPD
(`materialize-npd-bom.ts:96` = jedyny caller `cascade.ts:53`); nie przy zapisach BOM
Technical, nie przy zmianie profilu RM; worker reaguje tylko na bulk CSV; brak nocnej
rekonsyliacji i ręcznego triggera. V-TEC-45 (ochrona manual_override) — poprawne.

**F-B07 | I-24 | HIGH** — Expiry: zapis do `best_before_date` (receive-po.ts:481-553),
wszystkie odczyty/FEFO/alerty czytają `expiry_date` (mig 191:111,185; expiry-actions.ts:36).
Brak auto-kalkulacji z shelf_life_days przy przyjęciu i snapshotu shelf_life_mode.
(register-output liczy expiry POPRAWNIE — ale te LP nie powstają, → F-B08.)

**F-B08 | I-25 | HIGH** — Output bez LP + genealogia bez writerów: `register-output.ts:347-377`
`lp_id: input.lp_id ?? null`; genealogia = `license_plates.parent_lp_id` (nie ma tabeli
lp_genealogy) i NIKT go nie pisze (brak split/merge akcji). Reader (rekurencyjny CTE
org-scoped, cycle-checked) — poprawny i czeka na dane.

**F-B09 | I-21 | MED** — V06 wpięty tylko w martwy kod (`cascade-engine` bez importów w
app); `manufacturing-ops-lookup.ts` config-driven ale bez callerów. Pozytyw: brak
hardcoded sufiksów w żywych ścieżkach.

**F-B10 | I-22 | MED** — V-TEC-12 (suma alokacji=100) tylko w create-draft; brak triggera
DB; `compute-waterfall.ts` w ogóle nie używa allocation_pct.

**F-B11 | I-20 | LOW** — update-fa-cell nie re-derywuje ingredient_codes (robi to tylko
finish-wip) → stale wejście kaskady alergenów FA.

**F-B12 | I-23 | LOW** — formulation cost_per_kg_eur z payloadu klienta (pct liczone
server-side — OK). Fix: czytać items.cost_per_kg przy zapisie.

**PASS:** I-13 (tylko liczniki pisane), I-14 (supersede chain z triggerem mig 094), I-15
(ledger jedynym writerem cost_per_kg; V-TEC-53 server-side), I-16 (triggery built_reset),
I-17 (compliance docs wersjonowane, soft-delete).

### Tor C — bramki server-side (B1–B15)

Macierz bramek (skrót): B1 server(strukturalnie — brief zmergowany w projekt) · B2
**UI-only** (checklista "advisory" z komentarzem w gate-helpers.ts:246) · B3 partial
(G4 tylko; Builder sprawdza POZYCJĘ gate, nie e-sign) · B4 partial · B5 **missing**
(tylko V01/V02 przy create; brak modułów v05/v08) · B6 server(built)/**missing**(release)
· B7 server · B8 server(BOM)/**missing**(WO release) · B9 server(release, z self-heal) ·
B10 advisory (kolumny lock, brak partial unique index, consume ignoruje lock) · B11
**selection-only** (view filtruje, mutacje nie) · B12 **missing** (expired LP konsumowalne,
FEFO sortuje je PIERWSZE) · B13 dormant (guard jest, nikt nie pisze snapshotu) · B14
**missing** (V-PLAN-WO-CYCLE nie powstał) · B15 partial (brak emisji non_conformance.requested;
TO receive = status flip).

**F-C01 | I-26/B7/B9 | CRITICAL** — Catch-22: `release-bundle-service.ts:333` żąda BOM
draft/in_review i sam przenosi go na technical_approved; `bom/_actions/workflow.ts:66-128`
niezależnie robi approved→active. BOM raz zatwierdzony = spec nie do zatwierdzenia =
start-wo self-heal (`start-wo.ts:92-142`) nic nie znajduje = 409. Żywa baza: 2/2 RELEASED
WO z NULL spec/BOM. Fix: bundle approval akceptuje BOM technical_approved/active.

**F-C02 | B11/I-31 | CRITICAL** — Mutacje konsumpcji bez QA/holds: scanner route:93-118 i
desktop `consume-material-actions.ts:281-302` UPDATE bez qa_status/holdsGuard — łamie
kontrakt `holds-guard.ts:5-9` ("Every consume path MUST call holdsGuard"). Stock na holdzie
konsumowalny do produkcji żywności.

**F-C03 | I-31 | HIGH** — "Manual/no LP" consume: lpId opcjonalny, zero-UUID w ledgerze,
omija LP/qa/holds/expiry/inventory. Fix: permission+reason code albo wymóg LP.

**F-C04 | B12 | HIGH** — Expiry nie blokuje nigdzie; view nie wyklucza przeterminowanych
(sortuje je pierwsze przez FEFO!).

**F-C05 | B15/I-33 | HIGH** — TO receive = `transfer-orders/_actions/actions.ts:269-309`
czysty status flip: brak walidacji linii, brak LP w destynacji, brak NCR. (= fantomowy
stock z klikania.)

**F-C06 | B6/I-28 | HIGH** — Brak V18 (Open High risk) w `release-preflight.ts:71-119`;
trigger DB (mig 088) chroni tylko flip `built`.

**F-C07 | B5 | HIGH** — Builder release nie odpala ŻADNEGO walidatora V01-V08; modułów
v05/v08 nie ma w `packages/validation/src/`.

**F-C08 | I-29/B2 | HIGH** — Checklista advisory + kanban "Advance →" (`kanban-card.tsx:178-188`)
woła advanceProjectGate wprost — adjacency/G4-e-sign trzymają, checklista/modal w pełni
omijalne. Decyzja: zamierzone? (komentarz sugeruje tak — wtedy PRD do aktualizacji.)

**F-C09 | I-29 | MED** — Gate-machine zlepiona ze stage-machine: G1 nieosiągalne (G0→G2);
`ALREADY_CLOSED` zwraca ok:false ze statusem 200 (= "cichy fail" z klikania);
approveProjectGate nie przesuwa bramki.

**F-C10 | B3/I-29 | MED** — Builder nie wymaga wierszy gate_approvals z e-sign (CFR-21 gap).

**F-C11 | I-27/B8 | MED** — validateRmUsability NIE wywoływane przy WO release; kontekst
`material_issue` zdefiniowany, zero callerów.

**F-C12 | I-30/B10 | MED** — Lock LP advisory (kolumny + 5-min auto-steal), brak partial
unique index, consume ignoruje locked_by.

**F-C13 | I-32/B13 | MED** — Bramka changeover alergenowego uśpiona: guard w start-wo:147-153
czyta `allergen_profile_snapshot`, którego nikt nie pisze; ścieżka dual-sign = stub.

**F-C14 | B14 | MED** — V-PLAN-WO-CYCLE obiecany w mig 177:16, nie istnieje.

**F-C15 | I-35 | MED** — Bez e-sign: fa.delete, d365 config, schema.edit, rule.edit.
Desktop e-sign weryfikuje TEN SAM user_pins co login skanera; desktop nie ma UI zarządzania
PIN (tylko ekran scanner pin-setup). `non_conformance.requested` nie emitowane nigdzie.

### Tor D — eventy, RLS, drift

**F-D01 | I-36 | HIGH** — Outbox: receive (GRN+LP) nie emituje NIC; deklarowane-nigdy-
nieemitowane: fa.core_closed, brief.converted, warehouse.lp.received/material.consumed/
lp.shipped, wo.ready; po./to.state_changed w ogóle niezadeklarowane. Drift-gate test daje
fałszywą pewność (deklaracja ≠ emisja).

**F-D03 | I-38 | MED** — audit_events: zero zapisów w quality holds/NCR, gate advance/
approve, wszystkich mutacjach warehouse (technical pokryty dobrze). Rola authenticated ma
nadmiarowe granty UPDATE/DELETE na audit_events (bez polityki = denied, ale higiena).

**F-D04 | I-39 | LOW (doc-drift)** — Kod czysty (org_id); PRD 01/04/05 mówią tenant_id —
poprawić dokumenty.

**F-D05 | I-40 | HIGH** — **Dziura RLS**: polityka `line_machines_app_user_access` cmd=ALL
qual=`true` na tabeli BEZ org_id → cross-org odczyt I ZAPIS powiązań linia↔maszyna.
Fix: scope przez EXISTS join do lines/machines. Dodatkowo: 4 tabele globalne bez RLS
flagowane przez advisors; partycje audit_log z RLS bez polityk (default-deny — potwierdzić).

**F-D06 | I-41 | LOW** — purchase_orders bez ext_jsonb/schema_version.

**F-D07 | I-42 | MED (decyzja)** — Brak starych nazw w kodzie ✓, ale route `/en/fa`,
"Factory Article" w copy, pattern `^FA` i eventy `fa.*` rosną dalej — pobłogosławić jako
trwały alias albo zaplanować rename na FG.

**F-D08a | I-43 | HIGH** — Root-cause cichej konwersji 100 szt→50 kg: preview konwersji
JEST w kodzie (`create-wo-modal.tsx:78-82,291`), ale jego etykiety i18n siedzą w
NIEISTNIEJĄCYM staged pliku `_meta/i18n-staging/wo-uom.json` → preview nigdy się nie
renderuje, a `createWorkOrder.ts:82` cicho zapisuje toBaseQty(). Fix: dostarczyć klucze.

**F-D08b | I-43 | MED** — `ingredient-row.tsx:214` hardcoded `€`; obok `cost-panel.tsx:89-100`
ma poprawną mapę ISO-4217 (PLN→zł). Przekazać currency prop.

**F-D09 | I-44 | LOW** — bom_outputs nie istnieje; wygrało bom_co_products; PRD 04 §8.3 stale.

**F-D10 | I-45 | MED** — wo_outputs bez disposition/downstream_wo_id; schedule_outputs ma
CHECK ale insert hardcoduje 'to_stock', downstream_wo_id martwy → łańcuch WIP→WO
(direct_continue) niezaimplementowalny.

**F-D11 | I-46 | MED** — Read-model `factory_release_status` istnieje (wszystkie 4 pola) i
jest konsumowany przez builder/technical, ale Planning re-implementuje bramkę inline na
factory_specs → dwie definicje mogą się rozjechać. Fix: Planning czyta read-model.

**F-D12 | I-47 | MED** — V08/brief_to_fa_audit nie istnieje (brak tabeli, zero referencji);
jedyny ślad mapowania = event npd.fg_candidate_mapped. Zaimplementować albo formalnie
przescope'ować.

**F-D13a | I-48 | HIGH** — Root-cause scanner waste 422: `scanner-prod-labels.ts:447-458`
wysyła statyczne kody TRIM/SPILL/… a `recordWaste` resolwuje po `waste_categories`, gdzie
żyje tylko DEMO-SCRAP → zawsze `invalid_reference`. Desktop działa, bo pobiera kody z
tabeli. Fix: scanner bootstrap czyta waste_categories.

**F-D13b | I-48 | HIGH** — Root-cause scanner consume 422: 3-argumentowy wariant
`with-scanner-org.ts:60-64` robi `set_config('app.current_org_id',…)`, ale funkcja
`app.current_org_id()` (mig 002:54-68) czyta `app.active_org_contexts` po backend_pid+txid
i NIGDY nie czyta tego GUC (a is_local=true poza txn to no-op) → route LPs widzi zero
wierszy → 422. Fix: usunąć wariant, wszystko przez transakcyjny `app.set_org_context`.

**PASS:** I-37 (idempotencja: clientOpId+advisory lock+unique constraints; D365 23505→no-op),
I-48 częściowo (scanner i desktop dzielą recordWaste/registerOutput/consume — rozjazd był
w kontekście i danych referencyjnych, nie w walidacji), I-43 częściowo (jedna biblioteka
konwersji; catch-weight kolumny + V-TEC-20/21 obecne).

---

## 5.4 Decision-needed (skonsolidowane — wymagają decyzji PO, nie kodu)

1. **Sekwencja zatwierdzeń spec↔BOM** (F-C01): bundle-before-publish (wtedy blokować
   publish do czasu bundla) czy bundle akceptuje active BOM? Jedna z bramek musi ustąpić.
2. **Kanoniczny enum qa_status** (F-A02): jeden słownik+case dla LP/wo_outputs/Quality DSL.
3. **SSOT alergenów** (F-A07): item_allergen_profiles kanoniczne; Reference.* i kopie
   formulacji = derived. Wymaga ADR.
4. **NPD release == zatwierdzenie Technical?** (F-A09): pobłogosławić skrót (i przestać
   pisać source='technical') czy wymusić review.
5. **Checklisty bramek advisory-by-design?** (F-C08) + los kanbanowego "Advance →".
6. **Zniknięcie G1** (F-C09): zaakceptowane odstępstwo (komentarz 2026-06-06) czy bug.
7. **Punkt mrożenia BOM** (F-B03): snapshot przy create vs start; hard-block przy braku
   aktywnego BOM?
8. **Właściciel LP outputu** (F-B08): registerOutput tworzy LP synchronicznie (atomowo) czy
   warehouse przez outbox (re-otwiera okno lp_id NULL).
9. **Semantyka expiry** (F-B07): jedna kolumna wg shelf_life_mode czy coalesce po stronie
   odczytów — od tego zależy indeks FEFO.
10. **Wspólny PIN skanera i e-sign** (F-C15): wygoda czy wymagana separacja CFR-21.
11. **No-LP manual consume** (F-C03): potrzeba operacyjna (silosy) czy do usunięcia.
12. **Model rezerwacji w PRD** (F-A10) + czy shipping allocations zdejmują reserved_qty.
13. **`/en/fa` + "Factory Article"** (F-D07): trwały alias czy rename na FG.
14. **Martwe typy eventów** (F-D01) i pre-rejestracja słowników stub-modułów: emitować,
    wyciąć, czy formalnie oznaczyć jako roadmap.
15. **Placeholdery R13** (F-A11): drop vs archiwum (1 żywy wiersz legacy work_order).
16. **Quality P2** (haccp/sampling/complaints): potwierdzić odroczenie, by przestało
    liczyć się jako drift.

## 5.5 Rubryka

BLOCKER = dwa źródła prawdy / brak server-side bramki na ścieżce food-safety/release /
FK do nieistniejącej tabeli. HIGH = drugi write-path derywacji, bramka UI-only, mutacja
in-place wydanych wersji, dziura RLS. MED = brak eventu/audytu, drift enum, brak
idempotencji. LOW = drift nazewniczy, brak ext_jsonb, doc-only.

---

## Mapowanie: bug z klikania → root-cause z audytu

| Bug z klikania (2026-06-11-live-clickthrough-gaps.md) | Root-cause |
|---|---|
| Inventory 0 wierszy; pusty picker LP | F-A01 (brak put-away) |
| Start WO zawsze 409 | F-C01 (Catch-22 bundle↔BOM) |
| BOM 1-składnikowy | F-B01 (dialog wysyła tylko nową linię) |
| Alergeny "Absent" w NPD | F-A06 (+F-A07, F-A08) |
| Nutrition puste w NPD | F-B05 (brakujący JOIN) |
| Expiry znika przy przyjęciu | F-B07 (best_before_date vs expiry_date) |
| Output bez palety; genealogia pusta | F-B08 (+F-A04) |
| TO receive = fantomowy stock | F-C05 |
| Scanner waste 422 | F-D13a (statyczne kody vs waste_categories) |
| Scanner consume LP 422 | F-D13b (zepsuty wariant org-context) |
| Ciche 100 szt→50 kg | F-D08a (i18n staging nie istnieje) |
| PLN jako € | F-D08b |
| G3→G4 cichy fail; G0→G2 | F-C09 |
| Kanban Advance omija bramkę | F-C08 |
| Konsumpcja stocku na holdzie możliwa | F-C02 (+F-A03, F-C04) |
| Close WO: PIN bez UI | F-C15 |
