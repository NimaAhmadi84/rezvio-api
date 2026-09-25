import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class HcaptchaService {
  private readonly logger = new Logger(HcaptchaService.name);
  private readonly secretKey: string;
  private readonly siteKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('HCAPTCHA_SECRET_KEY', '');
    this.siteKey = this.configService.get<string>('HCAPTCHA_SITE_KEY', '');

    if (!this.secretKey) {
      this.logger.warn('⚠️ HCAPTCHA_SECRET_KEY is not configured — CAPTCHA verification will be skipped');
    }
  }

  /**
   * Verify hCaptcha token with hCaptcha API
   * @param token - The hCaptcha response token from frontend
   * @param remoteIp - Optional client IP for additional verification
   * @returns true if valid, throws BadRequestException if invalid
   */
  async verifyToken(token: string | undefined, remoteIp?: string): Promise<boolean> {
    // ──── Dev mode: skip verification if secret key not configured ────
    if (!this.secretKey) {
      this.logger.warn('Skipping hCaptcha verification (dev mode — no secret key)');
      return true;
    }

    if (!token) {
      throw new BadRequestException('کد امنیتی (CAPTCHA) الزامی است');
    }

    try {
      const response = await axios.post(
        'https://api.hcaptcha.com/siteverify',
        new URLSearchParams({
          secret: this.secretKey,
          response: token,
          ...(remoteIp && { remoteip: remoteIp }),
          sitekey: this.siteKey,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 5000,
        },
      );

      const data = response.data;

      if (!data.success) {
        this.logger.warn(`hCaptcha verification failed: ${JSON.stringify(data['error-codes'])}`);
        throw new BadRequestException('کد امنیتی نامعتبر است. لطفاً دوباره تلاش کنید.');
      }

      this.logger.debug('✅ hCaptcha verification successful');
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`hCaptcha API error: ${errorMessage}`);
      throw new BadRequestException('خطا در بررسی کد امنیتی. لطفاً دوباره تلاش کنید.');
    }
  }
}