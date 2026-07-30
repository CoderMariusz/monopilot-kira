# Funkcje obiecane w interfejsie, za którymi nie ma wykonawcy — 30.07, 19:22

Metoda toru: pełny katalog Postgresa (**281 tabel**, dokładne zliczenia na `monopilot_t3`)
skrzyżowany z **dwoma niezależnymi przebiegami** po kodzie — regex idiomów SQL oraz gołe nazwy
tabel plus konsumenci po stronie bazy (`pg_proc`, `pg_depend`).

Bilans toru: **197 tabel z pełnym obiegiem** zapis+odczyt, ~26 kandydatów zweryfikowanych ręcznie,
**7+ zgłoszeń obalonych jako działające**.

---

## POTWIERDZONE PRZEZE MNIE

### 1. Moduł wyników laboratoryjnych jest strukturalnie niezdolny do zapisu

Sprawdziłem osobiście:
```
registerQualityLabBridge — 8 wywołań, WSZYSTKIE w apps/web/tests/api/lab-results.test.ts
                            + 1 definicja w lib/technical/lab/quality-bridge-client.ts:64
```
**Most rejestrowany wyłącznie w testach.** Produkcyjna trasa `POST /api/technical/lab-results`
zawsze zwraca **501 `QUALITY_BRIDGE_MISSING`**. Jedyny `insert into lab_results` w całym repo
też siedzi w testach.

Czyta tę tabelę **dziewięć plików**, w tym pełny ekran wyników, zakładki kartoteki
i — najgorsze — **bramka użyteczności surowców** (`lib/technical/rm-usability.ts`), która
podejmuje decyzję na podstawie tabeli, do której nic nigdy nie napisze.

To najmocniejszy wzorzec dnia w najczystszej postaci: **testy zielone, produkcja niezdolna
do wykonania funkcji.**

---

## OBALONE PRZEZE MNIE — tor się pomylił

### 2. Bramka alergenowa przy przezbrojeniu — zarzut NIETRAFIONY

Tor zgłosił, że **nikt nie zapisuje** do `changeover_events` ani
`allergen_changeover_validations`, więc bramka bezpieczeństwa żywności zawsze przepuszcza.
**To nieprawda.** Sprawdziłem:

```
apps/web/app/[locale]/(app)/(modules)/production/_actions/changeover-actions.ts
  :481   insert into public.changeover_events
  :670   insert into public.allergen_changeover_validations
```

Ekran też istnieje: `production/changeovers/page.tsx` (liczba mnoga) importuje
`createChangeoverEvent` i `signChangeover`.

**Dlaczego tor tego nie zobaczył — i to jest tu lekcja:** `grep` potraktował ten plik jako
**binarny** i pominął go, wypisując „Binary file matches" zamiast treści. Bez flagi `-a`
plik jest niewidoczny. Tor szukał też w katalogu `production/changeover/` (liczba pojedyncza),
podczas gdy zapis siedzi w `production/changeovers/` — dwie trasy o niemal identycznej nazwie.

**To trzeci raz tego dnia, gdy narzędzie liczące skłamało** i pierwszy, w którym fałsz
poszedłby dalej jako „bramka bezpieczeństwa żywności nie działa". Dopisane do tabeli
kłamiących komend w dzienniku.

---

## ZGŁOSZONE, NIEZWERYFIKOWANE PRZEZE MNIE

Poniższe **pochodzą z raportu toru i ich nie sprawdziłem** — po pomyłce przy przezbrojeniu
traktuj je jako hipotezy do potwierdzenia, nie jako ustalenia.

| funkcja | zgłoszenie |
|---|---|
| **Zatwierdzenia zmian technicznych** | trzy akcje zapisują, **nikt nie czyta** — użytkownik klika „Zatwierdź", a nie ma ekranu, który pokaże kto co zatwierdził |
| **Ćwiczenia wycofania z rynku** | brak ścieżki zapisu (znane z wcześniejszego audytu) |
| **Dni nieprodukcyjne** | kalendarz zmian czyta tabelę, do której nie da się nic wprowadzić |
| **Przełączniki modułów** | operacja tylko aktualizująca, bez wstawiania; seed **nie jest podpięty** do migracji → na bazie bez ręcznego seeda każdy przełącznik kończy się błędem. **Stanu produkcji nie znam** |

## Dług uczciwie oznaczony — to NIE są defekty

- **Parametry harmonogramu** — ekran **jawnie pisze**, że pokazuje wartości domyślne
  tylko do odczytu. Uczciwy.
- **Dobowa wariancja wagi zmiennej** — zadanie nocne **liczy i zapisuje**, nikt nie czyta.
  Praca wykonana i wyrzucona, ale **żaden ekran tego nie obiecuje**.
- **Cała warstwa definicji raportów** (6 tabel) — zero referencji poza dumpem schematu.
- **~16 tabel bez żadnego kodu** — m.in. listy przewozowe, plany zdolności, części zamienne,
  transfery międzyzakładowe, kody podatkowe.

## Fałszywe alarmy pierwszej metody — tor sam je obalił

`password_history` (zapis i odczyt istnieją, ale **bez prefiksu `public.`** — pierwszy przebieg
skłamał), `weighings`, `sscc_counters` (konsumowane przez **funkcje w bazie**, niewidoczne
w grepie po TypeScripcie), progi alarmowe OEE, wszystkie tabele referencyjne zasiane migracjami.
**Sześć z sześciu zadań cyklicznych ma istniejące trasy.**

## Czego nie ustalono

- Stanu **produkcyjnej** bazy — wszystkie zliczenia z bazy testowej
- Czy produkcja ma zasiane tabele modułów (to rozstrzyga zgłoszenie o przełącznikach)
- Poziomu kolumn — skanowano wyłącznie poziom tabel
