import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT') || 587,
        secure: false,
        auth: { user, pass },
      });
      this.logger.log('📧 SMTP فعال شد: ' + host);
    } else {
      this.logger.warn('⚠️ SMTP تنظیم نشده - ایمیل‌ها فقط در console چاپ می‌شن (Dev Mode)');
    }
  }

  async sendOtpEmail(to: string, code: string, expiresInMinutes: number): Promise<void> {
    const subject = 'کد ورود به رزویو';
    const html = this.buildOtpTemplate(code, expiresInMinutes);

    if (this.transporter) {
      try {
        const from = this.configService.get<string>('SMTP_FROM') || 'noreply@rezvio.ir';
        await this.transporter.sendMail({ from: 'Rezvio <' + from + '>', to, subject, html });
        this.logger.log('✅ ایمیل OTP ارسال شد به: ' + to);
      } catch (error) {
        this.logger.error('❌ خطا در ارسال: ' + (error as Error).message);
        console.log('[DEV FALLBACK] OTP for ' + to + ': ' + code);
      }
    } else {
      // Dev Mode: فقط چاپ در console
      console.log('');
      console.log('╔════════════════════════════════════╗');
      console.log('║   📧 DEV MODE - OTP EMAIL          ║');
      console.log('╠════════════════════════════════════╣');
      console.log('║ To:   ' + to.padEnd(28) + '║');
      console.log('║ Code: ' + code.padEnd(28) + '║');
      console.log('║ TTL:  ' + (expiresInMinutes + ' دقیقه').padEnd(28) + '║');
      console.log('╚════════════════════════════════════╝');
      console.log('');
    }
  }

  private buildOtpTemplate(code: string, expiresInMinutes: number): string {
    return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="UTF-8"><title>کد ورود</title></head>
<body style="margin:0;padding:0;font-family:Tahoma,Arial,sans-serif;background:linear-gradient(135deg,#eff6ff,#f5f3ff,#fdf2f8);">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:white;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(79,70,229,0.1);">
        <tr><td style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px;text-align:center;">
          <h1 style="margin:0;color:white;font-size:28px;">رزویو</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">پلتفرم هوشمند نوبت‌دهی</p>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center;">
          <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">کد ورود شما</h2>
          <p style="margin:0 0 32px;color:#6b7280;font-size:15px;">برای ورود یا ثبت‌نام، کد زیر را وارد کنید:</p>
          <div style="background:linear-gradient(135deg,#eff6ff,#f5f3ff);border:2px dashed #818cf8;border-radius:16px;padding:24px;margin:0 0 24px;">
            <div style="font-size:36px;font-weight:900;letter-spacing:12px;color:#4f46e5;font-family:'Courier New',monospace;">${code}</div>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;">⏱️ این کد تا ${expiresInMinutes} دقیقه معتبر است</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#6b7280;font-size:13px;">© ${new Date().getFullYear()} رزویو | rezvio.ir</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
