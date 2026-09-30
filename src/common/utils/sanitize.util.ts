/**
 * پاک‌سازی متن ورودی کاربر از تگ‌های HTML و فاصله‌های اضافی.
 *
 * چرا هر service نسخه محلی نداشته باشه؟
 *   - defense-in-depth در برابر XSS (frontend هم escape می‌کنه)
 *   - جلوگیری از ذخیره text آلوده در DB
 *   - یکسان‌سازی رفتار sanitize در کل backend
 *
 * ⚠️ توجه: این فقط HTML tag حذف می‌کنه. برای استفاده در HTML rendering
 * واقعی (مثل SweetAlert html:)، حتماً escapeHtml جداگانه اعمال بشه.
 */
export function sanitizeText(input: string): string {
  const noHtml = input.replace(/<[^>]*>/g, '');
  return noHtml.replace(/\s+/g, ' ').trim();
}