import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckIdentifierDto } from './dto/check-identifier.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
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
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
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
  @ApiOperation({ summary: 'بررسی وجود کاربر با شناسه' })
  @ApiResponse({ status: 200, description: 'نتیجه بررسی' })
  async checkIdentifier(@Body() dto: CheckIdentifierDto) {
    const isEmail = dto.identifier.includes('@');
    const user = await this.authService['usersService'].findByEmailOrPhone(dto.identifier);
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
}
