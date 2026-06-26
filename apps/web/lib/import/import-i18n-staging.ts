/**
 * Staged i18n fallbacks for the TO + WO bulk-import screens (and the
 * "Import TOs" / "Import WOs" list links).
 *
 * The real keys belong in apps/web/i18n/{en,pl,ro,uk}.json under
 *   Planning.transferOrders.bulkImport.*  / Planning.transferOrders.actions.bulkImport
 *   Planning.workOrders.bulkImport.*      / Planning.workOrders.actions.bulkImport
 * and are returned by this task as `key|EN|PL` for the i18n merge lane (the task
 * mandates NOT editing the locale json directly). Until that lane lands, the pages
 * read the live bundle first (t.has) and fall back to these staged EN/PL values so
 * the screens never throw a MISSING_MESSAGE — the same pattern as archiveLabel /
 * the wo-list `opt` helpers already in this module.
 *
 * Two-locale rule (memory: i18n-two-locales): EN + PL are real; ro/uk mirror EN.
 */

type LeafMap = Record<string, string>;

/** Flat dotted-key → { en, pl } map (entity-agnostic where the copy is identical). */
const SHARED: Record<string, { en: string; pl: string }> = {
  'bulkImport.fileLabel': { en: 'CSV file', pl: 'Plik CSV' },
  'bulkImport.selectedFile': { en: 'Selected file', pl: 'Wybrany plik' },
  'bulkImport.preview': { en: 'Preview', pl: 'Podgląd' },
  'bulkImport.previewing': { en: 'Previewing…', pl: 'Przetwarzanie…' },
  'bulkImport.confirm': { en: 'Confirm import', pl: 'Potwierdź import' },
  'bulkImport.confirming': { en: 'Importing…', pl: 'Importowanie…' },
  'bulkImport.reset': { en: 'Reset', pl: 'Wyczyść' },
  'bulkImport.previewError': {
    en: 'Could not preview the file. Please retry.',
    pl: 'Nie udało się wczytać podglądu pliku. Spróbuj ponownie.',
  },
  'bulkImport.confirmError': {
    en: 'The import could not be completed. Please retry.',
    pl: 'Nie udało się ukończyć importu. Spróbuj ponownie.',
  },
  'bulkImport.validTitle': { en: 'Valid rows', pl: 'Poprawne wiersze' },
  'bulkImport.validCount': { en: '{n} valid row(s)', pl: '{n} poprawnych wierszy' },
  'bulkImport.errorsTitle': { en: 'Row errors', pl: 'Błędy wierszy' },
  'bulkImport.errorsCount': { en: '{n} error(s)', pl: '{n} błędów' },
  'bulkImport.noValidRows': { en: 'No valid rows to import.', pl: 'Brak poprawnych wierszy do importu.' },
  'bulkImport.noErrors': { en: 'No row errors.', pl: 'Brak błędów w wierszach.' },
  'bulkImport.createErrorsTitle': { en: 'Create errors', pl: 'Błędy tworzenia' },
  'bulkImport.columns.row': { en: 'Row', pl: 'Wiersz' },
  'bulkImport.columns.item': { en: 'Item', pl: 'Pozycja' },
  'bulkImport.columns.qty': { en: 'Qty', pl: 'Ilość' },
  'bulkImport.columns.uom': { en: 'UoM', pl: 'JM' },
  'bulkImport.columns.scheduled': { en: 'Scheduled', pl: 'Zaplanowano' },
  'bulkImport.errorColumns.row': { en: 'Row', pl: 'Wiersz' },
  'bulkImport.errorColumns.column': { en: 'Column', pl: 'Kolumna' },
  'bulkImport.errorColumns.message': { en: 'Message', pl: 'Komunikat' },
  'bulkImport.denied': {
    en: 'You do not have permission to import in planning.',
    pl: 'Nie masz uprawnień do importu w planowaniu.',
  },
};

const TO_STAGING: Record<string, { en: string; pl: string }> = {
  ...SHARED,
  'actions.bulkImport': { en: 'Import TOs', pl: 'Importuj ZP' },
  'bulkImport.title': { en: 'Import transfer orders', pl: 'Importuj zlecenia przesunięcia' },
  'bulkImport.subtitle': {
    en: 'Upload a CSV to preview and create transfer orders in bulk.',
    pl: 'Wgraj plik CSV, aby wyświetlić podgląd i utworzyć zlecenia przesunięcia zbiorczo.',
  },
  'bulkImport.breadcrumbCurrent': { en: 'Import', pl: 'Import' },
  'bulkImport.fileHelp': {
    en: 'Columns: to_number (optional), from_site, to_site, item_code, qty, uom, scheduled_date (optional), notes (optional).',
    pl: 'Kolumny: to_number (opcjonalnie), from_site, to_site, item_code, qty, uom, scheduled_date (opcjonalnie), notes (opcjonalnie).',
  },
  'bulkImport.createdTitle': { en: 'Import complete.', pl: 'Import zakończony.' },
  'bulkImport.createdCount': { en: '{n} transfer order(s) created.', pl: 'Utworzono {n} zleceń przesunięcia.' },
  'bulkImport.backToList': { en: 'Back to transfer orders', pl: 'Powrót do zleceń przesunięcia' },
  'bulkImport.columns.toNumber': { en: 'TO number', pl: 'Numer ZP' },
  'bulkImport.columns.fromSite': { en: 'From site', pl: 'Z lokalizacji' },
  'bulkImport.columns.toSite': { en: 'To site', pl: 'Do lokalizacji' },
};

const WO_STAGING: Record<string, { en: string; pl: string }> = {
  ...SHARED,
  'actions.bulkImport': { en: 'Import WOs', pl: 'Importuj ZPr' },
  'bulkImport.title': { en: 'Import work orders', pl: 'Importuj zlecenia produkcyjne' },
  'bulkImport.subtitle': {
    en: 'Upload a CSV to preview and create work orders in bulk.',
    pl: 'Wgraj plik CSV, aby wyświetlić podgląd i utworzyć zlecenia produkcyjne zbiorczo.',
  },
  'bulkImport.breadcrumbCurrent': { en: 'Import', pl: 'Import' },
  'bulkImport.fileHelp': {
    en: 'Columns: wo_number (optional), item_code, qty, uom, routing_id (optional), scheduled_start_time (optional), notes (optional).',
    pl: 'Kolumny: wo_number (opcjonalnie), item_code, qty, uom, routing_id (opcjonalnie), scheduled_start_time (opcjonalnie), notes (opcjonalnie).',
  },
  'bulkImport.createdTitle': { en: 'Import complete.', pl: 'Import zakończony.' },
  'bulkImport.createdCount': { en: '{n} work order(s) created.', pl: 'Utworzono {n} zleceń produkcyjnych.' },
  'bulkImport.backToList': { en: 'Back to work orders', pl: 'Powrót do zleceń produkcyjnych' },
  'bulkImport.columns.woNumber': { en: 'WO number', pl: 'Numer ZPr' },
  'bulkImport.columns.routing': { en: 'Routing', pl: 'Marszruta' },
};

const STAGING: Record<'to' | 'wo', LeafMap> = {
  to: Object.fromEntries(
    Object.entries(TO_STAGING).map(([k, v]) => [k, v.en]),
  ) as LeafMap,
  wo: Object.fromEntries(
    Object.entries(WO_STAGING).map(([k, v]) => [k, v.en]),
  ) as LeafMap,
};

const STAGING_PL: Record<'to' | 'wo', LeafMap> = {
  to: Object.fromEntries(Object.entries(TO_STAGING).map(([k, v]) => [k, v.pl])) as LeafMap,
  wo: Object.fromEntries(Object.entries(WO_STAGING).map(([k, v]) => [k, v.pl])) as LeafMap,
};

/**
 * Returns a guarded translator that reads the live next-intl bundle first
 * (t.has) and falls back to the staged EN/PL value, so a missing key degrades to
 * staged copy instead of throwing. `entity` selects the TO vs WO staging set;
 * `locale` selects EN vs PL for the fallback.
 */
export function makeImportLabel(
  t: { has: (key: string) => boolean; (key: string): string },
  entity: 'to' | 'wo',
  locale: string,
): (key: string) => string {
  return (key: string): string => {
    if (t.has(key)) return t(key);
    const pl = locale === 'pl' ? STAGING_PL[entity][key] : undefined;
    return pl ?? STAGING[entity][key] ?? key;
  };
}
