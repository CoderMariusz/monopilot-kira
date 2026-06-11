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
    progress: string;
    target: string;
    produced: string;
    tileConsume: string;
    tileConsumeDesc: string;
    tileOutput: string;
    tileOutputDesc: string;
    tileWaste: string;
    tileWasteDesc: string;
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
    back: string;
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
    registerNext: string;
    backToWo: string;
    errGeneric: string;
    err409: string;
    err422: string;
    back: string;
  };
  waste: {
    title: string;
    banner: string;
    bannerBody: string;
    categoryTitle: string;
    qtyLabel: string;
    qtyHint: string;
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
    progress: "WO progress",
    target: "Target",
    produced: "Produced",
    tileConsume: "Consume",
    tileConsumeDesc: "Scan BOM materials",
    tileOutput: "Register output",
    tileOutputDesc: "Finished goods to stock",
    tileWaste: "Waste",
    tileWasteDesc: "Record scrap / waste",
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
    back: "Back",
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
    registerNext: "Register another",
    backToWo: "Back to WO",
    errGeneric: "Could not save. Try again.",
    err409: "Conflict — work order state changed. Refresh and retry.",
    err422: "Invalid output quantity or weight.",
    back: "Back",
  },
  waste: {
    title: "Record waste",
    banner: "No LP created",
    bannerBody: "Waste does not enter stock. This only records the quantity.",
    categoryTitle: "Waste category",
    qtyLabel: "Waste quantity (kg)",
    qtyHint: "In kilograms",
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
    progress: "Postęp WO",
    target: "Cel",
    produced: "Wyprod.",
    tileConsume: "Konsumpcja",
    tileConsumeDesc: "Skanuj materiały BOM",
    tileOutput: "Rejestruj wyrób",
    tileOutputDesc: "Wyrób gotowy do magazynu",
    tileWaste: "Odpad",
    tileWasteDesc: "Zarejestruj odpad / scrap",
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
    back: "Wróć",
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
    registerNext: "Rejestruj kolejny",
    backToWo: "Wróć do WO",
    errGeneric: "Nie udało się zapisać. Spróbuj ponownie.",
    err409: "Konflikt — stan WO się zmienił. Odśwież i ponów.",
    err422: "Nieprawidłowa ilość lub waga wyrobu.",
    back: "Wróć",
  },
  waste: {
    title: "Rejestruj odpad",
    banner: "Brak LP",
    bannerBody: "Odpad nie trafia do magazynu. To jest tylko zapis ilości.",
    categoryTitle: "Kategoria odpadu",
    qtyLabel: "Ilość odpadu (kg)",
    qtyHint: "W kilogramach",
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
