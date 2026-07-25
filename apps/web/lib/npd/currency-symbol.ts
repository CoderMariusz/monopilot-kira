/** ISO-4217 → display symbol. Leaf module — no UI/domain deps (safe for ItemPicker). */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  GBP: '£',
  USD: '$',
  PLN: 'zł',
  RON: 'lei',
  UAH: '₴',
};

export function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}
