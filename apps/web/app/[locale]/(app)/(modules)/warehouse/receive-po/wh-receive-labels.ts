/**
 * Warehouse GRN receive — server-side i18n (lane G10 bundle).
 * Keys are merged from /tmp/f3/G10-i18n.json at consolidation.
 */
const BUNDLE = {
  en: {
    receivePo: {
      title: 'Receive purchase order',
      subtitle: 'Receive PO lines into stock without a scanner.',
      back: 'Back to inbound',
      backGrns: 'Back to GRNs',
      poLabel: 'Purchase order',
      supplierLabel: 'Supplier',
      linesTitle: 'Lines to receive ({count})',
      emptyLines: 'All lines on this PO are fully received.',
      denied: "You don't have permission to view purchase orders.",
      notFound: "This purchase order doesn't exist or can't be received.",
      invalidState: "This purchase order is closed and can't be received.",
      error: 'Could not load the purchase order. Please retry.',
      col: {
        line: 'Line',
        item: 'Item',
        ordered: 'Ordered',
        received: 'Received',
        outstanding: 'Outstanding',
        status: 'Status',
        action: 'Action',
      },
      status: {
        open: 'Open',
        partial: 'Partial',
        full: 'Full',
        over: 'Over',
        short: 'Short',
      },
      form: {
        qty: 'Qty received',
        qtyHelp: 'Ordered {ordered} · received {received} · outstanding {outstanding}',
        batch: 'Supplier batch / lot',
        batchPlaceholder: 'Optional',
        bestBefore: 'Best before / expiry',
        location: 'Destination location',
        locationPlaceholder: 'Default warehouse',
        receive: 'Receive line',
        receiving: 'Receiving…',
        overConfirm: 'This receipt exceeds the ordered quantity. Check to confirm over-receipt.',
        success: 'Received {qty} {uom} — GRN {grn}, LP {lp}.',
        overNote: 'Over-received vs ordered quantity.',
        qcNote: 'A QC inspection was raised.',
      },
      errors: {
        qtyRequired: 'Enter a quantity greater than zero.',
        forbidden: "You don't have permission to receive into stock.",
        not_found: 'That purchase order line no longer exists.',
        invalid_qty: "That quantity isn't valid.",
        over_receive_cap: 'Cannot exceed 110% of the ordered quantity.',
        over_receive_confirm_required: 'Confirm over-receipt before submitting.',
        no_warehouse: 'No warehouse is configured — set one up in Settings before receiving.',
        invalid_location: 'That destination location is invalid.',
        wac_unsupported_currency:
          'Receipt is blocked because this purchase order is not in GBP. Inventory valuation currently requires GBP — change the PO currency to GBP before receiving, or recreate the order in GBP.',
        error: 'Something went wrong receiving. Please retry.',
      },
    },
    grnDetail: {
      receiveRemaining: 'Receive remaining lines',
      receiptProgress: 'Ordered {ordered} · received {received} · outstanding {outstanding}',
      overReceivedBadge: 'Over-received',
      shortReceivedBadge: 'Short',
    },
    inbound: {
      receiveDesktop: 'Receive on desktop',
    },
  },
  pl: {
    receivePo: {
      title: 'Przyjęcie zamówienia zakupu',
      subtitle: 'Przyjmij linie ZZ na magazyn bez skanera.',
      back: 'Powrót do harmonogramu',
      backGrns: 'Powrót do WPT',
      poLabel: 'Zamówienie zakupu',
      supplierLabel: 'Dostawca',
      linesTitle: 'Linie do przyjęcia ({count})',
      emptyLines: 'Wszystkie linie tego ZZ są już przyjęte.',
      denied: 'Brak uprawnień do podglądu zamówień zakupu.',
      notFound: 'To zamówienie zakupu nie istnieje lub nie można go przyjąć.',
      invalidState: 'To zamówienie zakupu jest zamknięte i nie można go przyjąć.',
      error: 'Nie udało się wczytać zamówienia. Spróbuj ponownie.',
      col: {
        line: 'Linia',
        item: 'Produkt',
        ordered: 'Zamówiono',
        received: 'Przyjęto',
        outstanding: 'Pozostało',
        status: 'Status',
        action: 'Akcja',
      },
      status: {
        open: 'Otwarta',
        partial: 'Częściowo',
        full: 'Pełna',
        over: 'Nadprzyjęcie',
        short: 'Niedobór',
      },
      form: {
        qty: 'Ilość przyjęta',
        qtyHelp: 'Zamówiono {ordered} · przyjęto {received} · pozostało {outstanding}',
        batch: 'Partia dostawcy / lot',
        batchPlaceholder: 'Opcjonalnie',
        bestBefore: 'Data przydatności',
        location: 'Lokalizacja docelowa',
        locationPlaceholder: 'Domyślny magazyn',
        receive: 'Przyjmij linię',
        receiving: 'Przyjmowanie…',
        overConfirm: 'Przyjęcie przekracza zamówioną ilość. Zaznacz, aby potwierdzić nadprzyjęcie.',
        success: 'Przyjęto {qty} {uom} — WPT {grn}, LP {lp}.',
        overNote: 'Nadprzyjęcie względem zamówionej ilości.',
        qcNote: 'Utworzono kontrolę jakości.',
      },
      errors: {
        qtyRequired: 'Wpisz ilość większą od zera.',
        forbidden: 'Brak uprawnień do przyjęcia na magazyn.',
        not_found: 'Ta linia zamówienia już nie istnieje.',
        invalid_qty: 'Ta ilość jest nieprawidłowa.',
        over_receive_cap: 'Nie można przekroczyć 110% zamówionej ilości.',
        over_receive_confirm_required: 'Potwierdź nadprzyjęcie przed wysłaniem.',
        no_warehouse: 'Brak skonfigurowanego magazynu — skonfiguruj go w Ustawieniach.',
        invalid_location: 'Ta lokalizacja docelowa jest nieprawidłowa.',
        wac_unsupported_currency:
          'Przyjęcie jest zablokowane, ponieważ to zamówienie nie jest w GBP. Wycena zapasów wymaga obecnie GBP — zmień walutę ZZ na GBP przed przyjęciem lub utwórz zamówienie ponownie w GBP.',
        error: 'Coś poszło nie tak podczas przyjęcia. Spróbuj ponownie.',
      },
    },
    grnDetail: {
      receiveRemaining: 'Przyjmij pozostałe linie',
      receiptProgress: 'Zamówiono {ordered} · przyjęto {received} · pozostało {outstanding}',
      overReceivedBadge: 'Nadprzyjęcie',
      shortReceivedBadge: 'Niedobór',
    },
    inbound: {
      receiveDesktop: 'Przyjmij na pulpicie',
    },
  },
} as const;

type MsgTree = { [k: string]: string | MsgTree };

function lookup(tree: MsgTree | undefined, dotted: string): string | undefined {
  if (!tree) return undefined;
  let cur: string | MsgTree | undefined = tree;
  for (const part of dotted.split('.')) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = (cur as MsgTree)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    values[key] !== undefined ? String(values[key]) : `{${key}}`,
  );
}

export function getWhReceiveTranslator(locale: string) {
  const primary = locale === 'pl' ? BUNDLE.pl : BUNDLE.en;
  const fallback = BUNDLE.en;

  const t = (key: string, values?: Record<string, string | number>): string => {
    const raw = lookup(primary as MsgTree, key) ?? lookup(fallback as MsgTree, key);
    if (raw === undefined) {
      const last = key.split('.').pop() ?? key;
      return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    }
    return interpolate(raw, values);
  };
  return t;
}

export type WhReceiveTranslator = ReturnType<typeof getWhReceiveTranslator>;
