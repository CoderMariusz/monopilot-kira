# FALA 8 — rejestr znalezisk cross-review

## Recenzja T2 (inwentaryzacja + druk etykiet) — FIX-FIRST, 3×P1
| # | P | Znalezisko |
|---|---|---|
| T2-1 | **P1** | Patch **importuje modal, którego nie zawiera** |
| T2-2 | **P1** | **Wybór drukarki nie jest egzekwowany dla site PO STRONIE SERWERA** — walidacja tylko w UI, a to granica zaufania |
| T2-3 | **P1** | Nowy test wiersza bez LP jest **deterministycznie czerwony** |
| T2-4 | P2 | Walidacja „wybierz drukarkę" jest **martwa** |
| T2-5 | P2 | Błąd ładowania drukarek **udaje brak konfiguracji** |

## Recenzja T3 (reprint + daty przydatności) — FIX-FIRST, 4×P1
| # | P | Znalezisko |
|---|---|---|
| T3-1 | **P1** | Diff nie zawiera migracji — ⚠️ **artefakt recenzji**: `527-print-jobs-printer-type.sql` **istnieje**, ale jest **nieśledzona**, więc nie weszła do `git diff`. **Zastagować przy commicie** |
| T3-2 | **P1** | Test dat **importuje nieistniejący moduł** i nie testuje ścieżki produkcyjnej |
| T3-3 | **P1** | Nowe asercje reprintu **nie przechodzą typechecku** |
| T3-4 | **P1** | **Migracja błędnie oznaczy zadania ZPL zapisane w oknie rolloutu jako PDF** — ta sama klasa okna wdrożenia, którą Fala 6 domknęła triggerem |
| T3-5 | P2 | Backfill osieroconych zakończonych zadań ZPL zamienia je na PDF |

## Ustalenia własne orchestratora
| Ustalenie | Wynik |
|---|---|
| `print_jobs` ma kolumnę trybu wyjścia? | ⛔ **NIE** — jest tylko `entity_type`. Migracja 527 jest potrzebna |
| Migracja 527 istnieje? | ✅ **TAK**, `?? packages/db/migrations/527-print-jobs-printer-type.sql` — nieśledzona |

## Zgłoszone przez tory, poza ich zakresem
| # | Znalezisko |
|---|---|
| Z-1 | `pickScannerLp` ma **ten sam kształt no-op** co putaway i **nie ma guardu** — pick niesie dodatkową semantykę materiałów WO, więc osobne znalezisko |
| Z-2 | Ekran Move skanera pokaże generyczne „not movable" dla nowego kodu 409 — plik należy do równoległego toru |

## Recenzja T4 (dashboard przydatności + rewizyta przyjęcia) — FIX-FIRST
| # | P | Znalezisko |
|---|---|---|
| T4-1 | **P1** | Porównanie `NUMERIC` przez `Number()` może **błędnie zamrozić nieukończoną linię** |
| T4-2 | **P1** | Guard lokalizacji **odpala za wcześnie** → deklarowany test będzie czerwony |
| T4-3 | **P1** | **Krytyczna anty-regresja zapisu NIE TESTUJE statusu `received`** — czyli test, którego zażądałem wprost, nie sprawdza tego, o co prosiłem |
| T4-4 | P2 | Dashboard nadal gubi **wymagany status QA** |
| T4-5 | P2 | Ekran przypisuje **sumę wszystkich przyjęć do tylko ostatniego LP** |
| T4-6 | P2 | Raport deklaruje testy nieobecne w patchu |

✅ **Potencjalne P0 NIE zmaterializowało się:** sprawdziłem sam —
`OPEN_PO_STATUSES = ['sent','confirmed','partially_received']` **nietknięte**,
diff nie zawiera żadnej zmiany tej stałej. Ścieżka zapisu (`for update` w `receive-po-line-core.ts:338`)
dalej odrzuca przyjęcie na zamkniętym PO. Tor wybrał bezpieczną drogę (odrębna odpowiedź).

## Wzorzec wart nazwania
Tory **piszą testy, których nie uruchamiają** (zakaz jest celowy — chroni pipeline przed padaniem),
więc **systematycznie produkują testy czerwone albo puste**. W tej fali: 3 testy deterministycznie
czerwone, 1 importujący nieistniejący moduł, 1 niesprawdzający tego, co obiecuje, 2 deklarowane
ale nieobecne w patchu. **To koszt stały tego flow, nie incydent** — bramka i cross-review go
wyłapują, ale trzeba go budżetować.

## Recenzja T5 (genealogia + split/merge) — FIX-FIRST, same P2
| # | P | Znalezisko |
|---|---|---|
| T5-1 | P2 | Guard `same_location` **można ominąć UUID-em zapisanym WIELKIMI literami** |
| T5-2 | P2 | Testy genealogii **omijają oba zmienione loadery** (nie dotykają zmienionego kodu) |
