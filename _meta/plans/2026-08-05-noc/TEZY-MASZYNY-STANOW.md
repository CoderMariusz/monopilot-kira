# Maszyny stanów — audyt (Codex, 2026-08-05 01:07)

**STATUS: NIEZWERYFIKOWANE** — Codex bez dostępu do bazy.

Tak. W bieżącym drzewie roboczym potwierdziłem kilka sposobów doprowadzenia danych do stanu bez praktycznej drogi naprzód albo sprzecznego z innym modułem. Najpoważniejsze są:

- nowa inwentaryzacja powstaje jako `open`, ale zapis liczenia wymaga `counting`, a zamknięcie `review`; brak akcji wykonującej te przejścia;
- zlecenie produkcyjne z `segregation_required=true` nie może ruszyć nawet po prawidłowo zakończonym podwójnym changeoverze;
- anulowanie WO nie odwraca już zużytego materiału, a korekta dla anulowanego WO jest zabroniona;
- zwolnienie blokady jakościowej nie sprawdza otwartej, powiązanej NCR;
- dyspozycja RMA „Restock” lub „Quality hold” zmienia tylko etykietę RMA, bez skutku w magazynie lub jakości;
- kilka zwykłych `return { ok:false }` po wcześniejszych zapisach powoduje częściowy `COMMIT`.

Audyt był wyłącznie statyczny. Nie uruchamiałem testów, builda, bazy ani sieci i nie zmieniłem żadnego pliku. Repozytorium było już mocno zmodyfikowane, więc wyniki dotyczą dokładnie bieżącego, „brudnego” working tree z 5 sierpnia 2026.

## 1. MAPY STANÓW

### Dokumenty operacyjne

| Maszyna | Statusy i przejścia | Kto zmienia | Główni strażnicy |
|---|---|---|---|
| Zamówienie zakupu | `draft → sent/cancelled`; `sent → draft/confirmed/cancelled`; `confirmed → partially_received/received/cancelled`; `partially_received → received/cancelled`; terminalne `received/cancelled` | akcje PO i receipt w [actions.ts:991](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:991>) | aktywny dostawca, UOM, ilości przyjęte, brak przyjęć przy cofnięciu |
| Zlecenie przesunięcia magazynowego | `draft → in_transit/cancelled`; `in_transit → partially_received/received/cancelled`; `partially_received → received/cancelled` | akcje transferu w [actions.ts:836](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/actions.ts:836>) | wysyłka/odbiór wykonują ruch LP; odbiór możliwy dopiero po wysyłce; kontrola zachowania ilości |
| Planistyczny łańcuch WO | `DRAFT → RELEASED/CANCELLED`; `RELEASED → CANCELLED` | `releaseWorkOrder`, `cancelWorkOrderChain` | kontrola członków łańcucha i statusów; wada transakcyjna opisana niżej |
| Produkcyjne WO | `planned → in_progress/cancelled`; `in_progress → paused/completed/cancelled`; `paused → in_progress/cancelled`; `completed → closed/cancelled`; `closed/cancelled` terminalne | centralna maszyna w [wo-state-machine.ts:46](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/wo-state-machine.ts:46>) | CAS na bieżącym statusie, changeover, holds, ilości, podpisy i zamknięcie finansowe zależnie od operacji |
| Zamówienie sprzedaży | `draft → confirmed/cancelled`; `confirmed → allocated/cancelled`; `allocated → partially_picked/picked/cancelled`; `partially_picked → picked/cancelled`; `picked → shipped/cancelled`; `shipped → partially_delivered/delivered`; `partially_delivered → delivered` | `transitionSalesOrder` oraz akcje alokacji/pick/ship | legalna krawędź; dodatkowe warunki tylko dla części przejść. Generyczne `picked → shipped` jest wadliwe |
| Wysyłka | `pending/packing → packed`; `packed → packing/manifested/shipped`; `manifested → packing/shipped`; `shipped → delivered`; wcześniejsze statusy mogą być anulowane | create/pack/seal/unpack/ship/deliver | kompletność pudeł, LP, podpisany BOL, POD/e-sign; osobna niespójność z SO przed `ship` |
| RMA | `pending → approved → received → processed → closed`; `receiving` jest dozwolony w schemacie/akcji odbioru, ale nie znalazłem akcji, która go ustawia | approve, receive, process, close w `rma-actions.ts` | status nagłówka i uprawnienia; `process` nie wymusza skutku magazynowego/jakościowego |
| Inwentaryzacja | deklarowane `open → counting → review → closed/cancelled`; linie `pending → counted → approved/applied/rejected` | create, record, approve/apply, close | zapis wymaga `counting`, zamknięcie `review`; brak implementacji przejścia z `open` |
| NCR | `draft/open/reopened → investigating`; nie-terminalny → `closed`; schemat obejmuje też `awaiting_capa/cancelled` | create/update/close w `ncr-actions.ts` | uprawnienie, root cause, e-sign; brak związania zamknięcia ze statusem linked hold |
| Blokada jakościowa | `open/investigating/quarantined/escalated → released`; tworzenie zwykle daje `open` | `hold-actions.ts` | uprawnienie, SoD, podpisy, critical hold; brak strażnika otwartej powiązanej NCR |
| Inspekcja jakościowa | `pending → in_progress → passed/failed/on_hold`; `on_hold` może dostać kolejną decyzję | record/decision actions | kompletność specyfikacji, uprawnienia, podpis; aktywny hold blokuje release LP |
| Specyfikacja jakościowa | `draft → under_review → active`; stary `active → superseded` | `spec-actions.ts` | role, walidacja wersji i podpis aktywacji |
| GRN | `draft → completed/cancelled`; `completed` korygowany kontrolowaną ścieżką anulowania/reversal | receiving actions i ograniczenia DB | ruchy LP, zamrożenie pozycji zakończonego GRN, kontrolowana korekta |
| LP / stan magazynowy | `received/available/reserved/allocated/consumed/blocked/merged/shipped/returned/quarantine/destroyed`; jakość `pending → released/on_hold/rejected` | receiving, allocation, production, quality, shipping, corrections | stan ilości, holds, terminalność LP i kontekst organizacji |
| MWO utrzymania ruchu | `requested/approved → cancelled`; `open → in_progress/cancelled`; `in_progress → completed/cancelled` | `mwo-actions.ts` | rozpoczęcie wymaga LOTO tam, gdzie obowiązuje; zakończenie wymaga zwolnienia zabezpieczeń |

### Rozwój produktu i dane techniczne

| Maszyna | Statusy i przejścia | Strażnicy |
|---|---|---|
| Bramki NPD | etapy `brief → recipe → packaging → costing_nutrition → trial → sensory → pilot → approval → handoff → launched`; bramki `G0 → G1 → G2 → G3 → G4 → Launched`; istnieje revert o jedną bramkę | sąsiedniość, wymagane dowody, formalne approvals; revert unieważnia wcześniejsze zatwierdzenie |
| Wersja formulacji | `draft → locked`; `locked → submitted_for_trial`; `locked → draft` przez unlock | blokada edycji, uprawnienie, podpis przy unlock |
| Ryzyko NPD | `open → mitigated → closed`; `closed → open` | powód i dane zamknięcia; reopen czyści `closed_at/closed_by` |
| Factory release | `pending_npd_release → pending_technical_approval → approved_for_factory → released_to_factory`; możliwy `blocked` | dowody NPD/technical i role |
| BOM techniczny | `draft → review/technical_approved/active/archived`; `review → draft/technical_approved/active/archived`; `technical_approved → active/superseded/archived`; `active → superseded/archived`; `superseded → archived` | trigger DB odrzuca nielegalne krawędzie |
| HACCP | plan `draft → active`; poprzedni aktywny plan → `superseded` | aktywacja atomowo superseduje poprzednią wersję i wymaga podpisu |
| Odchylenie CCP | `open → resolved` | sign-off i dane rozstrzygnięcia |
| Changeover | `pending → first_signed → complete` | dwa różne podpisy/role; sama maszyna jest poprawna, ale konsument wyniku w `start-wo` jest wadliwy |

### Maszyny znalezione tylko częściowo lub wyłącznie w schemacie

| Obiekt | Zadeklarowane statusy | Stan implementacji |
|---|---|---|
| Inter-site transfer | `draft/approved/shipped/in_transit/received/cancelled` | znalazłem schemat, ale nie pełny operatorowy writer |
| Rekord BOL | `draft/issued/signed/cancelled` | właściwy shipping korzysta głównie z BOL przypisanego do shipment; osobna tabela nie ma pełnej ścieżki UI |
| Pilot NPD | `planned/in_progress/completed` | schemat istnieje; nie odtworzyłem pełnej ścieżki operatora |
| Complaint | `open/investigating/converted/closed` | część akcji istnieje, ale nie wykonywałem pełnego audytu efektów integracyjnych |
| CAPA | `open/in_progress/closed` | analogicznie: niepełny audyt efektów |
| Pick list / alokacja | lista `pending/assigned/in_progress/completed/cancelled`; linie `pending/picked/short`; alokacja `allocated/picked/released/cancelled` | podstawowe writers istnieją; wave state jest częściowo schema-only |

## 2. ŚLEPE ZAUŁKI

### 2.1. Krytyczne: każda nowa inwentaryzacja jest tworzona w statusie, z którego UI nie potrafi jej ruszyć

Schemat dopuszcza pięć statusów:

[318-stock-count-adjustments.sql:13](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/318-stock-count-adjustments.sql:13>)

```sql
status text not null default 'open'
  check (status in ('open', 'counting', 'review', 'closed', 'cancelled'))
```

Tworzenie jawnie zapisuje `open`:

[count-actions.ts:938](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:938>)

```ts
insert into public.count_sessions (
  org_id, warehouse_id, count_type, status
)
values ($1, $2, $3, 'open')
```

Zapis wyniku wymaga jednak `counting`:

[count-actions.ts:1060](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1060>)

```ts
const sessionRow = session.rows[0];
if (!sessionRow) {
  throw new Error('count_session_not_found');
}
if (sessionRow.status !== 'counting') {
  throw new Error('count_session_not_open');
}
```

Zamknięcie wymaga `review`:

[count-actions.ts:1435](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1435>)

```ts
if (current.rows[0]?.status !== 'review') {
  throw new Error('count_session_not_in_review');
}
```

Nie znalazłem żadnego writera ustawiającego `count_sessions.status` na `counting` albo `review`. UI mimo tego pokazuje edycję pozycji i przycisk zamknięcia dla każdego statusu poza `closed/cancelled`:

[count-session-detail.client.tsx:224](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_components/count-session-detail.client.tsx:224>)

```tsx
const sessionClosed =
  session.status === 'closed' || session.status === 'cancelled';

{closeSessionAction && !sessionClosed ? (
  <CloseSessionBar ... />
) : null}
```

Sekwencja:

1. Operator tworzy inwentaryzację.
2. Rekord powstaje jako `open`.
3. Operator wpisuje ilość i naciska zapis — dostaje `count_session_not_open`.
4. Naciska „Close session” — dostaje `count_session_not_in_review`.
5. Nie ma przycisku „Start counting” ani „Send to review”.

Operator widzi otwartą sesję i pozycje do wpisania, lecz nie może zapisać liczenia ani jej zamknąć. Rekord pozostaje `open` bez standardowej drogi wyjścia.

Testy:

- [count-actions.test.ts:1054](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.test.ts:1054>) wręcz potwierdza, że `open` jest odrzucany, a `counting` akceptowany.
- [count-actions.test.ts:1143](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.test.ts:1143>) sprawdza zamknięcie wyłącznie z `review`.
- Test UI używa sesji `open`, ale mockuje akcję zapisu, więc nie ujawnia sprzeczności z serwerem.
- To zwykłe testy `.test.ts/.tsx`, bez znalezionego warunku `DATABASE_URL`; nie uruchamiałem ich, więc ich realnego wyniku nie potwierdzam. Test `.tsx` wymaga właściwego `vitest.ui.config.ts`.

### 2.2. Wysokie: WO z wymaganiem segregacji nie ruszy nawet po zakończeniu changeoveru

Start WO najpierw rozpoznaje nieukończone zdarzenie changeover przez:

[start-wo.ts:376](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/start-wo.ts:376>)

```sql
and dual_sign_off_status not in ('complete', 'completed')
```

Jednak niezależnie od tego bezwarunkowo blokuje zamrożony snapshot:

[start-wo.ts:189](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/start-wo.ts:189>)

```ts
if (wo.allergen_profile_snapshot?.segregation_required === true) {
  return fail('changeover_signoff_required', {
    message: 'A completed dual-sign changeover is required before start.',
    details: {
      code: 'segregation_required',
    },
  });
}
```

Po drugim podpisie event ma `complete`, więc przestaje być „otwartym” eventem, ale `segregation_required` w snapshotcie nadal wynosi `true`. Kod nie łączy tych dwóch faktów.

Sekwencja:

1. Planista zwalnia WO z profilem `segregation_required=true`.
2. Operator tworzy changeover.
3. Pierwsza i druga osoba podpisują go; status changeoveru staje się `complete`.
4. Operator naciska Start WO.
5. Start nadal odpowiada `changeover_signoff_required / segregation_required`.

Operator widzi zakończony, podwójnie podpisany changeover, ale nie może uruchomić produkcji. Może jedynie porzucić/anulować WO — brak drogi do realizacji.

Testy:

- test changeoveru sprawdza osiągnięcie `complete`;
- test startu sprawdza osobno blokadę przy snapshotcie `true`;
- test dopuszczający ukończony event używa fixture ze snapshotem `false`;
- nie znalazłem testu kombinacji `segregation_required=true` oraz ukończony event;
- są to zwykłe testy `.test.ts`; nie zostały uruchomione.

## 3. PRZEJŚCIA WSTECZNE BEZ COFNIĘCIA SKUTKÓW

### 3.1. Wysokie: anulowanie WO pozostawia zużyty materiał, a naprawa jest później zabroniona

Zużycie zmniejsza LP i zwiększa `wo_materials.consumed_qty`:

[consume-material-actions.ts:765](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts:765>)

```ts
update public.license_plates
set quantity = quantity - $3,
    status = case
      when quantity - $3 = 0 then 'consumed'
      else status
    end
```

```ts
update public.wo_materials
set consumed_qty = consumed_qty + $4
```

Anulowanie aktywnego WO sprawdza output LP, wykonuje przejście do `cancelled`, ale nie odwraca zużycia materiałów:

[complete-cancel-wo.ts:496](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/complete-cancel-wo.ts:496>)

```ts
if (previousStatus === 'in_progress' || previousStatus === 'paused') {
  liveOutputLps = await loadLiveOutputLps(client, orgId, workOrderId);
}

const transition = await applyTransition({
  verb: 'cancel',
  ...
});

const reservationsReleased: string[] = [];
```

Kod zwracania materiału istnieje w korektach, ale polityka blokuje go po anulowaniu:

[correct-ledger-entry.ts:130](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/corrections/correct-ledger-entry.ts:130>)

```ts
if (woStatus === 'cancelled') {
  throw new CorrectionPolicyError(
    'cancelled_wo_correction_forbidden',
  );
}
```

Sekwencja:

1. Operator uruchamia WO.
2. Zużywa np. 10 kg surowca.
3. Nie rejestruje jeszcze gotowego output LP.
4. Anuluje WO.
5. WO przechodzi do `cancelled`.
6. LP surowca nadal ma ilość pomniejszoną o 10 kg, a `consumed_qty` pozostaje zwiększone.
7. Próba „Reverse consumption” jest odrzucana, bo WO jest anulowane.

Operator widzi anulowane WO, ale zapas nadal jest skonsumowany. Standardowa ścieżka naprawy jest zamknięta.

Testy:

- integracyjny test cyklu WO anuluje WO po starcie, ale bez wcześniejszego zużycia;
- [wo-lifecycle.integration.test.ts:31](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/tests/wo-lifecycle.integration.test.ts:31>) wybiera `describe.skip` bez `DATABASE_URL`;
- test anulowania completed WO dotyczy output LP, nie zużytych komponentów;
- nie uruchamiałem żadnego z nich.

### 3.2. Wysokie: nieudane zatwierdzenie korekty inwentaryzacji utrwala podpis operatora

Granica transakcji potwierdza właściwość wskazaną w pytaniu:

[with-org-context.ts:350](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/with-org-context.ts:350>)

```ts
const result = await action(client, context);
await client.query('commit');
return result;
```

Rollback następuje dopiero w `catch`.

W zatwierdzeniu inwentaryzacji podpis operatora jest zapisywany przed weryfikacją PIN-u przełożonego:

[count-actions.ts:1248](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1248>)

```ts
const signatureReceipt = await signEvent({
  ...
});

const supervisorResult = await assertSupervisorApproval(...);

if (
  supervisorResult === 'supervisor_pin_locked' ||
  supervisorResult === 'supervisor_pin_invalid'
) {
  return {
    kind: 'supervisor_pin_reject',
    code: supervisorResult,
  };
}
```

Dopiero poza `withOrgContext` wynik jest zamieniany na wyjątek:

[count-actions.ts:1421](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_actions/count-actions.ts:1421>)

```ts
if (txnOutcome.kind === 'supervisor_pin_reject') {
  throw new Error(txnOutcome.code);
}
```

Zwykły `return` zdążył już spowodować `COMMIT`. Zewnętrzny wyjątek nie może go cofnąć.

Sekwencja:

1. Operator zatwierdza policzoną ujemną różnicę.
2. Podaje prawidłowe własne hasło.
3. Wybiera przełożonego i podaje błędny lub zablokowany PIN.
4. System zapisuje e-sign operatora.
5. Zwraca zwykły wynik `supervisor_pin_reject`, więc transakcja commitnie.
6. UI pokazuje błąd PIN-u; korekta nie jest wykonana, ale podpis pozostaje ważnym wpisem audytowym.

Test nieprawidłowego PIN-u sprawdza brak zmiany LP, lecz mockuje `signEvent` i nie sprawdza, czy podpis oraz transakcja zostały cofnięte. Zwykły `.test.ts`, nieuruchomiony.

## 4. NIEZGODNOŚCI MIĘDZY MODUŁAMI

### 4.1. Wysokie: quality hold może zostać zwolniony przy otwartej powiązanej NCR

NCR zapisuje prawdziwe powiązanie:

[ncr-actions.ts:794](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/ncr-actions.ts:794>)

```ts
insert into public.ncr_reports (
  ...,
  status,
  linked_hold_id
)
values (
  ...,
  'open',
  $...
)
```

Zwolnienie holda sprawdza status, krytyczność, SoD i podpisy, ale nie wykonuje zapytania do `ncr_reports`, po czym ustawia:

[hold-actions.ts:912](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:912>)

```ts
update public.quality_holds
set hold_status = 'released',
    released_at = now(),
    released_by = $3
```

Jeżeli nie ma innego aktywnego holda, powiązany LP może wrócić do użycia. W przeciwną stronę `closeNcr` również nie sprawdza statusu `linked_hold_id`.

Sekwencja:

1. Jakość zakłada hold na LP.
2. Zakłada NCR powiązaną przez `linked_hold_id`.
3. NCR pozostaje `open` lub `investigating`.
4. Uprawniony użytkownik podpisuje i zwalnia hold.
5. Hold ma `released`, a LP może stać się dostępny mimo otwartego dochodzenia.

Operator magazynu może pobrać, zużyć albo wysłać materiał, który w module NCR nadal jest przedmiotem otwartego dochodzenia.

Testy release hold sprawdzają e-sign i podstawowe warunki, ale nie otwartą linked NCR. Test [hold-disposition-safety.pg.test.ts:43](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-disposition-safety.pg.test.ts:43>) jest warunkowo pomijany bez `DATABASE_URL` i również nie pokrywa tej relacji. Nie został uruchomiony.

### 4.2. Wysokie: RMA „Restock” i „Quality hold” nie robią nic w odpowiednim module

UI dla otrzymanego RMA oferuje m.in. Restock, Scrap i Quality hold:

[rma-detail-view.tsx:120](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/rma/_components/rma-detail-view.tsx:120>)

Akcja jedynie oznacza RMA i jego linie jako przetworzone:

[rma-actions.ts:556](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/rma/_actions/rma-actions.ts:556>)

```ts
update public.rma_requests
set status = 'processed',
    disposition = $2
where id = $1
  and status = 'received'
```

```ts
update public.rma_lines
set disposition = $2
where rma_id = $1
```

Następnie emituje wyłącznie:

```ts
await emitOutboxEvent(..., 'shipping.rma.processed', {
  disposition,
});
```

Nie znalazłem konsumenta tego eventu ani zapisu tworzącego LP, ruch magazynowy lub `quality_holds`.

Sekwencja:

1. RMA zostaje zatwierdzone i przyjęte.
2. Operator wybiera „Restock”.
3. RMA przechodzi do `processed`.
4. Ilość magazynowa się nie zwiększa i nie powstaje LP.

Dla „Quality hold” efekt jest analogiczny: RMA ma taką dyspozycję, ale nie powstaje blokada jakościowa.

Operator widzi zakończoną dyspozycję, podczas gdy magazyn albo jakość nie mają odpowiadającego jej faktu.

`rma-actions.test.ts` importuje i sprawdza tworzenie, zatwierdzenie i listowanie RMA; nie znalazłem testów `receiveRma`, `processRma` ani `closeRma`. Testy nie zostały uruchomione.

### 4.3. Średnie: shipment jest `packing/packed`, podczas gdy SO nadal pozostaje `picked`

Utworzenie shipmentu zapisuje go od razu jako `packing`, lecz nie aktualizuje SO:

[pack-actions.ts:234](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts:234>)

```ts
insert into public.shipments (..., status, ...)
values (..., 'packing', ...)
```

Seal zmienia shipment na `packed`, również bez przejścia SO. Tymczasem kod wyliczania statusu SO mówi:

[so-transitions.ts:127](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-transitions.ts:127>)

```ts
if (packedCount > 0 && packingCount === 0) {
  return 'packed';
}
if (packedCount > 0 || packingCount > 0) {
  return 'partially_packed';
}
```

Sekwencja:

1. SO ma `picked`.
2. Operator tworzy shipment — shipment ma `packing`, SO nadal `picked`.
3. Pakuje i seal-uje wysyłkę — shipment ma `packed`, SO nadal `picked`.
4. Dopiero właściwe Ship aktualizuje SO.

Operator w widoku zamówienia widzi „picked”, a w wysyłce „packed”. Dwa moduły opisują ten sam proces inaczej.

Test `ship-actions.test.ts` jawnie dopuszcza wysyłkę, gdy SO nadal jest `picked`; test wyliczania statusu istnieje osobno, ale nie jest podłączony do pack/seal. Testów nie uruchamiałem.

### 4.4. Wysokie przy wyścigu: anulowanie łańcucha WO może commitnąć tylko część łańcucha

Członkowie są pobierani bez `FOR UPDATE`, a następnie anulowani pojedynczo:

[releaseWorkOrder.ts:388](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/releaseWorkOrder.ts:388>)

```ts
for (const member of members) {
  const updated = await client.query(
    `update public.work_orders
     set status = 'CANCELLED'
     where id = $1
       and status in ('DRAFT', 'RELEASED')
     returning id`,
    [member.id],
  );

  if (!updated.rows[0]) {
    return { ok: false, error: 'invalid_state' };
  }
}
```

Ponieważ jest to zwykły `return` wewnątrz `withOrgContext`, wcześniejsze anulowania zostaną commitnięte.

Sekwencja:

1. Użytkownik A rozpoczyna anulowanie łańcucha root + child.
2. Preflight widzi oba rekordy jako `DRAFT/RELEASED`.
3. A anuluje najpierw child.
4. Równolegle użytkownik B uruchamia albo zmienia root.
5. Aktualizacja root przez A nie pasuje już do warunku statusu.
6. A dostaje `invalid_state`, ale anulowany child zostaje commitnięty.

Operator widzi błąd całej operacji, mimo że część łańcucha jest już terminalnie anulowana, a root pozostaje aktywny.

Testy obejmują happy path i konflikt wykryty przed pętlą; nie znalazłem testu późnego CAS miss po wcześniejszym udanym zapisie. Zwykły `.test.ts`, nieuruchomiony.

### 4.5. Średnie: odbiór RMA może częściowo zapisać linie mimo zwróconego błędu

Odbiór aktualizuje linie w pętli:

[rma-actions.ts:491](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/rma/_actions/rma-actions.ts:491>)

```ts
for (const line of lines) {
  const updated = await client.query(
    `update public.rma_lines
     set received_qty = $3
     where id = $1 and rma_id = $2`,
    ...
  );

  if (!updated.rowCount) {
    return { ok: false, error: 'not_found' };
  }
}
```

Przy nieaktualnym lub wyścigowym żądaniu pierwsze linie mogą zostać zapisane, a późniejsza brakująca linia powoduje zwykły `return` i `COMMIT`. Status nagłówka pozostaje poprzedni, bo jest aktualizowany dopiero po pętli.

To wymaga stale/raced/tampered requestu; zwykły świeży formularz nie powinien sam wytworzyć takiego payloadu. Nie znalazłem testu odbioru RMA.

## 5. BRAKI STRAŻNIKÓW

### 5.1. Generyczna akcja SO pozwala ustawić `picked → shipped` bez shipmentu, BOL i ruchu LP

Mapa legalnych przejść zawiera:

[so-transitions.ts:52](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-transitions.ts:52>)

```ts
picked: ['shipped', 'cancelled'],
```

Publiczna akcja sprawdza uprawnienie i legalność krawędzi. Specjalne guardy ma dla `confirmed` i `cancelled`, ale nie dla `shipped`, po czym zapisuje nowy status:

[so-actions.ts:427](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:427>)

Standardowy UI szczegółów SO nie pokazuje przycisku „shipped”; oferuje głównie confirm/cancel. Ścieżka wymaga więc wywołania/replay publicznej Server Action przez użytkownika mającego `ship.so.create` albo przyszłego błędnego callera.

Sekwencja:

1. SO osiąga `picked`.
2. Uprawniony użytkownik wywołuje `transitionSalesOrder(..., 'shipped')`.
3. SO staje się `shipped`, mimo że nie istnieje packed shipment, BOL ani wysłane LP.

Operator widzi wysłane zamówienie bez fizycznego lub regulacyjnego dowodu wysyłki.

Test mapy tylko potwierdza, że `picked → shipped` jest legalne „gdy ship confirm zakończy operację”. Nie sprawdza, czy generyczna akcja wymaga tego potwierdzenia. Zwykły test, nieuruchomiony.

### Kontrola przeciwna: właściwa akcja wysyłki ma wymagane strażniki

Dedykowana ścieżka Ship robi to poprawnie:

[ship-actions.ts:400](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:400>)

```ts
if (
  !shipment ||
  shipment.status !== 'packed' ||
  !shipment.sales_order_id ||
  shipment.box_count < 1
) {
  throw new Error('shipment_not_ready');
}
```

Następnie wymaga LP i podpisanego BOL:

```ts
if (lpIds.length === 0) {
  throw new Error('shipment_has_no_license_plates');
}

await assertSignedBolForPayload(...);
```

Dopiero po tych kontrolach przeprowadza shipment z `packed` do `shipped` i synchronizuje SO. To potwierdza, że konwencją repo jest strażnik domenowy przed przejściem; generyczne `transitionSalesOrder` omija tę konwencję.

### 5.2. Hold/NCR: strażniki lokalne są, strażnika relacji nie ma

`releaseHold` ma podpisy, SoD i kontrolę critical hold, ale brakuje sprawdzenia:

```sql
not exists (
  select 1
  from ncr_reports
  where linked_hold_id = $hold
    and status not in ('closed', 'cancelled')
)
```

Analogicznie `closeNcr` nie sprawdza, czy linked hold został rozwiązany lub zwolniony. To jest brak strażnika między modułami, nie brak podstawowej autoryzacji.

## 6. CO WYSZŁO CZYSTO

„Czysto” oznacza: w prześledzonych ścieżkach nie znalazłem dowodu na jedną z czterech klas błędów. Nie jest to gwarancja braku innych defektów.

- Zamówienia zakupu i przyjęcia: przejścia są ograniczone, a cofnięcie do draftu wymaga braku przyjęć.
- Planistyczne zlecenie przesunięcia: docelowy odbiór wymaga wcześniejszego `in_transit/partially_received`; ruchy LP i ilości są powiązane. Nie potwierdziłem przykładu „received bez shipped”.
- Centralna maszyna statusów WO: legalne krawędzie i CAS są spójne; CAS miss rzuca wyjątek, więc nie commitnie osieroconego eventu.
- Zamknięcie WO: aktywne holds blokują zamknięcie, a podpis i status są w tej samej transakcji.
- Hipotezę „WO closed przy output QA pending” odrzuciłem jako błąd: kod traktuje `closed` jako zamknięcie produkcyjno-finansowe, a QA release jako osobny workflow; nie znalazłem kontraktu wymagającego automatycznego `released`.
- Bramki NPD: sąsiedniość jest kontrolowana, a revert unieważnia wcześniejsze zatwierdzenie zamiast pozostawiać je aktywnym.
- Ryzyka NPD: reopen czyści dane zamknięcia.
- Formulacje i factory release: sprawdzone krawędzie mają role, blokady lub podpisy.
- Changeover dual sign: sama maszyna `pending → first_signed → complete` jest poprawna; błąd znajduje się w `start-wo`, który nie uznaje jej wyniku.
- MWO/LOTO: start i completion mają kontrolę zabezpieczeń.
- Inspekcja jakościowa, aktywacja specyfikacji, HACCP i CCP deviation: sprawdzone decyzje mają wymagane kompletności oraz e-sign.
- BOM techniczny: nielegalne krawędzie odrzuca trigger DB.
- GRN: zakończony dokument i jego pozycje są chronione, a reversal jest osobną kontrolowaną operacją.
- Dedykowana akcja Ship: packed shipment, LP i podpisany BOL są wymagane.
- `delivered → partially_delivered` w SO odrzuciłem jako samodzielny dowód błędu; w kodzie odpowiada korekcie/agregacji wielu shipmentów i bez dodatkowego kontraktu nie dowodzi nielegalnego cofnięcia.

## 7. CZEGO NIE SPRAWDZIŁEM

- Nie potwierdziłem wyników żadnego testu. Wszystkie określenia „test istnieje” oznaczają wyłącznie statyczną inspekcję pliku.
- Nie uruchomiłem testów `*.pg.test.ts`. Jeżeli `DATABASE_URL` nie jest ustawione, odnalezione pliki używają `describe.skip`, więc raport testów może pokazać suite jako pominięty zamiast rzeczywiście wykonany.
- Nie uruchomiłem migracji ani triggerów na żywej bazie. Ocena SQL pochodzi z plików.
- Nie prześledziłem do końca schema-only lub częściowo zaimplementowanych maszyn: inter-site transfer, osobny rekord BOL, pilot NPD, wave state, complaint i CAPA.
- Nie audytowałem backgroundowych stanów jobów: MRP, scheduler, raporty, import/export i outbox retry. Nie są one dokumentami operatora wymienionymi w pytaniu.
- Nie weryfikowałem realnego przypisania ról konkretnym użytkownikom ani zachowania polityk RLS w uruchomionym Postgresie.
- Nie rozstrzygałem różnic względem `main` lub wdrożenia produkcyjnego, ponieważ working tree zawierał wiele wcześniejszych zmian użytkownika.
