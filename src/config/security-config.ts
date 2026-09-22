// ──── Startup security validation (Phase A) ────
// Pure function over the environment mapping so it can be unit-tested
// without booting the Nest application.

const MIN_JWT_SECRET_LENGTH = 32;

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function validateSecurityConfig(env: NodeJS.ProcessEnv = process.env): void {
  const access = env.JWT_ACCESS_SECRET;
  const refresh = env.JWT_REFRESH_SECRET;

  if (!access || access.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_ACCESS_SECRET is missing or too short (min ${MIN_JWT_SECRET_LENGTH} chars)`,
    );
  }
  if (!refresh || refresh.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_REFRESH_SECRET is missing or too short (min ${MIN_JWT_SECRET_LENGTH} chars)`,
    );
  }
  if (access === refresh) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  // ──── Dev OTP bypass is only allowed in development/test ────
  // (OtpService also enforces this at construction time; this check
  // fails even earlier with a clear message.)
  // production, staging and every other environment are fail-closed.
  if (env.OTP_DEV_MODE === 'true' && !['development', 'test'].includes(env.NODE_ENV ?? '')) {
    throw new Error('OTP_DEV_MODE is only allowed in development/test environments');
  }
}
