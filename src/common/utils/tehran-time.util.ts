/**
 * Iran (Tehran) Time Utilities
 * ────────────────────────────────────────────────────────────
 * ایران از سال ۲۰۲۲ DST نداره → آفست ثابت +03:30
 *
 * چرا این فایل؟
 * - سرور dev روی Windows/Iran، سرور prod احتمالاً UTC
 * - `new Date('2026-10-03T09:00:00')` توی TZهای مختلف نتیجه متفاوت میده
 * - این util فرض می‌کنه هر رشته datetime بدون TZ = ساعت دیواری Tehran
 * - همه‌جا از همین توابع استفاده کنیم → یکسان در dev و prod
 */

const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000; // +03:30

/**
 * تبدیل رشته دیواری Tehran به Date (که در UTC represent میشود).
 * مثال: "2026-10-03T09:00:00" → 2026-10-03T05:30:00.000Z
 */
export function parseTehranDateTime(isoLocal: string): Date {
  // اگر TZ صریح داشت (Z یا +xx:xx)، دست نزن
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(isoLocal)) {
    return new Date(isoLocal);
  }
  // اگر date-only بود، ساعت 00:00 اضافه کن
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoLocal)
    ? `${isoLocal}T00:00:00`
    : isoLocal;
  // فرض کن Tehran wall clock
  const base = new Date(normalized + 'Z');
  return new Date(base.getTime() - TEHRAN_OFFSET_MS);
}

/**
 * اجزای دیواری Tehran برای یک Date (که به عنوان UTC ذخیره شده).
 */
export function getTehranParts(d: Date): {
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
  hour: number;  // 0..23
  minute: number;
  dayOfWeek: number; // 0=Sat ... 6=Fri (Iran week)
} {
  const shifted = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const jsDay = shifted.getUTCDay(); // 0=Sun..6=Sat
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dayOfWeek: (jsDay + 1) % 7, // JS Sun=0 → Iran Sat=0
  };
}

/**
 * "امروز" در Tehran به فرمت YYYY-MM-DD.
 */
export function getTehranTodayISO(): string {
  const p = getTehranParts(new Date());
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * بازه UTC برای یک روز دیواری Tehran.
 * مثال: d=2026-10-03T09:00:00Z → { start: 2026-10-02T20:30:00Z, end: 2026-10-03T20:29:59.999Z }
 */
export function getTehranWallDayRange(d: Date): { start: Date; end: Date } {
  const p = getTehranParts(d);
  const iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T00:00:00`;
  const start = parseTehranDateTime(iso);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/**
 * فرمت YYYY-MM-DD یک Date در Tehran.
 */
export function toTehranDateISO(d: Date): string {
  const p = getTehranParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
