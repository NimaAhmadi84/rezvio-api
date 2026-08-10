import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_MINUTES = 15;

type IdentifierType = 'email' | 'phone';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
  ) {}

  // تبدیل اعداد فارسی به انگلیسی + trim
  private normalize(input: string): string {
    const faToEn = (s: string) =>
      s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
       .replace(/[٠-٩]/g, (d) => String('٠١٢٤٥٦٧٨٩'.indexOf(d)));
    return faToEn(input.trim());
  }

  private detectType(identifier: string): IdentifierType {
    if (identifier.includes('@')) return 'email';
    if (/^09\d{9}$/.test(identifier)) return 'phone';
    throw new BadRequestException('شناسه معتبر نیست. لطفاً ایمیل یا شماره تماس وارد کنید');
  }

  async request(rawIdentifier: string): Promise<{ success: boolean; expiresIn: number }> {
    const identifier = this.normalize(rawIdentifier);
    const type = this.detectType(identifier);

    // Rate limiting
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60000);
    const recentCount = await this.prisma.otpCode.count({
      where: { identifier, createdAt: { gte: windowStart } },
    });
    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
      throw new BadRequestException('تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید');
    }

    // تولید کد ۶ رقمی
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60000);

    await this.prisma.otpCode.create({ data: { identifier, code, expiresAt } });

    // ارسال بر اساس نوع
    if (type === 'email') {
      await this.emailService.sendOtpEmail(identifier, code, OTP_TTL_MINUTES);
    } else {
      await this.smsService.sendOtpSms(identifier, code, OTP_TTL_MINUTES);
    }

    return { success: true, expiresIn: OTP_TTL_MINUTES };
  }

  // فقط validation کد - login در Phase 3E
  async verifyCode(rawIdentifier: string, code: string): Promise<{ identifier: string }> {
    const identifier = this.normalize(rawIdentifier);

    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('کدی یافت نشد. لطفاً ابتدا درخواست کد دهید');
    }
    if (otp.expiresAt < new Date()) {
      throw new BadRequestException('کد منقضی شده است. لطفاً دوباره درخواست دهید');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('تعداد تلاش‌های ناموفق تمام شد. لطفاً دوباره درخواست کد دهید');
    }
    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('کد وارد شده صحیح نیست');
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { verified: true } });
    return { identifier };
  }
}
