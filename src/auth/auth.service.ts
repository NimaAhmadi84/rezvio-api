import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  HttpStatus,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { UserRole } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { MAX_ACTIVE_SESSIONS, SessionDto, SessionService } from './session.service';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRES = 900; // 15 minutes (ثابت)
const REFRESH_TOKEN_EXPIRES_SHORT = 86400; // 1 day (rememberMe=false)
const REFRESH_TOKEN_EXPIRES_LONG = 2592000; // 30 days (rememberMe=true)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUserDto | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.password) return null;
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;
    return this.toAuthUserDto(user);
  }

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthResponseDto> {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً در سیستم ثبت شده است');
    }
    // ──── Self-registration is always CUSTOMER ────
    // The `role` field is accepted for API compatibility but never trusted:
    // higher roles (OWNER/ADMIN) must be granted by an admin, never self-assigned.
    if (dto.role && dto.role !== ('CUSTOMER' as UserRole)) {
      this.logger.warn(`Ignoring self-registration role request: ${dto.role} for ${dto.email}`);
    }
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.createWithHashedPassword({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      role: 'CUSTOMER' as UserRole,
    });
    return this.generateTokens(this.toAuthUserDto(user), false, userAgent, ip);
  }

  async login(
    user: AuthUserDto,
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthResponseDto> {
    return this.generateTokens(user, rememberMe, userAgent, ip);
  }

  async refreshTokens(
    refreshToken: string,
    sessionId?: string,
  ): Promise<{ accessToken: string }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET is not configured');
      const payload = await this.jwtService.verifyAsync<JwtPayload & Record<string, unknown>>(
        refreshToken,
        { secret: refreshSecret },
      );

      // ──── جلوگیری از قلابی: pendingToken هرگز به‌عنوان refresh پذیرفته نمی‌شود ────
      if (payload.type === 'pending-login') {
        throw new UnauthorizedException('توکن نامعتبر است');
      }

      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException('کاربر یافت نشد');

      // ──── Phase 10D+: اعتبارسنجی واقعی سشن هنگام refresh ────
      // اینجا revoke «واقعاً» اعمال می‌شود: سشن غیرفعال/منقضی/غیرمالک/هش‌ناهمخوان
      // → 401 با پیام واضح → فرانت logout می‌کند.
      // fail-open فقط وقتی هدری ارسال نشده باشد (کلاینت‌های قدیمی — پذیرش تدریجی).
      if (sessionId) {
        const validation = await this.sessionService.validateForRefresh(
          sessionId,
          user.id,
          refreshToken,
        );
        if (!validation.valid) {
          this.logger.warn(
            `Session rejected on refresh (${validation.reason}) for user ${user.id}`,
          );
          throw new UnauthorizedException('نشست شما پایان یافته است. لطفاً دوباره وارد شوید.');
        }
        await this.sessionService.touchLastActive(sessionId);
      }

      const newPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
      const accessToken = await this.jwtService.signAsync(newPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRES,
      });
      return { accessToken };
    } catch (error) {
      // پیام‌های عمدی 401 (سشن مردود) باید دست‌نخورده به فرانت برسند
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn(`Invalid refresh token attempt: ${(error as Error).message}`);
      throw new UnauthorizedException('Refresh Token نامعتبر یا منقضی شده است');
    }
  }

  async loginWithPassword(
    identifier: string,
    password: string,
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
    currentSessionId?: string,
  ): Promise<AuthResponseDto & { sessionId?: string }> {
    const user = await this.usersService.findByEmailOrPhone(identifier);
    if (!user || !user.password) {
      throw new UnauthorizedException('شناسه یا رمز عبور اشتباه است');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('شناسه یا رمز عبور اشتباه است');
    }
    return this.generateTokens(this.toAuthUserDto(user), rememberMe, userAgent, ip, currentSessionId);
  }

  /**
   * Public lookup for the check-identifier endpoint.
   * (Replaces direct private-property access from the controller.)
   */
  async findForIdentifierCheck(identifier: string) {
    return this.usersService.findByEmailOrPhone(identifier);
  }

  async loginOrCreate(
    identifier: string,
    name?: string,
    phone?: string,
    email?: string,
    password?: string,
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
    currentSessionId?: string,
  ): Promise<AuthResponseDto & { isNew: boolean; sessionId?: string }> {
    const isEmail = identifier.includes('@');

    if (!isEmail) {
      throw new BadRequestException('در حال حاضر فقط ثبت‌نام و ورود با ایمیل امکان‌پذیر است');
    }

    let user = await this.usersService.findByEmailOrPhone(identifier);
    let isNew = false;

    if (!user) {
      const data: any = { role: 'CUSTOMER' };
      data.email = identifier;

      if (name) data.name = name;
      if (phone) data.phone = phone;
      if (password) {
        data.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      }

      user = await this.usersService.createMinimal(data);
      isNew = true;
      this.logger.log(`🆕 کاربر جدید ثبت‌نام شد: ${identifier} | Phone: ${phone || 'N/A'}`);
    }

    const response = await this.generateTokens(
      this.toAuthUserDto(user),
      rememberMe,
      userAgent,
      ip,
      currentSessionId,
    );
    return { ...response, isNew };
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 10D+: توکن‌ها + سشن + سقف دستگاه (قلب جریان لاگین)
  // ═══════════════════════════════════════════════════════════════

  /** ساخت جفت توکن access/refresh (DRY — مشترک بین همه‌ی مسیرها) */
  private async signTokenPair(
    user: AuthUserDto,
    refreshExpires: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!accessSecret || !refreshSecret) throw new Error('JWT secrets are not configured');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { secret: accessSecret, expiresIn: ACCESS_TOKEN_EXPIRES }),
      this.jwtService.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpires }),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * تعیین جایگاه سشن برای این لاگین:
   *  ۱) لاگین مجدد از همان مرورگر (session-id معتبر) → replace-in-place (سهمیه مصرف نمی‌شود)
   *  ۲) سقف پر (≥ ۳ فعال) → ConflictException با pendingToken و لیست دستگاه‌ها
   *  ۳) فضای موجود → ساخت سشن جدید
   */
  private async resolveSessionSlot(
    user: AuthUserDto,
    refreshToken: string,
    rememberMe: boolean,
    userAgent: string,
    ip: string,
    refreshExpires: number,
    currentSessionId?: string,
  ): Promise<string | undefined> {
    const expiresAt = new Date(Date.now() + refreshExpires * 1000);

    // ۱) جایگزینی درجا — id سشن ثابت می‌ماند
    if (currentSessionId) {
      const replaced = await this.sessionService.replaceSessionInPlace(
        currentSessionId,
        user.id,
        refreshToken,
        userAgent,
        ip,
        expiresAt,
      );
      if (replaced) return currentSessionId;
    }

    // ۲) سقف دستگاه‌های فعال — فقط سشن‌های فعال و منقضی‌نشده شمرده می‌شوند
    const activeCount = await this.sessionService.countActiveSessions(user.id);
    if (activeCount >= MAX_ACTIVE_SESSIONS) {
      const pendingToken = await this.sessionService.issuePendingLoginToken(
        user.id,
        rememberMe,
        userAgent,
      );
      const activeSessions = await this.sessionService.getActiveSessions(user.id);
      this.logger.warn(
        `⛔ Device limit reached for user ${user.id} (${activeCount}/${MAX_ACTIVE_SESSIONS} active)`,
      );
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'DEVICE_LIMIT_REACHED',
        message: `سقف دستگاه‌های فعال شما (${MAX_ACTIVE_SESSIONS} دستگاه) پر است. برای ادامه، یکی از دستگاه‌های فعلی را خارج کنید.`,
        activeSessions,
        pendingToken,
      });
    }

    // ۳) ساخت سشن جدید
    return this.sessionService.createSession(user.id, refreshToken, userAgent, ip, expiresAt);
  }

  private async generateTokens(
    user: AuthUserDto,
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
    currentSessionId?: string,
  ): Promise<AuthResponseDto & { sessionId?: string }> {
    // ──── Remember Me: 30 days if true, 1 day if false ────
    const refreshExpires = rememberMe ? REFRESH_TOKEN_EXPIRES_LONG : REFRESH_TOKEN_EXPIRES_SHORT;
    const { accessToken, refreshToken } = await this.signTokenPair(user, refreshExpires);

    if (userAgent && ip) {
      try {
        const sessionId = await this.resolveSessionSlot(
          user,
          refreshToken,
          rememberMe,
          userAgent,
          ip,
          refreshExpires,
          currentSessionId,
        );
        return { accessToken, refreshToken, user, sessionId };
      } catch (error) {
        // ۴۰۹ سقف دستگاه عمدی است — باید به فرانت برسد
        if (error instanceof ConflictException) throw error;
        // خطای زیرساختی سشن نباید لاگین را بشکند (fail-open — سشن بدون هدر fail-open است)
        this.logger.warn(`Session slot resolution failed: ${(error as Error).message}`);
        return { accessToken, refreshToken, user };
      }
    }

    return { accessToken, refreshToken, user };
  }

  private toAuthUserDto(user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    role: any;
    createdAt: Date;
  }): AuthUserDto {
    const dto = new AuthUserDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.phone = user.phone;
    dto.name = user.name;
    dto.role = user.role;
    dto.createdAt = user.createdAt;
    return dto;
  }

  // ════════════════ جریان pendingToken (سقف دستگاه) ════════════════

  /**
   * لیست دستگاه‌های فعال برای ویزارد سقف دستگاه — بدون JWT کامل.
   * pendingToken را «مصرف نمی‌کند» (peek) تا complete همچنان کار کند.
   */
  async getPendingDeviceSessions(
    pendingToken: string,
    userAgent?: string,
  ): Promise<SessionDto[]> {
    const pending = await this.sessionService.verifyPendingLoginToken(pendingToken, userAgent);
    if (!pending) {
      throw new UnauthorizedException('درخواست ورود منقضی یا نامعتبر است. لطفاً دوباره وارد شوید.');
    }
    return this.sessionService.getActiveSessions(pending.userId);
  }

  /**
   * تکمیل لاگین پس از خروج از یکی از دستگاه‌ها — بدون تکرار رمز عبور.
   * ۱) مصرف pendingToken (single-use) ۲) خروج از دستگاه انتخابی (ownership چک می‌شود)
   * ۳) جریان عادی توکن+سشن (سقف دوباره چک می‌شود — ایمن در برابر race)
   */
  async completeDeviceLimitLogin(
    pendingToken: string,
    revokeSessionId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthResponseDto & { sessionId?: string }> {
    // ترتیب عمدی: verify (بدون مصرف) → revoke → consume → generate
    // اگر شناسه سشن نامعتبر باشد، pendingToken هنوز مصرف نشده تا کاربر دوباره تلاش کند
    const pending = await this.sessionService.verifyPendingLoginToken(pendingToken, userAgent);
    if (!pending) {
      throw new UnauthorizedException('درخواست ورود منقضی یا نامعتبر است. لطفاً دوباره وارد شوید.');
    }

    await this.sessionService.revokeSession(pending.userId, revokeSessionId);
    const consumed = await this.sessionService.consumePendingLoginToken(pendingToken, userAgent);
    if (!consumed) {
      throw new UnauthorizedException('درخواست ورود منقضی یا نامعتبر است. لطفاً دوباره وارد شوید.');
    }
    this.logger.log(
      `📱 Device-limit login completing for user ${pending.userId} — revoked session ${revokeSessionId}`,
    );

    const user = await this.usersService.findOne(pending.userId);
    return this.generateTokens(this.toAuthUserDto(user), pending.rememberMe, userAgent, ip);
  }

  // ──── Google OAuth Login (فقط برای کاربران موجود — نه Register) ────

  async loginWithGoogle(
    googleUser: {
      googleId: string;
      email: string;
      firstName: string;
      lastName: string;
      picture?: string;
    },
    rememberMe: boolean = false,
    userAgent?: string,
    ip?: string,
  ): Promise<AuthResponseDto & { sessionId?: string }> {
    // پیدا کردن کاربر با ایمیل
    const user = await this.usersService.findByEmailOrPhone(googleUser.email);

    if (!user) {
      // کاربر وجود ندارد — فقط login مجاز است، نه register
      throw new UnauthorizedException(
        'این ایمیل در Rezvio ثبت نشده است. اگر حساب دارید، لطفاً ابتدا در پروفایل خود ایمیل اضافه کنید، سپس با Google وارد شوید.',
      );
    }

    // ریفکتور Phase 10D+: توکن‌ها + سشن + سقف دستگاه همه در generateTokens
    // (حالت سقف پر → ConflictException با pendingToken → کنترلر به /auth ریدایرکت می‌کند)
    return this.generateTokens(this.toAuthUserDto(user), rememberMe, userAgent, ip);
  }

  async resetPassword(
    identifier: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await this.usersService.findByEmailOrPhone(normalizedIdentifier);

    // ──── Dev/test bypass ────
    if (this.otpService.isDevBypassCode(code)) {
      if (!user) {
        this.logger.warn(`DEV reset-password bypass for non-existent user: ${normalizedIdentifier}`);
        return { message: 'اگر حسابی با این شناسه وجود داشته باشد، لینک بازیابی ارسال شد' };
      }
      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
      await this.usersService.updateUser(user.id, { password: hashedPassword });
      await this.revokeAllSessionsAfterPasswordChange(user.id, 'reset-password (dev)');
      this.logger.log(`✅ DEV reset-password bypass used for ${normalizedIdentifier}`);
      return { message: 'رمز عبور با موفقیت تغییر کرد' };
    }

    // ──── Production path: validate OTP atomically ────
    if (!user) {
      return { message: 'اگر حسابی با این شناسه وجود داشته باشد، لینک بازیابی ارسال شد' };
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier: normalizedIdentifier, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.expiresAt < new Date()) {
      return { message: 'اگر حسابی با این شناسه وجود داشته باشد، لینک بازیابی ارسال شد' };
    }

    if (otp.attempts >= 3) {
      throw new BadRequestException('تعداد تلاش‌های ناموفق تمام شد. لطفاً دوباره درخواست کد دهید.');
    }

    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('کد تأیید نامعتبر است.');
    }

    // ──── Atomic: consume OTP + update password in transaction ────
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: { id: otp.id, verified: false },
        data: { verified: true },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('کد تأیید قبلاً استفاده شده است.');
      }
      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
      await tx.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
    });

    // ──── امنیت: تغییر رمز → خروج از همه‌ی دستگاه‌ها (تصمیم صاحب پروژه) ────
    await this.revokeAllSessionsAfterPasswordChange(user.id, 'reset-password');

    this.logger.log(`✅ Password reset successful for ${normalizedIdentifier}`);
    return { message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  /** خروج از همه‌ی دستگاه‌ها پس از تغییر/بازیابی رمز — هرگز جریان اصلی را نمی‌شکند */
  private async revokeAllSessionsAfterPasswordChange(userId: string, via: string): Promise<void> {
    try {
      const count = await this.sessionService.revokeAllSessions(userId);
      this.logger.log(`🔒 ${count} session(s) revoked after password change (${via}) for user ${userId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke sessions after password change (${via}): ${(error as Error).message}`,
      );
    }
  }
}