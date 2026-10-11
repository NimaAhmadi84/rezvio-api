import {
  Inject,
  forwardRef,
  Logger,
  Controller,
  Post,
  Body,
  ConflictException,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  Res,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { OtpService } from '../otp/otp.service';
import { ConfigService } from '@nestjs/config';
import { HcaptchaService } from '../common/services/hcaptcha.service';
import { SessionService } from './session.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckIdentifierDto } from './dto/check-identifier.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { PendingDeviceSessionsDto, CompleteDeviceLimitLoginDto } from './dto/device-limit.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
    private readonly configService: ConfigService,
    private readonly hcaptchaService: HcaptchaService,
    private readonly sessionService: SessionService,
  ) { }

  private readonly logger = new Logger(AuthController.name);

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ثبت‌نام کاربر جدید' })
  @ApiResponse({
    status: 201,
    description: 'کاربر با موفقیت ثبت‌نام شد',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'ایمیل تکراری' })
  async register(@Body() dto: RegisterDto, @Req() req: any): Promise<AuthResponseDto> {
    // ──── Verify hCaptcha before processing registration ────
    const clientIp = req.ip || req.connection?.remoteAddress;
    await this.hcaptchaService.verifyToken(dto.captchaToken, clientIp);

    // ──── Phase 10D+: ثبت‌نام هم سشن می‌سازد (لاگین خودکار پس از ثبت‌نام) ────
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return this.authService.register(dto, userAgent, ip);
  }


  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'دریافت Access Token جدید با Refresh Token' })
  @ApiResponse({ status: 200, description: 'Access Token جدید' })
  @ApiResponse({ status: 401, description: 'Refresh Token نامعتبر' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: any,
  ): Promise<{ accessToken: string }> {
    // ──── Phase 10D+: اعتبارسنجی سشن هنگام refresh ────
    const sessionId = req.headers['x-current-session-id'] as string | undefined;
    return this.authService.refreshTokens(dto.refreshToken, sessionId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت اطلاعات کاربر فعلی' })
  @ApiResponse({ status: 200, description: 'اطلاعات کاربر' })
  @ApiResponse({ status: 401, description: 'احراز هویت نشده' })
  getProfile(@CurrentUser() user: any) {
    return user;
  }

  @Post('check-identifier')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'بررسی وجود کاربر با شناسه' })
  @ApiResponse({ status: 200, description: 'نتیجه بررسی' })
  async checkIdentifier(@Body() dto: CheckIdentifierDto) {
    const isEmail = dto.identifier.includes('@');
    const user = await this.authService.findForIdentifierCheck(dto.identifier);
    return {
      exists: !!user,
      methods: user
        ? (user.password ? ['password', 'otp'] : ['otp'])
        : ['register'],
      hasPassword: user?.password ? true : false,
      identifier: dto.identifier,
      identifierType: isEmail ? 'email' : 'phone',
    };
  }

  @Post('login-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ورود با رمز عبور' })
  @ApiResponse({ status: 200, description: 'ورود موفق', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'شناسه یا رمز اشتباه' })
  async loginWithPassword(@Body() dto: LoginPasswordDto, @Req() req: any): Promise<AuthResponseDto & { sessionId?: string }> {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const currentSessionId = req.headers['x-current-session-id'] as string | undefined;
    return this.authService.loginWithPassword(dto.identifier, dto.password, dto.rememberMe, userAgent, ip, currentSessionId);
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'فقط برای ادمین (تست RBAC)' })
  @ApiResponse({ status: 200, description: 'دسترسی مجاز' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  adminOnly(@CurrentUser() user: any) {
    return {
      message: 'شما به عنوان ادمین به این endpoint دسترسی دارید',
      user,
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'درخواست بازیابی رمز عبور (ارسال OTP)' })
  @ApiResponse({ status: 200, description: 'درخواست ثبت شد (پیام یکسان برای جلوگیری از Account Enumeration)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any): Promise<{ message: string }> {
    // ──── Verify hCaptcha before sending OTP ────
    const clientIp = req.ip || req.connection?.remoteAddress;
    await this.hcaptchaService.verifyToken(dto.captchaToken, clientIp);

    try {
      await this.otpService.request(dto.identifier);
    } catch (e) {
      this.logger.warn(`forgot-password request failed for ${dto.identifier}: ${(e as Error).message}`);
    }
    return { message: 'اگر حسابی با این شناسه وجود داشته باشد، کد بازیابی ارسال شد' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'تأیید OTP و تغییر رمز عبور' })
  @ApiResponse({ status: 200, description: 'رمز عبور با موفقیت تغییر کرد' })
  @ApiResponse({ status: 400, description: 'کد نامعتبر یا منقضی شده' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.identifier, dto.code, dto.password);
  }

  // ──── Phase 10D: Login History / Active Sessions ────

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'لیست دستگاه‌های فعال (sessions)' })
  @ApiResponse({ status: 200, description: 'لیست sessions فعال' })
  async getSessions(@CurrentUser() user: any, @Req() req: any) {
    // ──── Current session ID from custom header (sent by frontend) ────
    const currentSessionId = req.headers['x-current-session-id'] as string | undefined;
    return this.sessionService.getActiveSessions(user.id, currentSessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروج از یک دستگاه خاص' })
  @ApiResponse({ status: 200, description: 'Session با موفقیت حذف شد' })
  @ApiResponse({ status: 403, description: 'دسترسی غیرمجاز' })
  @ApiResponse({ status: 404, description: 'Session یافت نشد' })
  async revokeSession(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.sessionService.revokeSession(user.id, id);
    return { message: 'این دستگاه با موفقیت خارج شد' };
  }

  @Delete('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'خروج از همه دستگاه‌ها (جز دستگاه فعلی)' })
  @ApiResponse({ status: 200, description: 'همه sessions حذف شدند' })
  async revokeAllSessions(
    @CurrentUser() user: any,
    @Req() req: any,
  ): Promise<{ message: string; count: number }> {
    // ──── Current session ID from custom header (sent by frontend) ────
    const currentSessionId = req.headers['x-current-session-id'] as string | undefined;
    const count = await this.sessionService.revokeAllSessions(user.id, currentSessionId);
    return { message: `از ${count} دستگاه دیگر خارج شدید`, count };
  }

  // ──── Phase 10D+: جریان سقف دستگاه (بدون JWT — با pendingToken) ────

  @Post('sessions/pending')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'لیست دستگاه‌های فعال در جریان سقف دستگاه (با pendingToken)' })
  @ApiResponse({ status: 200, description: 'لیست دستگاه‌های فعال' })
  @ApiResponse({ status: 401, description: 'pendingToken نامعتبر یا منقضی' })
  async pendingDeviceSessions(@Body() dto: PendingDeviceSessionsDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'] || '';
    return this.authService.getPendingDeviceSessions(dto.pendingToken, userAgent);
  }

  @Post('sessions/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'تکمیل لاگین پس از خروج از یکی از دستگاه‌ها (بدون تکرار رمز)' })
  @ApiResponse({ status: 200, description: 'لاگین تکمیل شد', type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'سقف دوباره پر شده (race) — pendingToken جدید در پاسخ' })
  async completeDeviceLimitLogin(
    @Body() dto: CompleteDeviceLimitLoginDto,
    @Req() req: any,
  ): Promise<AuthResponseDto & { sessionId?: string }> {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return this.authService.completeDeviceLimitLogin(dto.pendingToken, dto.revokeSessionId, userAgent, ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'خروج از حساب — غیرفعال‌سازی سشن فعلی سمت سرور' })
  @ApiResponse({ status: 200, description: 'خروج موفق' })
  async logout(@CurrentUser() user: any, @Req() req: any) {
    const currentSessionId = req.headers['x-current-session-id'] as string | undefined;
    if (currentSessionId) {
      try {
        await this.sessionService.revokeSession(user.id, currentSessionId);
      } catch {
        // سشن از قبل نامعتبر/حذف شده — خروج همچنان موفق در نظر گرفته می‌شود
      }
    }
    return { message: 'با موفقیت خارج شدید' };
  }

  // ──── Google OAuth (Login Only — نه Register) ────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'شروع ورود با Google OAuth' })
  async googleAuth(@Req() _req: ExpressRequest) {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback از Google OAuth' })
  async googleAuthRedirect(@Req() req: ExpressRequest, @Res() res: Response) {
    try {
      const userAgent = req.headers['user-agent'] || '';
      const ip = req.ip || req.connection?.remoteAddress || '';
      const googleProfile = req.user as {
        googleId: string;
        email: string;
        firstName: string;
        lastName: string;
        picture?: string;
      };
      const result = await this.authService.loginWithGoogle(googleProfile, false, userAgent, ip);

      // Redirect به فرانت‌اند با tokens در query params
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const sessionIdParam = result.sessionId ? `&sessionId=${result.sessionId}` : '';
      const redirectUrl = `${frontendUrl}/auth?google=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}${sessionIdParam}`;

      return res.redirect(redirectUrl);
    } catch (error) {
      // ──── سقف دستگاه پر: هدایت به استپ device-limit با pendingToken ────
      if (
        error instanceof ConflictException &&
        (error.getResponse() as { code?: string })?.code === 'DEVICE_LIMIT_REACHED'
      ) {
        const pendingToken = (error.getResponse() as { pendingToken?: string }).pendingToken ?? '';
        this.logger.warn(`Google OAuth blocked by device limit — redirecting to device-limit step`);
        const frontendUrl = this.configService.get<string>('FRONTEND_URL');
        return res.redirect(
          `${frontendUrl}/auth?google=device-limit&pendingToken=${encodeURIComponent(pendingToken)}`,
        );
      }
      const errorMessage = error instanceof Error ? error.message : 'خطا در ورود با Google';
      this.logger.error(`Google OAuth failed: ${errorMessage}`);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const encodedMessage = encodeURIComponent(errorMessage);
      return res.redirect(`${frontendUrl}/auth?google=error&message=${encodedMessage}`);
    }
  }
}
