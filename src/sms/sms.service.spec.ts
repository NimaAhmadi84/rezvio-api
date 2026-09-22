import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  const createService = (config: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return new SmsService(configService);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails closed in production when SMS gateway is not configured', async () => {
    const service = createService({
      NODE_ENV: 'production',
      SMS_API_KEY: undefined,
    });

    await expect(
      service.sendOtpSms('09120000000', '123456', 5),
    ).rejects.toThrow('سرویس ارسال پیامک فعال نیست');
  });

  it('fails closed in production even when an API key exists until provider integration is implemented', async () => {
    const service = createService({
      NODE_ENV: 'production',
      SMS_API_KEY: 'test-api-key',
    });

    await expect(
      service.sendOtpSms('09120000000', '123456', 5),
    ).rejects.toThrow('سرویس ارسال پیامک هنوز پیاده‌سازی نشده است');
  });

  it('never logs the OTP code in production', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const service = createService({
      NODE_ENV: 'production',
      SMS_API_KEY: undefined,
    });

    await expect(
      service.sendOtpSms('09120000000', '654321', 5),
    ).rejects.toThrow();

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('keeps console OTP output available in development', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const service = createService({
      NODE_ENV: 'development',
      SMS_API_KEY: undefined,
    });

    await expect(
      service.sendOtpSms('09120000000', '123456', 5),
    ).resolves.toBeUndefined();

    expect(consoleLogSpy).toHaveBeenCalled();
    expect(
      consoleLogSpy.mock.calls.some((args) =>
        args.some((arg) => String(arg).includes('123456')),
      ),
    ).toBe(true);
  });

  it('does not log the OTP through Nest Logger in development', async () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const service = createService({
      NODE_ENV: 'development',
      SMS_API_KEY: undefined,
    });

    await service.sendOtpSms('09120000000', '123456', 5);

    expect(loggerLogSpy).toHaveBeenCalledWith('📱 SMS (dev) to 09120000000');
    expect(
      loggerLogSpy.mock.calls.some((args) =>
        args.some((arg) => String(arg).includes('123456')),
      ),
    ).toBe(false);

    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
