# P0 — anulowania wysłanej wysyłki NIE DA SIĘ WYKONAĆ. Towar nie wraca na stan.

Znalezione 19:52, ostatnim torem dnia. **Dowód behawioralny na prawdziwych wywołaniach akcji.**

## Objaw

| akcja | wejście | oczekiwane | rzeczywiste |
|---|---|---|---|
| `cancelShipment` na wysyłce w stanie „wysłana" | anulowanie z PIN-em | zwrot towaru na stan | **`persistence_failed`; paleta zostaje 4, wysyłka zostaje „wysłana"** |
| `recordPod` | potwierdzenie dostawy z PIN-em | zapis potwierdzenia | **`persistence_failed`; zero wpisów audytowych** |

Towar **nie wraca na stan żadną ścieżką**. Dostawy **nie da się potwierdzić**.

## Przyczyna — jedna linia, dwa razy

```
ship-actions.ts:207     if (typeof auditId !== 'number') throw new ActionError('persistence_failed');
cancelShipment.ts:369   if (typeof auditId !== 'number') throw new ActionError('persistence_failed');
```

Kolumna `audit_events.id` jest typu **bigint**, a sterownik `node-postgres` zwraca bigint
**jako łańcuch znaków** — to jego zachowanie domyślne i w repo **nie ma żadnego `setTypeParser`**,
który by to zmieniał. Warunek nigdy nie jest spełniony, więc **każde** wywołanie rzuca
i wycofuje całą transakcję.

Ten sam zapis audytu jest w `unpackShipment` i `voidPod` — **niemal na pewno padają tak samo**
(niezweryfikowane).

## Dlaczego to przeżyło — test istnieje i NIGDY SIĘ NIE WYKONAŁ

W repo jest test `wave8-shipping-integrity.pg.test.ts`, który **asercjonuje dokładnie to,
co nie działa**: że anulowanie po wysyłce zwraca towar. Uruchomiłem go osobiście:

```
app/.../shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts (7 tests | 7 skipped)
 Test Files  1 failed (1)
      Tests  7 skipped (7)
```

**Siedem testów pominiętych, zero wykonanych.** To dokładnie ten sam kształt, który dziś rano
ukrył **18 testów bezpieczeństwa** (bramka na nazwie bazy) i który powtórzył się przy teście
uprawnień. **Trzecie wystąpienie „zielony przez pominięcie" w ciągu jednego dnia.**

Suita mówi „pokryte". Pokrycie nigdy nie zostało wykonane. Defekt przeszedł.

## Co jest szczelne — 9 z 11 ścieżek

To ważne, bo pokazuje, że moduł nie jest zepsuty jako całość:

- **nadpakowanie odrzucone** (alokacja 6, próba 8), a dokładnie 6 przechodzi
- **wysyłka ponad stan** odrzucona atomowo — paleta i wysyłka bez zmian
- **partia po terminie, niezwolniona jakościowo i objęta blokadą** — odrzucone przy pakowaniu,
  wszystkie trzy warianty
- **termin, który minął PO spakowaniu** — złapany ponownie przy wysyłce, z wycofaniem
- **dokument dostawy generowany ze SPAKOWANYCH pozycji, nie z zamówionych** (zamówione 9,
  alokowane 6, spakowane 4 → dokument pokazuje 4)
- **ślad ruchu przy wysyłce** kompletny: paleta 10→4, wpis w rejestrze, alokacja wyzerowana,
  zamówienie przestawione

Priorytetowy obszar — partia i identyfikowalność — **wypadł szczelnie w trzech wariantach**.

## Czego nie ustalono

- Anulowanie **przed** wysyłką — niewywołane, ale idzie przez ten sam zapis audytu
- `unpackShipment` i `voidPod` — jak wyżej
- Zwroty i kompletacja — poza budżetem czasu
- Przyczyna wykazana dowodem typu (`typeof id === 'string'` z żywej bazy) i eliminacją,
  bez krokowania po samym kodzie akcji
