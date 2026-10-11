import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };
  const captcha = { HCAPTCHA_SECRET_KEY: 'secret', HCAPTCHA_SITE_KEY: 'site' };

  it('در development بدون کلیدهای کپچا بالا می‌آید', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('بدون NODE_ENV (حالت dev پیش‌فرض) بدون کلیدهای کپچا بالا می‌آید', () => {
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  it('در production بدون کلیدهای کپچا خطا می‌دهد', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/HCAPTCHA_SECRET_KEY/);
  });

  it('در production با کلید خالی (فقط فاصله) خطا می‌دهد', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', HCAPTCHA_SECRET_KEY: '   ', HCAPTCHA_SITE_KEY: 'site' }),
    ).toThrow(/HCAPTCHA_SECRET_KEY/);
  });

  it('در production اگر site key نباشد هم خطا می‌دهد', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', HCAPTCHA_SECRET_KEY: 'secret' }),
    ).toThrow(/HCAPTCHA_SITE_KEY/);
  });

  it('در production با هر دو کلید بالا می‌آید', () => {
    expect(() => validateEnv({ ...base, ...captcha, NODE_ENV: 'production' })).not.toThrow();
  });
});
