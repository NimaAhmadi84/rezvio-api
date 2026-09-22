import { OtpService } from './otp.service';

function buildService(env: Record<string, string | undefined>) {
  const prisma: any = {
    otpCode: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const emailService: any = { sendOtpEmail: jest.fn() };
  const smsService: any = {};
  const authService: any = {
    loginOrCreate: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1' },
      isNew: true,
    }),
  };
  const configService: any = { get: jest.fn((key: string) => env[key]) };
  const service = new OtpService(prisma, emailService, smsService, authService, configService);
  return { service, prisma, authService };
}

describe('OtpService dev/test mode (Phase A)', () => {
  it('fails fast when OTP_DEV_MODE is enabled in production', () => {
    expect(() => buildService({ OTP_DEV_MODE: 'true', NODE_ENV: 'production' })).toThrow(
      'OTP_DEV_MODE is only allowed in development/test environments',
    );
  });

  it('fails fast when OTP_DEV_MODE is enabled in staging', () => {
    expect(() => buildService({ OTP_DEV_MODE: 'true', NODE_ENV: 'staging' })).toThrow(
      'OTP_DEV_MODE is only allowed in development/test environments',
    );
  });

  it('fails fast when OTP_DEV_MODE is enabled with NODE_ENV unset', () => {
    // jest sets process.env.NODE_ENV=test, so clear it explicitly to
    // simulate a truly-unset environment (fail-closed).
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(() => buildService({ OTP_DEV_MODE: 'true' })).toThrow(
        'OTP_DEV_MODE is only allowed in development/test environments',
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('never accepts the dev code in staging even without throwing (fail-closed)', () => {
    const staging = buildService({ NODE_ENV: 'staging' });
    expect(staging.service.isDevOtpMode()).toBe(false);
    expect(staging.service.isDevBypassCode('123456')).toBe(false);
  });

  it('accepts the fixed dev code only in development/test dev mode', () => {
    const dev = buildService({ OTP_DEV_MODE: 'true', NODE_ENV: 'development' });
    expect(dev.service.isDevOtpMode()).toBe(true);
    expect(dev.service.isDevBypassCode('123456')).toBe(true);
    expect(dev.service.isDevBypassCode('654321')).toBe(false);

    const test = buildService({ OTP_DEV_MODE: 'true', NODE_ENV: 'test' });
    expect(test.service.isDevBypassCode('123456')).toBe(true);
  });

  it('never accepts the dev code when dev mode is off', () => {
    const prodLike = buildService({ NODE_ENV: 'test' });
    expect(prodLike.service.isDevBypassCode('123456')).toBe(false);
  });

  it('verifyCode dev bypass logs in without touching the OTP table', async () => {
    const { service, prisma, authService } = buildService({
      OTP_DEV_MODE: 'true',
      NODE_ENV: 'test',
    });

    const res = await service.verifyCode('user@example.com', '123456');

    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(authService.loginOrCreate).toHaveBeenCalledWith(
      'user@example.com',
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(res.otpVerified).toBe(true);
  });

  it('verifyCode still checks the DB for non-dev codes in dev mode', async () => {
    const { service, prisma } = buildService({
      OTP_DEV_MODE: 'true',
      NODE_ENV: 'test',
    });
    prisma.otpCode.findFirst.mockResolvedValue(null);

    await expect(service.verifyCode('user@example.com', '000000')).rejects.toThrow();
    expect(prisma.otpCode.findFirst).toHaveBeenCalled();
  });
});
