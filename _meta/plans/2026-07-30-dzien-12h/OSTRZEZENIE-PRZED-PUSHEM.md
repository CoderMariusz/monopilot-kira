# ⛔ PRZECZYTAJ PRZED `git push origin main`

## 1. Jeden test POŁOŻY CI po pushu — i zabierze ze sobą całą suitę UI

`apps/web/actions/onboarding/onboarding-permission-gates.integration.test.ts:19-20`:
```js
if (value && new URL(value).pathname !== '/monopilot_t2') {
  throw new Error(`${name} must target the monopilot_t2 clone`);
}
```
**CI ma bazę `monopilot`, nie `monopilot_t2`** (`ci.yml:96`). Plik **rzuca przy ładowaniu**,
więc nie pomija się — kładzie **całą suitę node** `apps/web`.

A ponieważ skrypt `test` spina obie suity operatorem `&&`, **suita UI w ogóle się nie wykona**.
To udokumentowana pułapka z `CLAUDE.md` i po pushu zadziała.

Plik przyszedł commitem `49f6e257` (bezpieczeństwo onboardingu) i jest wśród niewypchniętych.

**Naprawa: jedna linia** — bramkować na obecności `DATABASE_URL`, nie na nazwie bazy, tak jak
zrobiono to dziś w `hold-disposition-safety.pg.test.ts`. Nie zdążyłem przed 20:00 i nie chciałem
wpychać niezbramkowanej zmiany o 19:56.

## 2. Migracja 551 może zatrzymać deploy

Vercel stosuje migracje w buildzie. Jeśli produkcja ma wiersze bez przypisanego zakładu,
**551 odmówi i deploy stanie**. To awaria **bezpieczna** — zatrzymany deploy, nie uszkodzone dane.
Sprawdzone lokalnie dwoma sposobami (512 migracji na czystej bazie oraz 550+551 na bazie
zawierającej problematyczny wiersz), ale produkcji nie widziałem.

## 3. Migracja 564 zmienia DANE, nie tylko schemat

Dokłada ograniczenia unikalności na numerach reklamacji i kartonów, a **przed** ich założeniem
przenumerowuje istniejące duplikaty. Na klonie testowym duplikatów nie było, więc **skala
renumeracji na produkcji jest nieznana**. Krok jest udowodniony na zasianych duplikatach,
ale to zmiana danych — zrób kopię przed pushem.
