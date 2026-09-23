import {
  Inject,
  forwardRef,
  Logger,
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Get,
  Res,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckIdentifierDto } from './dto/check-identifier.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
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
  ) {}

  private readonly logger = new Logger(AuthController.name);

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ثبت‌نام کاربر جدید' })
  @ApiResponse({
    status: 201,
    description: 'کاربر با موفقیت ثبت‌نام شد',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'ایمیل تکراری' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ورود کاربر' })
  @ApiResponse({
    status: 200,
    description: 'ورود موفق',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'ایمیل یا رمز اشتباه' })
  async login(
    @Body() _dto: LoginDto,
    @Request() req: any,
  ): Promise<AuthResponseDto> {
    return this.authService.login(req.user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'دریافت Access Token جدید با Refresh Token' })
  @ApiResponse({ status: 200, description: 'Access Token جدید' })
  @ApiResponse({ status: 401, description: 'Refresh Token نامعتبر' })
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ accessToken: string }> {
    return this.authService.refreshTokens(dto.refreshToken);
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
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
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
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'ورود با رمز عبور' })
  @ApiResponse({ status: 200, description: 'ورود موفق', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'شناسه یا رمز اشتباه' })
  async loginWithPassword(@Body() dto: LoginPasswordDto): Promise<AuthResponseDto> {
    return this.authService.loginWithPassword(dto.identifier, dto.password);
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
  @Throttle({ otp: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'درخواست بازیابی رمز عبور (ارسال OTP)' })
  @ApiResponse({ status: 200, description: 'درخواست ثبت شد (پیام یکسان برای جلوگیری از Account Enumeration)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    try {
      await this.otpService.request(dto.identifier);
    } catch (e) {
      this.logger.warn(`forgot-password request failed for ${dto.identifier}: ${(e as Error).message}`);
    }
    return { message: 'اگر حسابی با این شناسه وجود داشته باشد، کد بازیابی ارسال شد' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'تأیید OTP و تغییر رمز عبور' })
  @ApiResponse({ status: 200, description: 'رمز عبور با موفقیت تغییر کرد' })
  @ApiResponse({ status: 400, description: 'کد نامعتبر یا منقضی شده' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.identifier, dto.code, dto.password);
  }

  // ──── Google OAuth (Login Only — نه Register) ────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'شروع ورود با Google OAuth' })
  async googleAuth(@Req() req) {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback از Google OAuth' })
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    try {
      const result = await this.authService.loginWithGoogle(req.user);
      
      // Redirect به فرانت‌اند با tokens در query params
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const redirectUrl = `${frontendUrl}/auth?google=success&accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`;
      
      return res.redirect(redirectUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'خطا در ورود با Google';
      this.logger.error(`Google OAuth failed: ${errorMessage}`);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL');
      const encodedMessage = encodeURIComponent(errorMessage);
      return res.redirect(`${frontendUrl}/auth?google=error&message=${encodedMessage}`);
    }
  }
}
