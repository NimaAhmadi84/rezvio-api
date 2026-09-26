import { Injectable, BadRequestException, HttpException, HttpStatus, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { AuthService } from '../auth/auth.service';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const MAX_REQUESTS_PER_WINDOW = 1; // فقط ۱ درخواست در هر window
const WINDOW_SECONDS = 120; // ۲ دقیقه (۱۲۰ ثانیه)

// Fixed code accepted ONLY when OTP dev mode is explicitly enabled
// in an allowlisted environment (development/test).
const DEV_OTP_CODE_DEFAULT = '123456';

// ──── OTP dev mode is ONLY allowed in these environments ────
// production, staging and every other environment are fail-closed.
const DEV_OTP_ALLOWED_ENVS = ['development', 'test'];

type IdentifierType = 'email' | 'phone';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    // ──── Fail-fast: dev OTP mode is only allowed in development/test ────
    if (this.isDevModeRequested() && !this.isDevAllowedEnv()) {
      throw new Error('OTP_DEV_MODE is only allowed in development/test environments');
    }
  }

  /** Explicit opt-in via env, e.g. OTP_DEV_MODE=true (dev/test only). */
  private isDevModeRequested(): boolean {
    return this.configService.get<string>('OTP_DEV_MODE') === 'true';
  }

  private currentEnv(): string | undefined {
    return this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
  }

  /** Allowlist gate: development/test only. Everything else is fail-closed. */
  private isDevAllowedEnv(): boolean {
    const env = this.currentEnv();
    return !!env && DEV_OTP_ALLOWED_ENVS.includes(env);
  }

  /** True only when explicitly enabled AND in an allowlisted environment. */
  isDevOtpMode(): boolean {
    return this.isDevModeRequested() && this.isDevAllowedEnv();
  }

  private devBypassCode(): string {
    return this.configService.get<string>('OTP_DEV_CODE') || DEV_OTP_CODE_DEFAULT;
  }

  /** Whether the given code is accepted as the dev/test bypass code. Never true outside development/test. */
  isDevBypassCode(code: string): boolean {
    return this.isDevOtpMode() && code === this.devBypassCode();
  }

  private normalize(input: string): string {
    const faToEn = (s: string) =>
      s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
       .replace(/[٠-٩]/g, (d) => String('٠١٢٤٥٦٧٨٩'.indexOf(d)));
    return faToEn(input.trim());
  }

  private detectType(identifier: string): IdentifierType {
    if (identifier.includes('@')) return 'email';
    if (/^09\d{9}$/.test(identifier)) {
      throw new BadRequestException('در حال حاضر ارسال کد تایید از طریق پیامک غیرفعال است. لطفاً از ایمیل استفاده کنید.');
    }
    throw new BadRequestException('شناسه معتبر نیست. لطفاً ایمیل معتبر وارد کنید.');
  }

  async request(rawIdentifier: string): Promise<{ success: boolean; expiresIn: number }> {
    const identifier = this.normalize(rawIdentifier);
    const type = this.detectType(identifier);

    const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000);
    const recentRequests = await this.prisma.otpCode.findMany({
      where: { identifier, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
    });

    if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldestRequest = recentRequests[recentRequests.length - 1];
      const nextAllowedTime = new Date(oldestRequest.createdAt.getTime() + WINDOW_SECONDS * 1000);
      const secondsUntilNext = Math.ceil((nextAllowedTime.getTime() - Date.now()) / 1000);

      const minutes = Math.floor(secondsUntilNext / 60);
      const seconds = secondsUntilNext % 60;

      let timeMessage = '';
      if (minutes > 0) {
        timeMessage = `${minutes} دقیقه و ${seconds} ثانیه`;
      } else {
        timeMessage = `${seconds} ثانیه`;
      }

      // ──── 429 Too Many Requests + retryAfterSeconds در body (برای فرانت‌اند) ────
      throw new HttpException(
        {
          message: `تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً ${timeMessage} دیگر دوباره تلاش کنید.`,
          retryAfterSeconds: secondsUntilNext,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60000);
    await this.prisma.otpCode.create({ data: { identifier, code, expiresAt } });

    await this.emailService.sendOtpEmail(identifier, code, OTP_TTL_MINUTES);

    return { success: true, expiresIn: OTP_TTL_MINUTES };
  }

  async verifyCode(
    rawIdentifier: string,
    code: string,
    name?: string,
    phone?: string,
    email?: string,
    password?: string,
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
  ): Promise<any> {
    const identifier = this.normalize(rawIdentifier);

    // ──── Dev/test bypass: fixed code, no DB row needed ────
    // Active only when OTP_DEV_MODE=true AND NODE_ENV is development/test.
    if (this.isDevBypassCode(code)) {
      this.logger.warn(`DEV OTP bypass used for ${identifier} (development/test only)`);
      const result = await this.authService.loginOrCreate(identifier, name, phone, email, password, rememberMe, userAgent, ip);
      return { ...result, otpVerified: true };
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('کدی یافت نشد. لطفاً ابتدا درخواست کد دهید.');
    if (otp.expiresAt < new Date()) throw new BadRequestException('کد منقضی شده است. لطفاً دوباره درخواست دهید.');
    if (otp.attempts >= MAX_ATTEMPTS) throw new BadRequestException('تعداد تلاش‌های ناموفق تمام شد. لطفاً دوباره درخواست کد دهید.');

    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('کد وارد شده صحیح نیست.');
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { verified: true } });

    const result = await this.authService.loginOrCreate(identifier, name, phone, email, password, rememberMe, userAgent, ip);
    return { ...result, otpVerified: true };
  }
}