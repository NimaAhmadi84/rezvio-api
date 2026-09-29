/**
 * Environment Variables Validation
 *
 * در زمان bootstrap اجرا می‌شه و اگه env var حیاتی نباشه، سرور بالا نمیاد.
 * جایگزین silent failure با پیام واضح.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const requiredStrings = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  for (const key of requiredStrings) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  // JWT secrets باید به اندازه کافی طولانی باشن
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = config[key];
    if (typeof value === 'string' && value.length < 16) {
      errors.push(`${key} must be at least 16 characters long`);
    }
  }

  // عددی‌ها
  const numericWithRange: Array<{ key: string; min: number; max: number }> = [
    { key: 'JWT_ACCESS_EXPIRES', min: 60, max: 86400 }, // 1min - 1day
    { key: 'JWT_REFRESH_EXPIRES', min: 3600, max: 31536000 }, // 1h - 1year
    { key: 'PORT', min: 1000, max: 65535 },
  ];

  for (const { key, min, max } of numericWithRange) {
    const raw = config[key];
    if (raw === undefined || raw === '') continue; // اگه تعریف نشده، default استفاده می‌شه
    const num = Number(raw);
    if (!Number.isFinite(num) || num < min || num > max) {
      errors.push(`${key} must be a number between ${min} and ${max}, got "${raw}"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `❌ Environment validation failed:\n  - ${errors.join('\n  - ')}\n` +
        `Check your .env file on this server.`,
    );
  }

  return config;
}