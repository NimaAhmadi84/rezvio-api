import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OtpService } from '../otp/otp.service';
import * as bcrypt from 'bcryptjs';

// ──── Blacklist رمزهای بسیار رایج — لایه دوم دفاع بک‌اند ────
// توجه: قانون «شامل نبودن نام/ایمیل» به تصمیم صاحب پروژه حذف شد
const COMMON_PASSWORD_BLACKLIST = [
  'password', 'password1', 'password12', 'password123', 'passw0rd',
  '12345678', '123456789', '1234567890', '123456789a', '123456789!',
  'qwerty12', 'qwerty123', 'abc12345', 'abcd1234', 'admin123',
  'iloveyou', 'letmein1', 'welcome1', 'welcome12', 'sunshine1',
  'princess1', 'football1', 'baseball1', 'rezvio12', 'rezvio123',
  'mysecretpassword', 'test1234', 'guest123', 'root1234',
];

// ──── فیلدهای برگشتی پس از تغییر ایمیل (مشترک بین هر دو مسیر) ────
const EMAIL_CHANGE_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  nationalId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
  ) {}

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: dto.password,
        role: dto.role,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  /**
   * ساخت کاربر با پسورد از پیش هش شده (برای استفاده در AuthService)
   */
  async createWithHashedPassword(dto: {
    email: string;
    name: string;
    password: string;
    role: any;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const user = await this.prisma.user.create({
      data: dto,
    });

    const { password, ...result } = user;
    return result;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return users;
  }

  /**
   * دریافت کاربر با ID
   * شامل nationalId و phone برای نمایش در /users/me و صفحه پروفایل
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        nationalId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'کاربر با موفقیت حذف شد' };
  }

  /**
   * پیدا کردن کاربر با ایمیل یا شماره
   */
  async findByEmailOrPhone(identifier: string) {
    const isEmail = identifier.includes('@');
    if (isEmail) {
      return this.prisma.user.findUnique({ where: { email: identifier } });
    }
    return this.prisma.user.findUnique({ where: { phone: identifier } });
  }

  /**
   * ساخت کاربر جدید با حداقل اطلاعات (برای OTP auto-register)
   */
  async createMinimal(data: {
    email?: string;
    phone?: string;
    password?: string;
    name?: string;
    role?: any;
  }) {
    return this.prisma.user.create({ data: data as any });
  }

  /**
   * آپدیت user (برای اضافه کردن password/name بعداً)
   */
  async updateUser(id: string, data: any) {
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * آپدیت پروفایل کاربر (فقط nationalId — یک‌بار ثبت، غیرقابل تغییر)
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (user.nationalId && dto.nationalId && user.nationalId !== dto.nationalId) {
      throw new BadRequestException(
        'کد ملی شما قبلاً در پروفایل ثبت شده است و قابل تغییر نیست.',
      );
    }

    if (dto.nationalId && !this.validateIranianNationalId(dto.nationalId)) {
      throw new BadRequestException('کد ملی نامعتبر است');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { nationalId: dto.nationalId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        nationalId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`🆔 nationalId set for user ${userId} via profile update`);
    return updated;
  }

  /**
   * تغییر نام کاربر
   */
  async changeName(userId: string, name: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        nationalId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`✏️ Name changed for user ${userId}`);
    return updated;
  }

  /**
   * درخواست تغییر ایمیل — ارسال OTP به ایمیل جدید
   */
  async requestEmailChange(userId: string, newEmail: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (user.email === newEmail) {
      throw new BadRequestException('ایمیل جدید نباید با ایمیل فعلی یکسان باشد');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً توسط کاربر دیگری استفاده شده است');
    }

    await this.otpService.request(newEmail);

    this.logger.log(`📧 Email change requested for user ${userId} to ${newEmail}`);
    return { success: true, message: 'کد تایید به ایمیل جدید ارسال شد' };
  }

  /**
   * تایید تغییر ایمیل با OTP — مقید به identifier (ایمیل جدید)
   *
   * قرارداد API: { code, newEmail } — هر دو الزامی.
   * فقط OTPای پذیرفته می‌شود که برای همین ایمیل صادر شده باشد
   * (identifier === newEmail) و منقضی/مصرف/تمام‌تلاش نشده باشد.
   */
  async confirmEmailChange(userId: string, code: string, newEmail: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    const normalizedNewEmail = newEmail?.trim();
    if (!normalizedNewEmail) {
      throw new BadRequestException('ایمیل جدید الزامی است');
    }

    // ──── Dev/test bypass: only with explicit newEmail, never in production ────
    if (this.otpService.isDevBypassCode(code)) {
      return this.applyEmailChangeWithoutOtp(userId, user.email, normalizedNewEmail);
    }

    // ──── Bound path: OTP must belong to the claimed new email ────
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        identifier: normalizedNewEmail,
        verified: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('کد تایید نامعتبر یا منقضی شده است');
    }
    if (otp.attempts >= 3) {
      throw new BadRequestException('تعداد تلاش‌های ناموفق تمام شد. لطفاً دوباره درخواست کد دهید.');
    }
    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('کد تایید نامعتبر یا منقضی شده است');
    }

    return this.applyEmailChangeWithOtp(userId, user.email, otp.id, otp.identifier);
  }

  /**
   * اعمال تغییر ایمیل در مسیر dev bypass (بدون OTP — تک write).
   */
  private async applyEmailChangeWithoutOtp(
    userId: string,
    currentEmail: string | null,
    newEmail: string,
  ) {
    await this.assertEmailChangeable(currentEmail, newEmail);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
      select: EMAIL_CHANGE_SELECT,
    });
    this.logger.log(`✅ Email changed for user ${userId} to ${newEmail}`);
    return updated;
  }

  /**
   * مصرف اتمیک OTP + تغییر ایمیل داخل یک interactive transaction.
   * مصرف فقط وقتی موفق است که همان OTP هنوز verified=false باشد
   * (updateMany مشروط)؛ در برابر دو درخواست همزمان فقط یکی موفق
   * می‌شود و در صورت شکست هر مرحله کل تراکنش rollback می‌شود.
   */
  private async applyEmailChangeWithOtp(
    userId: string,
    currentEmail: string | null,
    otpId: string,
    newEmail: string,
  ) {
    await this.assertEmailChangeable(currentEmail, newEmail);

    const updated = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: { id: otpId, verified: false },
        data: { verified: true },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(
          'کد تایید قبلاً استفاده شده است. لطفاً دوباره درخواست کد دهید.',
        );
      }
      return tx.user.update({
        where: { id: userId },
        data: { email: newEmail },
        select: EMAIL_CHANGE_SELECT,
      });
    });

    this.logger.log(`✅ Email changed for user ${userId} to ${newEmail}`);
    return updated;
  }

  /**
   * بررسی‌های مشترک قبل از تغییر ایمیل (یکسان‌نبودن + تکراری‌نبودن).
   */
  private async assertEmailChangeable(currentEmail: string | null, newEmail: string) {
    if (currentEmail === newEmail) {
      throw new BadRequestException('ایمیل جدید نباید با ایمیل فعلی یکسان باشد');
    }
    const existingUser = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً توسط کاربر دیگری استفاده شده است');
    }
  }

  /**
   * تغییر رمز عبور — قدرت رمز + blacklist (بدون قانون نام/ایمیل)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    if (!user.password) {
      throw new BadRequestException(
        'شما با OTP وارد شده‌اید و رمز عبور ندارید. لطفاً ابتدا رمز عبور تنظیم کنید.',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('رمز عبور فعلی صحیح نیست');
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('رمز عبور جدید و تکرار آن مطابقت ندارند');
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException('رمز جدید نباید با رمز فعلی یکسان باشد');
    }

    // ──── فقط blacklist رمزهای رایج (به تصمیم صاحب پروژه) ────
    const lowerNew = newPassword.toLowerCase();
    if (COMMON_PASSWORD_BLACKLIST.includes(lowerNew)) {
      throw new BadRequestException('این رمز عبور بسیار رایج است؛ یک رمز یکتا انتخاب کنید');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    this.logger.log(`🔐 Password changed for user ${userId}`);
    return { success: true, message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  /**
   * اعتبارسنجی کد ملی ایرانی (الگوریتم رسمی)
   */
  private validateIranianNationalId(nationalId: string): boolean {
    if (!/^\d{10}$/.test(nationalId)) return false;
    if (/^(\d)\1{9}$/.test(nationalId)) return false;

    const digits = nationalId.split('').map(Number);
    const check = digits[9];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }

    const remainder = sum % 11;
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }
}