export interface CurrencyDef {
  code: string;
  symbol: string;
  labelKey: "currencyCNY" | "currencyUSD" | "currencyEUR" | "currencyGBP" | "currencyAUD" | "currencyCAD" | "currencyJPY" | "currencyKRW" | "currencyHKD" | "currencySGD";
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "CNY", symbol: "¥", labelKey: "currencyCNY" },
  { code: "USD", symbol: "$", labelKey: "currencyUSD" },
  { code: "EUR", symbol: "€", labelKey: "currencyEUR" },
  { code: "GBP", symbol: "£", labelKey: "currencyGBP" },
  { code: "AUD", symbol: "A$", labelKey: "currencyAUD" },
  { code: "CAD", symbol: "C$", labelKey: "currencyCAD" },
  { code: "JPY", symbol: "¥", labelKey: "currencyJPY" },
  { code: "KRW", symbol: "₩", labelKey: "currencyKRW" },
  { code: "HKD", symbol: "HK$", labelKey: "currencyHKD" },
  { code: "SGD", symbol: "S$", labelKey: "currencySGD" },
];

export const DEFAULT_CURRENCY = "CNY";

export function currencySymbol(code?: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? CURRENCIES[0].symbol;
}

/**
 * Sums pay per currency (never adds different currencies together -- that
 * would silently produce a meaningless number) and formats the result as
 * e.g. "¥120" when everything shares one currency, or "¥120 + $30" when an
 * employer list mixes currencies.
 */
export function formatGroupedPay(byCurrency: Map<string, number>, decimals = 0): string {
  const parts = [...byCurrency.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([code, amount]) => `${currencySymbol(code)}${amount.toFixed(decimals)}`);
  if (parts.length === 0) return `${currencySymbol(DEFAULT_CURRENCY)}0`;
  return parts.join(" + ");
}
