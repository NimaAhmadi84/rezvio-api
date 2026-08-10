import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// فعلاً Dev Mode - فقط console
// بعداً Kavenegar/MeliPayamak اضافه می‌شه
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
    // Dev Mode: فقط چاپ در console
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
