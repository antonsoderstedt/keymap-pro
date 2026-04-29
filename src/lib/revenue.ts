/**
 * Revenue Intelligence — beräknar kronvärde på SEO/SEM-data.
 * Allt värde uttrycks i SEK/år om inte annat anges.
 */

// Konservativ CTR-kurva per genomsnittlig SERP-position (Sistrix/AWR 2024 mix).
const CTR_BY_POSITION: Record<number, number> = {
  1: 0.319, 2: 0.247, 3: 0.187, 4: 0.137, 5: 0.099,
  6: 0.072, 7: 0.054, 8: 0.04, 9: 0.031, 10: 0.025,
};

export function ctrAtPosition(position: number): number {
  if (!position || position < 1) return CTR_BY_POSITION[1];
  const rounded = Math.max(1, Math.round(position));
  if (rounded <= 10) return CTR_BY_POSITION[rounded];
  // Position 11-30 dämpas snabbt
  if (rounded <= 20) return 0.012;
  if (rounded <= 30) return 0.005;
  return 0.001;
}

export interface RevenueSettings {
  avg_order_value: number;
  conversion_rate_pct: number;
  gross_margin_pct: number;
  currency?: string;
}

export const DEFAULT_REVENUE: RevenueSettings = {
  avg_order_value: 1000,
  conversion_rate_pct: 2,
  gross_margin_pct: 100,
};

/** Förväntat årligt värde av ett sökord vid given position. */
export function estimateKeywordValue(
  monthlyVolume: number,
  position: number,
  s: RevenueSettings = DEFAULT_REVENUE,
): number {
  if (!monthlyVolume || monthlyVolume <= 0) return 0;
  const clicksPerMonth = monthlyVolume * ctrAtPosition(position);
  const conversions = clicksPerMonth * (s.conversion_rate_pct / 100);
  const revenue = conversions * s.avg_order_value * (s.gross_margin_pct / 100);
  return Math.round(revenue * 12);
}

/** Potential av att förbättra position fromPos → toPos. */
export function estimatePositionUplift(
  monthlyVolume: number,
  fromPos: number,
  toPos: number,
  s: RevenueSettings = DEFAULT_REVENUE,
): number {
  const cur = estimateKeywordValue(monthlyVolume, fromPos, s);
  const tgt = estimateKeywordValue(monthlyVolume, toPos, s);
  return Math.max(0, tgt - cur);
}

/** Värde av en sida från GSC-rader (clicks-baserat när vi har faktiska klick). */
export function estimatePageValueFromClicks(
  clicks: number,
  s: RevenueSettings = DEFAULT_REVENUE,
): number {
  if (!clicks || clicks <= 0) return 0;
  const conversions = clicks * (s.conversion_rate_pct / 100);
  return Math.round(conversions * s.avg_order_value * (s.gross_margin_pct / 100));
}

/** Annonsspill: spend som inte genererade konvertering över ROAS-mål. */
export function estimateAdsWaste(
  spend: number,
  conversionsValue: number,
  targetRoas: number = 3,
): number {
  if (!spend || spend <= 0) return 0;
  const expectedRevenue = spend * targetRoas;
  return Math.max(0, expectedRevenue - (conversionsValue || 0));
}

export type Currency = "SEK" | "EUR" | "USD" | "GBP" | "NOK" | "DKK";

export const SUPPORTED_CURRENCIES: { code: Currency; label: string; locale: string; compactSuffix: string; compactBig: string }[] = [
  { code: "SEK", label: "Svenska kronor (kr)", locale: "sv-SE", compactSuffix: "tkr", compactBig: "MSEK" },
  { code: "EUR", label: "Euro (€)", locale: "de-DE", compactSuffix: "k €", compactBig: "M €" },
  { code: "USD", label: "US dollar ($)", locale: "en-US", compactSuffix: "k $", compactBig: "M $" },
  { code: "GBP", label: "Brittiska pund (£)", locale: "en-GB", compactSuffix: "k £", compactBig: "M £" },
  { code: "NOK", label: "Norska kronor (kr)", locale: "nb-NO", compactSuffix: "tkr", compactBig: "MNOK" },
  { code: "DKK", label: "Danska kronor (kr)", locale: "da-DK", compactSuffix: "tkr", compactBig: "MDKK" },
];

const CURRENCY_META: Record<Currency, { locale: string; compactSuffix: string; compactBig: string }> = SUPPORTED_CURRENCIES.reduce(
  (acc, c) => ({ ...acc, [c.code]: { locale: c.locale, compactSuffix: c.compactSuffix, compactBig: c.compactBig } }),
  {} as any,
);

export function isSupportedCurrency(c: string | null | undefined): c is Currency {
  return !!c && (SUPPORTED_CURRENCIES.some((x) => x.code === c));
}

export function formatMoney(
  amount: number,
  currency: Currency = "SEK",
  opts: { compact?: boolean } = {},
): string {
  if (!isFinite(amount)) return "—";
  const meta = CURRENCY_META[currency] || CURRENCY_META.SEK;
  const abs = Math.abs(amount);
  if (opts.compact && abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} ${meta.compactBig}`;
  }
  if (opts.compact && abs >= 10_000) {
    return `${Math.round(amount / 1000).toLocaleString(meta.locale)} ${meta.compactSuffix}`;
  }
  return new Intl.NumberFormat(meta.locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/** Bakåtkompatibel — defaultar till SEK men accepterar valuta-override. */
export function formatSEK(
  amount: number,
  opts: { compact?: boolean; currency?: Currency } = {},
): string {
  return formatMoney(amount, opts.currency || "SEK", { compact: opts.compact });
}

export function valueColor(amount: number): "green" | "yellow" | "red" | "neutral" {
  const abs = Math.abs(amount);
  if (abs >= 100_000) return "red";
  if (abs >= 20_000) return "yellow";
  if (abs > 0) return "green";
  return "neutral";
}
