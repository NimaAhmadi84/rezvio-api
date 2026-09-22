import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SMS_API_KEY');
    if (apiKey) {
      this.logger.log('📱 SMS gateway فعال شد');
    } else {
      this.logger.warn('⚠️ SMS تنظیم نشده - پیامک‌ها فقط در console چاپ می‌شن (Dev Mode)');
    }
  }

  async sendOtpSms(to: string, code: string, expiresInMinutes: number): Promise<void> {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
    const apiKey = this.configService.get<string>('SMS_API_KEY');

    // Production must never expose OTP codes in logs.
    if (nodeEnv === 'production') {
      if (!apiKey) {
        this.logger.error('❌ SMS gateway is not configured in production');
        throw new Error('سرویس ارسال پیامک فعال نیست');
      }

      // SMS provider integration will be added separately.
      throw new Error('سرویس ارسال پیامک هنوز پیاده‌سازی نشده است');
    }

    // Development/test only: console OTP is intentionally allowed.
    console.log('');
    console.log('╔════════════════════════════════════╗');
    console.log('║   📱 DEV MODE - OTP SMS            ║');
    console.log('╠════════════════════════════════════╣');
    console.log('║ To:   ' + to.padEnd(28) + '║');
    console.log('║ Code: ' + code.padEnd(28) + '║');
    console.log('║ TTL:  ' + (expiresInMinutes + ' دقیقه').padEnd(28) + '║');
    console.log('╚════════════════════════════════════╝');
    console.log('');
    this.logger.log('📱 SMS (dev) to ' + to);
  }
}
