/**
 * Học phí lớp thường: niêm yết một mức gốc 24 tuần.
 * Chiết khấu 24 tuần và 12 tuần do admin khai độc lập trên bảng giá.
 *   24 tuần (48 buổi) = gốc − miễn giảm
 *   12 tuần (24 buổi) = (gốc − miễn giảm 12 tuần) ÷ 2
 * Biên lai luôn in gốc 24 tuần.
 */

/** Dùng khi level chưa khai miễn giảm (dữ liệu cũ trước khi có cột). */
export const FALLBACK_DISCOUNT_24_WEEKS = 600_000;
export const FALLBACK_DISCOUNT_12_WEEKS = 300_000;

export function isTwelveWeekPackage(totalSessions: number) {
  return totalSessions < 48;
}

export function configuredDiscount24(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function discount24Weeks(value: unknown) {
  return configuredDiscount24(value) ?? FALLBACK_DISCOUNT_24_WEEKS;
}

export function discount12Weeks(value: unknown, discount24?: unknown) {
  const configured = configuredDiscount24(value);
  if (configured != null) return configured;
  const configured24 = configuredDiscount24(discount24);
  return configured24 != null ? Math.round(configured24 / 2) : FALLBACK_DISCOUNT_12_WEEKS;
}

export function normalPackageDiscount(
  totalSessions: number,
  discount24?: unknown,
  discount12?: unknown,
) {
  return isTwelveWeekPackage(totalSessions)
    ? discount12Weeks(discount12, discount24)
    : discount24Weeks(discount24);
}

export function normalPackageDiscountLabel(totalSessions: number) {
  return isTwelveWeekPackage(totalSessions)
    ? "Chiết khấu gói 12 tuần"
    : "Chiết khấu gói 24 tuần";
}

/** Giá thu của gói 24 / 48 buổi. Gói khác (96…) không suy ra từ gốc. */
export function derivedNormalPackagePrice(
  basePrice24: number,
  totalSessions: number,
  discount24?: unknown,
  discount12?: unknown,
): number | null {
  if (!Number.isFinite(basePrice24) || basePrice24 <= 0) return null;
  const cut = normalPackageDiscount(totalSessions, discount24, discount12);
  if (totalSessions === 24) {
    return Math.max(0, Math.round((basePrice24 - cut) / 2));
  }
  if (totalSessions === 48) {
    return Math.max(0, Math.round(basePrice24 - cut));
  }
  return null;
}

export function resolveNormalPackagePrice(input: {
  price: unknown;
  totalSessions: number;
  basePrice24?: unknown;
  discount24?: unknown;
  discount12?: unknown;
}) {
  const base = input.basePrice24 == null ? NaN : Number(input.basePrice24);
  const derived = Number.isFinite(base)
    ? derivedNormalPackagePrice(base, input.totalSessions, input.discount24, input.discount12)
    : null;
  if (derived != null) return String(derived);
  const stored = Number(input.price);
  return Number.isFinite(stored) ? String(stored) : "0";
}
