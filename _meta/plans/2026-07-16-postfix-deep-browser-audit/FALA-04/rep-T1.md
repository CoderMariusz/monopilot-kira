# FALA-04 / TOR T1 — BOM: prawda o cyklu życia (PF-R06-08 + PF-R06-10)

## Tabela status × akcja (główny produkt)

Źródło prawdy: guardy serwerowe (nie zgadywane). UI (`bom-version-mutation.ts`) odzwierciedla je 1:1.

| Status | Add component | Save version | Delete version | Guard serwerowy |
|--------|---------------|--------------|----------------|-----------------|
| `draft` | ✅ | ✅ (≥1 linia) | ✅ | `line-actions.ts` append; `create-draft.ts` fork → `draft`; `delete-bom-version.ts` L71 `status === 'draft'` |
| `in_review` | ✅ | ✅ (≥1 linia) | ❌ | j.w.; delete: `delete-bom-version.ts` L71–72 `not_draft` |
| `technical_approved` | ✅ (fork) | ✅ (fork) | ❌ | `create-draft.ts` L277–285 → `callBomRequestVersionEdit` → `in_review`; `request-version-edit.ts` L47–53; delete: `not_draft` |
| `active` | ✅ (fork) | ✅ (fork) | ❌ | j.w. (`bom_request_version_edit`); delete: `not_draft` |
| `superseded` | ❌ | ❌ | ❌ | `create-draft.ts` L325–330 `invalid_state`; `line-actions.ts` `bom_not_editable`; delete: `not_draft` |
| `archived` | ❌ | ❌ | ❌ | j.w. |

**Fork z released:** `bom_request_version_edit` (mig. 168) wstawia `status='in_review'`, emituje `bom.version_submitted`.

**Fork z draft/in_review:** `create-draft.ts` L231–276 wstawia `status='draft'`, archiwizuje źródło.

**Add in-place (bez forka):** tylko gdy źródło `draft|in_review` — `line-actions.ts` L92–94 (`BOM_LINE_EDITABLE_STATUSES`).

---

## PF-R06-08 — Edycja aktywnego BOM obiecuje „Draft", tworzy „In review"

### Decyzja architektoniczna (bez zmian)
Baza ma rację. Klient kłamał — poprawiono copy, **nie** `bom_request_version_edit` ani mig. 168.

### Zmiany copy
| Klucz i18n (`technical.bom.edit`) | Znaczenie |
|-----------------------------------|-----------|
| `newDraftNotice` | Tylko released (`active` / `technical_approved` w `ComponentAddModal`) — obiecuje wersję **in review** |
| `newEditableDraftNotice` | Ścieżka draft → nowy **draft** (gotowe pod `VersionSaveModal`; `bom-edit-dialog.tsx` off-limits w tym torze) |

Zaktualizowano `en` / `pl` / `ro` / `uk`. Rozróżnienie draft vs released jest w dwóch kluczach, nie w jednym ogólnym komunikacie.

### Komentarze / JSDoc
- `create-draft.ts` — nagłówek: status wynika ze źródła (`draft` vs `in_review`)
- `request-version-edit.ts` — „in_review version", nie „draft"
- `bom-detail-actions.tsx` — fork `active/technical_approved` → `in_review`

### `createBomDraft` — decyzja o nazwie
**Nie zmieniano.** ~20+ wywołań (server actions, modale, testy integracyjne, NPD, ECO). Koszt refaktoru >> korzyść; nazwa historyczna, semantyka udokumentowana w JSDoc. Rename wymagałby osobnego toru migracji importów.

### Pliki poza zakresem (nie dotykane)
`bom-edit-dialog.tsx`, `line-actions.ts`, `shared.ts` (zmiany w `shared.ts` pochodzą z równoległego toru PF-R06-03/04, nie z T1).

---

## PF-R06-10 — Zarchiwizowany/superseded BOM: aktywne kontrolki mutacji

### Implementacja
- `_lib/bom-version-mutation.ts` — macierz `isBomVersionMutationAllowed` + `bomVersionMutationBlockedKey`
- `bom-detail-actions.tsx` — `disabled` + `title` + `aria-label` per akcja; modale nie montują się gdy akcja zablokowana
- i18n `technical.bom.actions.*Blocked*` — powód wyłączenia (archived / superseded / not draft / empty lines)

### Anty-over-blocking
`draft` → wszystkie trzy CTA **enabled** (test `bom-detail-actions-status-guards.test.tsx`).

---

## Zmienione pliki

| Plik | Uzasadnienie |
|------|--------------|
| `i18n/{en,pl,ro,uk}.json` | PF-R06-08: `newDraftNotice` / `newEditableDraftNotice`; PF-R06-10: klucze `*Blocked*` |
| `bom/_lib/bom-version-mutation.ts` | Macierz status × akcja (SSOT UI) |
| `bom/_components/bom-detail-actions.tsx` | Wyłączenie CTA + tooltipy wg statusu |
| `bom/_actions/create-draft.ts` | JSDoc: dual-path status |
| `bom/_actions/request-version-edit.ts` | JSDoc: in_review, nie draft |
| `bom/_lib/__tests__/bom-version-mutation.unit.test.ts` | Test macierzy guardów |
| `bom/_lib/__tests__/bom-lifecycle-copy.unit.test.ts` | PF-R06-08: kontrakt copy draft vs in_review |
| `bom/_components/__tests__/bom-detail-actions-status-guards.test.tsx` | PF-R06-10: disabled + reason + anti-regresja draft |
| `bom/_components/__tests__/tec-022-bom-edit.test.tsx` | AC6: notice mówi „in review", nie „draft" |

---

## Testy (pisane, nie uruchamiane w torze)

| Test | Oczekiwanie |
|------|-------------|
| `bom-lifecycle-copy.unit.test.ts` | `newDraftNotice` → in review; `newEditableDraftNotice` → draft |
| `bom-detail-actions-status-guards.test.tsx` | archived/superseded: 3× disabled + title; draft: 3× enabled; active: delete disabled |
| `bom-version-mutation.unit.test.ts` | Macierz zgodna z guardami serwerowymi |
| `tec-022-bom-edit.test.tsx` | Active modal: tekst in review, brak „draft version" |

---

## Czego NIE jestem pewien

1. **`newEditableDraftNotice` nie jest jeszcze podpięty w `VersionSaveModal`** (`bom-edit-dialog.tsx` off-limits) — użytkownik zapisujący draft nie widzi osobnego bannera; rozróżnienie jest w kluczu i18n, nie w UI modala Save.
2. **`createBomDraft` audit/outbox** (`create-draft.ts` L413–422) zawsze zapisuje `status: 'draft'` w `afterState` / payload, także po ścieżce `in_review` — to może być osobny bug audytu, poza zakresem copy (wymaga odczytu faktycznego statusu z DB po fork).
3. **`tec-022` wymaga `NextIntlProvider`** w jsdom — test AC6 zakłada załadowane bundle `en`; przy braku providera może renderować klucz zamiast tekstu (istniejący wzorzec projektu).
4. **Równoległe zmiany w `shared.ts`** (scrap/reorder) — nie są częścią T1; konsolidacja musi je rozdzielić od tego raportu.

---

## Bramka orchestratora

```bash
pnpm --filter web exec vitest run \
  "app/[locale]/(app)/(modules)/technical/bom/_lib/__tests__/bom-version-mutation.unit.test.ts" \
  "app/[locale]/(app)/(modules)/technical/bom/_lib/__tests__/bom-lifecycle-copy.unit.test.ts" \
  "app/[locale]/(app)/(modules)/technical/bom/_components/__tests__/bom-detail-actions-status-guards.test.tsx" \
  "app/[locale]/(app)/(modules)/technical/bom/_components/__tests__/tec-022-bom-edit.test.tsx" \
  --config vitest.ui.config.ts
```
