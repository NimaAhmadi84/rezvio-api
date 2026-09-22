import { validateSecurityConfig, isProductionEnv } from './security-config';

describe('security-config (Phase A)', () => {
  const goodEnv = () => ({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  });

  it('accepts a valid non-production env', () => {
    expect(() => validateSecurityConfig(goodEnv() as any)).not.toThrow();
  });

  it('rejects missing JWT_ACCESS_SECRET', () => {
    const env: any = goodEnv();
    delete env.JWT_ACCESS_SECRET;
    expect(() => validateSecurityConfig(env)).toThrow('JWT_ACCESS_SECRET');
  });

  it('rejects short secrets', () => {
    expect(() =>
      validateSecurityConfig({ ...goodEnv(), JWT_ACCESS_SECRET: 'short' } as any),
    ).toThrow('too short');
  });

  it('rejects identical access/refresh secrets', () => {
    const same = 's'.repeat(40);
    expect(() =>
      validateSecurityConfig({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: same,
        JWT_REFRESH_SECRET: same,
      } as any),
    ).toThrow('must differ');
  });

  it('rejects OTP_DEV_MODE in production', () => {
    expect(() =>
      validateSecurityConfig({
        ...goodEnv(),
        NODE_ENV: 'production',
        OTP_DEV_MODE: 'true',
      } as any),
    ).toThrow('OTP_DEV_MODE');
  });

  it('rejects OTP_DEV_MODE in staging and other non-dev environments', () => {
    for (const nodeEnv of ['staging', 'preview', 'qa', '']) {
      expect(() =>
        validateSecurityConfig({
          ...goodEnv(),
          NODE_ENV: nodeEnv,
          OTP_DEV_MODE: 'true',
        } as any),
      ).toThrow('OTP_DEV_MODE');
    }
  });

  it('rejects OTP_DEV_MODE when NODE_ENV is unset (fail-closed)', () => {
    const env: any = goodEnv();
    delete env.NODE_ENV;
    env.OTP_DEV_MODE = 'true';
    expect(() => validateSecurityConfig(env)).toThrow('OTP_DEV_MODE');
  });

  it('allows OTP_DEV_MODE outside production', () => {
    expect(() =>
      validateSecurityConfig({ ...goodEnv(), OTP_DEV_MODE: 'true' } as any),
    ).not.toThrow();
  });

  it('isProductionEnv reflects NODE_ENV', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' } as any)).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'test' } as any)).toBe(false);
  });
});
