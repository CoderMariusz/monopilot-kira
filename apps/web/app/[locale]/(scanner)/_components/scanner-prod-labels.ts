// ============================================================
// Scanner — WO production-flow i18n labels (Lane C)
//
// Server-resolved, same pattern as scanner-labels.ts: the canonical keys for
// the scanner production namespace are NOT yet merged into apps/web/messages/**
// (owned by a separate lane). Server pages call getScannerProdLabels(locale)
// and pass the resolved object down so client components carry no inline copy.
// The exact same key tree is staged in _meta/i18n-staging/scanner-prod.json
// (en + pl) for promotion into messages/** later.
//
// Only en + pl carry real copy per the project i18n policy; ro/uk mirror en
// at promotion time via the staging script.
//
// Parity: prototypes/scanner/flow-consume.jsx (WoListScreen 8-53,
// WoDetailScreen / WoExecuteScreen 122-212, ConsumeScanScreen 215-422,
// ConsumeDoneScreen 425-443) + flow-register.jsx (OutputScreen 6-121,
// WasteScreen 226-315).
// ============================================================

export type ScannerProdLocale = "pl" | "en";

interface ScannerProdLabelsShape {
  list: {
    title: string;
    searchPlaceholder: string;
    filterAll: string;
    filterMyLine: string;
    filterActive: string;
    loading: string;
    empty: string;
    emptyBody: string;
    error: string;
    retry: string;
  };
  status: {
    planned: string;
    released: string;
    inprog: string;
    paused: string;
    done: string;
    cancelled: string;
  };
  execute: {
    titleSuffix: string;
    loading: string;
    error: string;
    retry: string;
    notFound: string;
    startButton: string;
    startHint: string;
    startError: string;
    progress: string;
    target: string;
    produced: string;
    tileConsume: string;
    tileConsumeDesc: string;
    tileOutput: string;
    tileOutputDesc: string;
    tileWaste: string;
    tileWasteDesc: string;
    tileReverse: string;
    tileReverseDesc: string;
    materialsTitle: string;
    materialsEmpty: string;
    required: string;
    consumed: string;
    allergenTitle: string;
    allergenBody: string;
  };
  consume: {
    title: string;
    pickTitle: string;
    pickEmpty: string;
    lpTitle: string;
    lpLoading: string;
    lpEmpty: string;
    lpError: string;
    lpSuggested: string;
    lpExpiry: string;
    lpManual: string;
    lpManualDesc: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    doneLpRemaining: string;
    needed: string;
    qtyLabel: string;
    qtyHint: string;
    enterQty: string;
    confirm: string;
    submitting: string;
    doneTitle: string;
    doneBody: string;
    bomUpdated: string;
    bomUpdatedBody: string;
    consumeNext: string;
    backToWo: string;
    errGeneric: string;
    err409: string;
    err422: string;
    approvalTitle: string;
    approvalBody: string;
    approvalEmail: string;
    approvalPin: string;
    approvalSubmit: string;
    approvalOver: string;
    warnOver: string;
    lpNotReleased: string;
    lpUnavailable: string;
    lpExpired: string;
    lpLocked: string;
    lpOnHold: string;
    reasonRequired: string;
    back: string;
  };
  reverse: {
    title: string;
    loading: string;
    listTitle: string;
    empty: string;
    error: string;
    retry: string;
    manualLp: string;
    consumedAt: string;
    reasonLabel: string;
    reasonEntryError: string;
    reasonWrongQuantity: string;
    reasonWrongBatch: string;
    reasonWrongProduct: string;
    reasonOther: string;
    noteLabel: string;
    notePlaceholder: string;
    operatorPinLabel: string;
    operatorPinPlaceholder: string;
    supervisorTitle: string;
    supervisorBody: string;
    supervisorEmail: string;
    supervisorPin: string;
    confirm: string;
    submitting: string;
    doneTitle: string;
    doneBody: string;
    lpRestored: string;
    reverseNext: string;
    backToWo: string;
    errGeneric: string;
    errInvalidPin: string;
    errPinLocked: string;
    errInvalidSupervisor: string;
    errSupervisorForbidden: string;
    errPinNotEnrolled: string;
    errForbidden: string;
    errNotFound: string;
    errAlreadyCorrected: string;
    errLpNotRestorable: string;
    errClosedWo: string;
    errInconsistent: string;
  };
  output: {
    title: string;
    qtyLabel: string;
    qtyHint: string;
    unitEach: string;
    unitBox: string;
    unitBase: string;
    weightLabel: string;
    weightHint: string;
    weightPlaceholder: string;
    batchLabel: string;
    batchPlaceholder: string;
    batchHint: string;
    conversion: string;
    conversionUnavailable: string;
    enterQty: string;
    enterWeight: string;
    confirm: string;
    submitting: string;
    doneTitle: string;
    doneBody: string;
    scannerPrintLabel: string;
    scannerPrinting: string;
    scannerPrinted: string;
    scannerPrintError: string;
    registerNext: string;
    backToWo: string;
    errGeneric: string;
    err409: string;
    err422: string;
    back: string;
    /**
     * SOFT-warning (owner decision — warn, never block): shown when the WO has no
     * material consumption recorded. `noConsumptionTitle` heads a non-blocking
     * notice; `noConsumptionBody` explains the missing genealogy link;
     * `noConsumptionContinue` is the [Continue anyway] affordance.
     */
    noConsumptionTitle: string;
    noConsumptionBody: string;
    noConsumptionContinue: string;
    /** Done-screen note repeated after a no-consumption output is registered. */
    noConsumptionDoneNote: string;
    mass_balance_warning: string;
  };
  waste: {
    title: string;
    banner: string;
    bannerBody: string;
    categoryTitle: string;
    qtyLabel: string;
    qtyHint: string;
    boxConversion: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    enterQty: string;
    confirm: string;
    submitting: string;
    doneTitle: string;
    doneBody: string;
    registerNext: string;
    backToWo: string;
    errGeneric: string;
    err409: string;
    err422: string;
    back: string;
    catTrim: string;
    catSpill: string;
    catQuality: string;
    catExpired: string;
    catContamination: string;
    catOther: string;
  };
  /** Honest copy for API error codes, keyed by the wire code. */
  errors: {
    wo_not_recordable: string;
    /** B-2 — line requires allergen changeover dual sign-off before start (409). */
    changeover_signoff_required: string;
  };
  loading: string;
}

const en: ScannerProdLabelsShape = {
  list: {
    title: "Work Orders",
    searchPlaceholder: "Scan a WO or type…",
    filterAll: "All",
    filterMyLine: "My line",
    filterActive: "Active",
    loading: "Loading work orders…",
    empty: "No active work orders",
    emptyBody: "Wait for a planner to release a work order.",
    error: "Could not load work orders. Try again.",
    retry: "Try again",
  },
  status: {
    planned: "PLANNED",
    released: "RELEASED",
    inprog: "IN PROGRESS",
    paused: "PAUSED",
    done: "DONE",
    cancelled: "CANCELLED",
  },
  execute: {
    titleSuffix: "Execute",
    loading: "Loading work order…",
    error: "Could not load work order. Try again.",
    retry: "Try again",
    notFound: "Work order not found.",
    startButton: "Start work order",
    startHint: "Consume, output and waste unlock after you start the work order.",
    startError: "Could not start the work order. Try again.",
    progress: "WO progress",
    target: "Target",
    produced: "Produced",
    tileConsume: "Consume",
    tileConsumeDesc: "Scan BOM materials",
    tileOutput: "Register output",
    tileOutputDesc: "Finished goods to stock",
    tileWaste: "Waste",
    tileWasteDesc: "Record scrap / waste",
    tileReverse: "Reverse consumption",
    tileReverseDesc: "Undo a material consumption",
    materialsTitle: "Materials (BOM)",
    materialsEmpty: "No materials on this work order.",
    required: "required",
    consumed: "consumed",
    allergenTitle: "Allergen gate",
    allergenBody: "Allergen controls apply to this work order.",
  },
  consume: {
    title: "Consume",
    pickTitle: "Pick a material",
    pickEmpty: "No materials to consume.",
    lpTitle: "Pick a license plate",
    lpLoading: "Loading license plates…",
    lpEmpty: "No license plates available for this material.",
    lpError: "Could not load license plates.",
    lpSuggested: "Suggested (FEFO)",
    lpExpiry: "exp.",
    lpManual: "Manual / no LP",
    lpManualDesc: "Consume without selecting a license plate.",
    reasonLabel: "Manual reason code",
    reasonPlaceholder: "Required for manual / no-LP consumption",
    doneLpRemaining: "{qty} {uom} remaining on {lp}",
    needed: "still needed",
    qtyLabel: "Quantity to consume",
    qtyHint: "In the material unit",
    enterQty: "Enter quantity",
    confirm: "Confirm consumption",
    submitting: "Saving…",
    doneTitle: "Consumption saved",
    doneBody: "Material recorded against the work order.",
    bomUpdated: "BOM updated",
    bomUpdatedBody: "WO progress refreshed. Continue or register output.",
    consumeNext: "Consume next",
    backToWo: "Back to WO",
    errGeneric: "Could not save. Try again.",
    err409: "Conflict — this material state changed. Refresh and retry.",
    err422: "Invalid quantity for this material.",
    approvalTitle: "Supervisor approval",
    approvalBody: "This consumption is above the allowed threshold.",
    approvalEmail: "Supervisor email",
    approvalPin: "Supervisor PIN",
    approvalSubmit: "Approve and save",
    approvalOver: "{pct}% over required",
    warnOver: "Over required quantity by {pct}% — recorded and flagged.",
    lpNotReleased: "This license plate has not been released by QA.",
    lpUnavailable: "This license plate is not available for consumption.",
    lpExpired: "This license plate is expired and cannot be consumed.",
    lpLocked: "This license plate is locked by another user.",
    lpOnHold: "This license plate is on an active quality hold.",
    reasonRequired: "Enter a reason code for manual consumption.",
    back: "Back",
  },
  reverse: {
    title: "Reverse consumption",
    loading: "Loading consumptions…",
    listTitle: "Pick a consumption to reverse",
    empty: "No reversible consumptions on this work order.",
    error: "Could not load consumptions. Try again.",
    retry: "Try again",
    manualLp: "Manual / no LP",
    consumedAt: "consumed",
    reasonLabel: "Reason",
    reasonEntryError: "Entry error",
    reasonWrongQuantity: "Wrong quantity",
    reasonWrongBatch: "Wrong batch",
    reasonWrongProduct: "Wrong product",
    reasonOther: "Other",
    noteLabel: "Note (optional)",
    notePlaceholder: "Optional explanation…",
    operatorPinLabel: "Your PIN",
    operatorPinPlaceholder: "Operator PIN",
    supervisorTitle: "Supervisor approval",
    supervisorBody: "This reversal requires a supervisor sign-off.",
    supervisorEmail: "Supervisor email",
    supervisorPin: "Supervisor PIN",
    confirm: "Reverse consumption",
    submitting: "Saving…",
    doneTitle: "Consumption reversed",
    doneBody: "Material returned and BOM progress refreshed.",
    lpRestored: "License plate restored to {status}.",
    reverseNext: "Reverse another",
    backToWo: "Back to WO",
    errGeneric: "Could not reverse. Try again.",
    errInvalidPin: "Incorrect PIN. Try again.",
    errPinLocked: "PIN locked after too many attempts. Contact a supervisor.",
    errInvalidSupervisor: "Supervisor email or PIN is invalid.",
    errSupervisorForbidden: "This supervisor is not allowed to approve reversals.",
    errPinNotEnrolled: "Supervisor has no PIN set up.",
    errForbidden: "You do not have permission to reverse consumptions.",
    errNotFound: "This consumption could not be found.",
    errAlreadyCorrected: "This consumption was already reversed.",
    errLpNotRestorable: "The license plate can no longer be restored.",
    errClosedWo: "This work order is closed and cannot be corrected here.",
    errInconsistent: "Work order quantities are inconsistent. Refresh and retry.",
  },
  output: {
    title: "Register output",
    qtyLabel: "Quantity produced",
    qtyHint: "In the output unit",
    unitEach: "each",
    unitBox: "box",
    unitBase: "kg",
    weightLabel: "Actual weight (kg)",
    weightHint: "Optional — for catch-weight output",
    weightPlaceholder: "0.000",
    batchLabel: "Batch / lot number",
    batchPlaceholder: "BATCH-…",
    batchHint: "Optional",
    conversion: "{qty} {unit} = {kg} kg",
    conversionUnavailable: "Conversion unavailable for this item.",
    enterQty: "Enter quantity",
    enterWeight: "Enter weight",
    confirm: "Confirm output",
    submitting: "Saving…",
    doneTitle: "Output registered",
    doneBody: "Finished goods recorded to stock.",
    scannerPrintLabel: "Print label",
    scannerPrinting: "Printing...",
    scannerPrinted: "Printed",
    scannerPrintError: "Could not print label.",
    registerNext: "Register another",
    backToWo: "Back to WO",
    errGeneric: "Could not save. Try again.",
    err409: "Conflict — work order state changed. Refresh and retry.",
    err422: "Invalid output quantity or weight.",
    back: "Back",
    noConsumptionTitle: "No consumption recorded",
    noConsumptionBody:
      "No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.",
    noConsumptionContinue: "Continue anyway",
    noConsumptionDoneNote: "Registered without material consumption — no genealogy link.",
    mass_balance_warning:
      "Registered output ({outputKg} kg) requires approx {expectedKg} kg of components at {yieldPct}% yield, but {consumedKg} kg consumed so far.",
  },
  waste: {
    title: "Record waste",
    banner: "No LP created",
    bannerBody: "Waste does not enter stock. This only records the quantity.",
    categoryTitle: "Waste category",
    qtyLabel: "Waste quantity (kg)",
    qtyHint: "In kilograms",
    boxConversion: "1 box ≈ {kg} kg",
    reasonLabel: "Reason (optional)",
    reasonPlaceholder: "Optional notes…",
    enterQty: "Enter quantity",
    confirm: "Record waste",
    submitting: "Saving…",
    doneTitle: "Waste recorded",
    doneBody: "No LP — not added to stock.",
    registerNext: "Record another",
    backToWo: "Back to WO",
    errGeneric: "Could not save. Try again.",
    err409: "Conflict — work order state changed. Refresh and retry.",
    err422: "Invalid waste quantity or category.",
    back: "Back",
    catTrim: "Trim / offcut",
    catSpill: "Spill",
    catQuality: "Quality reject",
    catExpired: "Expired",
    catContamination: "Contamination",
    catOther: "Other",
  },
  errors: {
    wo_not_recordable:
      "Start the work order first — outputs can only be recorded while it is running",
    changeover_signoff_required:
      "Line requires allergen changeover sign-off before start.",
  },
  loading: "Loading…",
} as const;

const pl: ScannerProdLabelsShape = {
  list: {
    title: "Work Orders",
    searchPlaceholder: "Skanuj WO lub wpisz…",
    filterAll: "Wszystkie",
    filterMyLine: "Moja linia",
    filterActive: "Aktywne",
    loading: "Ładowanie work orders…",
    empty: "Brak aktywnych WO",
    emptyBody: "Czekaj na zwolnienie WO przez planistę.",
    error: "Nie udało się załadować WO. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
  },
  status: {
    planned: "ZAPLANOWANE",
    released: "ZWOLNIONE",
    inprog: "W TRAKCIE",
    paused: "WSTRZYMANE",
    done: "ZAKOŃCZONE",
    cancelled: "ANULOWANE",
  },
  execute: {
    titleSuffix: "Wykonaj",
    loading: "Ładowanie work order…",
    error: "Nie udało się załadować WO. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
    notFound: "Nie znaleziono work order.",
    startButton: "Uruchom work order",
    startHint: "Konsumpcja, wyrób i odpad odblokują się po uruchomieniu WO.",
    startError: "Nie udało się uruchomić WO. Spróbuj ponownie.",
    progress: "Postęp WO",
    target: "Cel",
    produced: "Wyprod.",
    tileConsume: "Konsumpcja",
    tileConsumeDesc: "Skanuj materiały BOM",
    tileOutput: "Rejestruj wyrób",
    tileOutputDesc: "Wyrób gotowy do magazynu",
    tileWaste: "Odpad",
    tileWasteDesc: "Zarejestruj odpad / scrap",
    tileReverse: "Cofnij konsumpcję",
    tileReverseDesc: "Wycofaj konsumpcję materiału",
    materialsTitle: "Materiały (BOM)",
    materialsEmpty: "Brak materiałów na tym WO.",
    required: "wymagane",
    consumed: "skonsumowane",
    allergenTitle: "Brama alergenowa",
    allergenBody: "Na tym WO obowiązują kontrole alergenów.",
  },
  consume: {
    title: "Konsumpcja",
    pickTitle: "Wybierz materiał",
    pickEmpty: "Brak materiałów do konsumpcji.",
    lpTitle: "Wybierz nośnik (LP)",
    lpLoading: "Ładowanie nośników…",
    lpEmpty: "Brak dostępnych nośników dla tego materiału.",
    lpError: "Nie udało się załadować nośników.",
    lpSuggested: "Sugerowany (FEFO)",
    lpExpiry: "ważn.",
    lpManual: "Ręcznie / bez LP",
    lpManualDesc: "Konsumpcja bez wskazania nośnika.",
    reasonLabel: "Kod powodu ręcznego",
    reasonPlaceholder: "Wymagany przy konsumpcji ręcznej / bez LP",
    doneLpRemaining: "{qty} {uom} pozostało na {lp}",
    needed: "jeszcze potrzeba",
    qtyLabel: "Ilość do konsumpcji",
    qtyHint: "W jednostce materiału",
    enterQty: "Podaj ilość",
    confirm: "Potwierdź konsumpcję",
    submitting: "Zapisywanie…",
    doneTitle: "Konsumpcja zapisana",
    doneBody: "Materiał zarejestrowany na WO.",
    bomUpdated: "BOM zaktualizowany",
    bomUpdatedBody: "Postęp WO odświeżony. Kontynuuj lub zarejestruj wyrób.",
    consumeNext: "Skanuj kolejny",
    backToWo: "Wróć do WO",
    errGeneric: "Nie udało się zapisać. Spróbuj ponownie.",
    err409: "Konflikt — stan materiału się zmienił. Odśwież i ponów.",
    err422: "Nieprawidłowa ilość dla tego materiału.",
    approvalTitle: "Zgoda przełożonego",
    approvalBody: "Ta konsumpcja przekracza dozwolony próg.",
    approvalEmail: "Email przełożonego",
    approvalPin: "PIN przełożonego",
    approvalSubmit: "Zatwierdź i zapisz",
    approvalOver: "{pct}% ponad wymagane",
    warnOver: "Przekroczono wymaganą ilość o {pct}% — zarejestrowano i oznaczono.",
    lpNotReleased: "Ten nośnik nie został zwolniony przez QA.",
    lpUnavailable: "Ten nośnik nie jest dostępny do konsumpcji.",
    lpExpired: "Ten nośnik jest przeterminowany i nie może zostać zużyty.",
    lpLocked: "Ten nośnik jest zablokowany przez innego użytkownika.",
    lpOnHold: "Ten nośnik ma aktywną blokadę jakości.",
    reasonRequired: "Wpisz kod powodu dla konsumpcji ręcznej.",
    back: "Wróć",
  },
  reverse: {
    title: "Cofnij konsumpcję",
    loading: "Ładowanie konsumpcji…",
    listTitle: "Wybierz konsumpcję do cofnięcia",
    empty: "Brak konsumpcji możliwych do cofnięcia na tym WO.",
    error: "Nie udało się załadować konsumpcji. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
    manualLp: "Ręcznie / bez LP",
    consumedAt: "skonsumowano",
    reasonLabel: "Powód",
    reasonEntryError: "Błąd wprowadzenia",
    reasonWrongQuantity: "Błędna ilość",
    reasonWrongBatch: "Błędna partia",
    reasonWrongProduct: "Błędny produkt",
    reasonOther: "Inny",
    noteLabel: "Notatka (opcjonalnie)",
    notePlaceholder: "Opcjonalne wyjaśnienie…",
    operatorPinLabel: "Twój PIN",
    operatorPinPlaceholder: "PIN operatora",
    supervisorTitle: "Zgoda przełożonego",
    supervisorBody: "To cofnięcie wymaga podpisu przełożonego.",
    supervisorEmail: "Email przełożonego",
    supervisorPin: "PIN przełożonego",
    confirm: "Cofnij konsumpcję",
    submitting: "Zapisywanie…",
    doneTitle: "Konsumpcja cofnięta",
    doneBody: "Materiał zwrócony, postęp BOM odświeżony.",
    lpRestored: "Nośnik przywrócony do statusu {status}.",
    reverseNext: "Cofnij kolejną",
    backToWo: "Wróć do WO",
    errGeneric: "Nie udało się cofnąć. Spróbuj ponownie.",
    errInvalidPin: "Nieprawidłowy PIN. Spróbuj ponownie.",
    errPinLocked: "PIN zablokowany po zbyt wielu próbach. Skontaktuj się z przełożonym.",
    errInvalidSupervisor: "Email lub PIN przełożonego jest nieprawidłowy.",
    errSupervisorForbidden: "Ten przełożony nie może zatwierdzać cofnięć.",
    errPinNotEnrolled: "Przełożony nie ma ustawionego PIN-u.",
    errForbidden: "Nie masz uprawnień do cofania konsumpcji.",
    errNotFound: "Nie znaleziono tej konsumpcji.",
    errAlreadyCorrected: "Ta konsumpcja została już cofnięta.",
    errLpNotRestorable: "Nośnik nie może już zostać przywrócony.",
    errClosedWo: "To WO jest zamknięte i nie może być tu korygowane.",
    errInconsistent: "Ilości WO są niespójne. Odśwież i ponów.",
  },
  output: {
    title: "Rejestruj wyrób gotowy",
    qtyLabel: "Ilość wyprodukowana",
    qtyHint: "W jednostce wyrobu",
    unitEach: "szt",
    unitBox: "karton",
    unitBase: "kg",
    weightLabel: "Waga rzeczywista (kg)",
    weightHint: "Opcjonalne — dla catch-weight",
    weightPlaceholder: "0.000",
    batchLabel: "Partia / numer serii",
    batchPlaceholder: "BATCH-…",
    batchHint: "Opcjonalne",
    conversion: "{qty} {unit} = {kg} kg",
    conversionUnavailable: "Konwersja niedostępna dla tej pozycji.",
    enterQty: "Podaj ilość",
    enterWeight: "Podaj wagę",
    confirm: "Zatwierdź rejestrację",
    submitting: "Zapisywanie…",
    doneTitle: "Wyrób zarejestrowany",
    doneBody: "Wyrób gotowy zapisany do magazynu.",
    scannerPrintLabel: "Drukuj etykietę",
    scannerPrinting: "Drukowanie...",
    scannerPrinted: "Wydrukowano",
    scannerPrintError: "Nie udało się wydrukować etykiety.",
    registerNext: "Rejestruj kolejny",
    backToWo: "Wróć do WO",
    errGeneric: "Nie udało się zapisać. Spróbuj ponownie.",
    err409: "Konflikt — stan WO się zmienił. Odśwież i ponów.",
    err422: "Nieprawidłowa ilość lub waga wyrobu.",
    back: "Wróć",
    noConsumptionTitle: "Brak zarejestrowanej konsumpcji",
    noConsumptionBody:
      "Brak zarejestrowanej konsumpcji materiałów dla tego WO — wyrób nie będzie miał powiązania genealogicznego/identyfikowalności. Zarejestruj najpierw konsumpcję lub kontynuuj.",
    noConsumptionContinue: "Kontynuuj mimo to",
    noConsumptionDoneNote: "Zarejestrowano bez konsumpcji materiałów — brak powiązania genealogicznego.",
    mass_balance_warning:
      "Zarejestrowana produkcja ({outputKg} kg) wymaga okolo {expectedKg} kg komponentu przy yield {yieldPct}%, ale skonsumowano dotad {consumedKg} kg.",
  },
  waste: {
    title: "Rejestruj odpad",
    banner: "Brak LP",
    bannerBody: "Odpad nie trafia do magazynu. To jest tylko zapis ilości.",
    categoryTitle: "Kategoria odpadu",
    qtyLabel: "Ilość odpadu (kg)",
    qtyHint: "W kilogramach",
    boxConversion: "1 karton ≈ {kg} kg",
    reasonLabel: "Powód (opcjonalne)",
    reasonPlaceholder: "Opcjonalne notatki…",
    enterQty: "Podaj ilość",
    confirm: "Rejestruj odpad",
    submitting: "Zapisywanie…",
    doneTitle: "Odpad zarejestrowany",
    doneBody: "Brak LP — nie trafia do magazynu.",
    registerNext: "Rejestruj kolejny",
    backToWo: "Wróć do WO",
    errGeneric: "Nie udało się zapisać. Spróbuj ponownie.",
    err409: "Konflikt — stan WO się zmienił. Odśwież i ponów.",
    err422: "Nieprawidłowa ilość lub kategoria odpadu.",
    back: "Wróć",
    catTrim: "Obrzynki / trim",
    catSpill: "Rozlanie",
    catQuality: "Odrzut jakościowy",
    catExpired: "Przeterminowane",
    catContamination: "Zanieczyszczenie",
    catOther: "Inne",
  },
  errors: {
    wo_not_recordable:
      "Najpierw uruchom work order — wyroby można rejestrować tylko, gdy jest w toku",
    changeover_signoff_required:
      "Linia wymaga podpisania przezbrojenia alergenowego przed startem.",
  },
  loading: "Ładowanie…",
};

const DICT: Record<ScannerProdLocale, ScannerProdLabelsShape> = { en, pl };

export type ScannerProdLabels = ScannerProdLabelsShape;

export function getScannerProdLabels(locale: string): ScannerProdLabels {
  return locale === "en" ? DICT.en : DICT.pl;
}

// Static waste categories — P1 fallback. The scanner runs on a Bearer session
// that is not compatible with the desktop org-context server actions, and the
// waste API accepts free category codes. Codes are stable; labels are localized.
export const SCANNER_WASTE_CATEGORIES: Array<{
  code: string;
  icon: string;
  labelKey: keyof ScannerProdLabelsShape["waste"];
}> = [
  { code: "TRIM", icon: "✂️", labelKey: "catTrim" },
  { code: "SPILL", icon: "💧", labelKey: "catSpill" },
  { code: "QUALITY", icon: "⚠️", labelKey: "catQuality" },
  { code: "EXPIRED", icon: "⏰", labelKey: "catExpired" },
  { code: "CONTAMINATION", icon: "☣️", labelKey: "catContamination" },
  { code: "OTHER", icon: "•", labelKey: "catOther" },
];
