# Raport Fal 7 i 8 — noc 2026-07-28/29

**Commit:** `5b1a5187` · **Wdrożenie:** `dpl_DaDrrJNppnxQo7q5vgKuBqw9of8m` · **Migracja:** 527

Obie fale poszły w jednym commicie. Powód: ich tory pracowały w tym samym drzewie
roboczym i zmiany są przeplecione w tych samych modułach (warehouse,
purchase-orders, scanner). Rozdzielanie po ścieżkach było bezpośrednią przyczyną
niekompilującego się commita Fali 6 — nie powtarzam tego.

## Bramka

| Krok | Wynik |
|---|---|
| `pnpm -r typecheck` | ✅ czysty (po naprawie 2 błędów wykrytych w pierwszym przebiegu) |
| Suita rdzenia | ✅ 4513 zielonych / 49 czerwonych — **+64 wobec bazy**, 2 regresje znalezione i naprawione |
| Suita UI | ✅ 3460 zielonych / 110 czerwonych — **+50 wobec bazy**, 5 „regresji": 3 realne (naprawione), 2 flaki |
| `pnpm --filter web build` | ✅ przechodzi |
| PREPARE mig 527 | ✅ 3× pod rząd, post-check zielony |

Baza odniesienia: `f7-base-core.json` / `f7-base-ui.json` (stan sprzed Fali 7).
Porównanie zbiorów czerwonych plików, nie samych liczb — liczba potrafi kłamać,
gdy jeden plik zyska testy, a inny je straci.

## Co bramka złapała, a czego nie złapałby żaden przegląd diffu

**1. Crash w produkcyjnej ścieżce rejestracji produkcji.**
Runda poprawek Fali 7 dodała do `upsertWac` wyliczanie różnicy „po minus przed"
w mikro-jednostkach. `toMicro` dostawał `undefined` i wywracał się na `.trim()`,
przewracając `registerOutput`. Funkcja ma **udokumentowany kontrakt** tuż nad
kodem: *„śmieci są poza dziedziną NUMERIC — traktuj jak 0, nigdy nie zatruwaj
matematyki NaN-em"* — a mimo to rzucała dla `null`/`undefined`, czyli dokładnie
tej klasy śmieci. Naprawione u źródła (kontrakt), nie w miejscu wywołania —
chroni to wszystkich wołających, nie tylko ten jeden.

**2. Przeblokowanie w guardzie zapasu na lokalizacji.**
Nowy guard „nie kasuj lokalizacji z żywym towarem" blokował też legalne
przeniesienie wiersza pod nieaktywnego rodzica i dezaktywację rodzica, którego
dzieci są już puste. Trzy zielone testy zrobiły się czerwone. To ta sama klasa,
którą kampania łapała już kilka razy: guard chroniący jeden przypadek zamraża
sąsiednie.

**3. Dwa „regresy", które nimi nie były.**
`to-bulk-import-view` i `wo-bulk-import-view` wypadły czerwone w przebiegu
równoległym — obie poza zakresem fal. Przebieg szeregowy: **zielone**. To flaki
od obciążenia (suita leciała, gdy dwa silniki pisały po plikach). Gdybym zgłosił
je jako regresje, wysłałbym silniki naprawiać coś, co działa.

## Znaleziska cross-review warte zapamiętania

- **Klucz idempotencji splitu nie obejmował ładunku.** Modal trzyma `clientOpId`
  przez całe otwarcie, a pole celu zostaje edytowalne. Sekwencja: wyślij 4 kg do
  boksu A → odpowiedź ginie → operator zmienia cel na B i ponawia → replay →
  `ok: true`, modal zamyka się **raportując B dla palety stojącej w A**.
  Atrapa w teście trzymała replay jako jeden globalny boolean, co **ukryłoby
  dokładnie ten bug** — przerobiona na mapę po kluczu.
- **`{uom}` dwa razy w szablonie, `replace` raz.** Szablon `wac_unresolved_uom`
  nazywa jednostkę dwukrotnie; `.replace()` podmienia tylko pierwsze wystąpienie,
  więc operator dostawał drugie jako dosłowne `{uom}`.
- **Migracja 527 oznaczyłaby zadania ZPL z okna wdrożenia jako PDF.** Ta sama
  klasa okna, którą Fala 6 domknęła triggerem — i tak samo domknięta.
- **Potencjalne P0, które się NIE zmaterializowało:** tor naprawiający rewizytę
  przyjętej linii mógł poszerzyć `OPEN_PO_STATUSES`, współdzieloną ze ścieżką
  zapisu — co odblokowałoby przyjmowanie towaru na zamkniętym zamówieniu.
  Sprawdziłem diff: stała **nietknięta**, tor wybrał odrębną odpowiedź.

## Wzorzec kosztowy tego flow (nazwany, nie incydent)

Tory **piszą testy, których nie uruchamiają** — ten zakaz jest celowy i chroni
pipeline przed padaniem pod obciążeniem. Skutek jest systematyczny. W samej
Fali 8: 3 testy deterministycznie czerwone, 1 importujący nieistniejący moduł,
1 niesprawdzający tego, co obiecuje w nazwie, 2 deklarowane w raporcie i
nieobecne w patchu.

To **stały koszt**, nie wpadka konkretnego toru. Bramka i cross-review go
wyłapują, nic nie przecieka na produkcję — ale trzeba go budżetować czasowo.
Alternatywa (pozwolić torom uruchamiać testy) była już raz udowodnioną przyczyną
ubijania zadań, więc do niej nie wracam.

## Świadomie niezamknięte

- **N-10** — diagnostyka z akcji ZZ (`message`, np. *„linia 3 (OIL-001): jednostka
  »l« nie ma przelicznika na kg"*) nigdy nie trafia na ekran; użytkownik widzi
  komunikat ogólny i nie wie, która linia blokuje wysyłkę. Poprawka to jedna
  linia, ale wymaga decyzji, czy pokazywać nieprzetłumaczony tekst serwera w
  interfejsie czterojęzycznym. Nie podejmuję tej decyzji sam o 00:30.
- **Atrapa etykiet w `po-receive-line.test.tsx` odstała od komponentu** — brakuje
  `taxPct`, `netTotal`, `taxTotal`, `destinationWarehouse`. 19 czerwonych testów.
  **To nie jest regresja tej nocy** — plik był czerwony już w bazie. Zweryfikowałem,
  że produkcja jest bezpieczna: prawdziwa strona podaje wszystkie te etykiety, a
  klucze `detail.relatedGrns.*` istnieją we wszystkich czterech językach.

## Ryzyko wdrożeniowe sprawdzone przed pushem

Tor lokalizacji zgłosił, że `withSiteContext` w trybie zapisu jest fail-closed,
więc na organizacji bez skonfigurowanego site'u split/merge/destroy zaczną
odmawiać. Sprawdziłem na produkcji: Apex 22 ma **6 aktywnych site'ów**, a wszystkie
organizacje bez site'u mają **zero nośników**. Zmiana nie dotyka niczego żywego.
