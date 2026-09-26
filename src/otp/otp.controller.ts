import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OtpService } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('OTP')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'درخواست کد یکبار مصرف' })
  async request(@Body() dto: RequestOtpDto) {
    return this.otpService.request(dto.identifier);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ otp: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'تأیید کد یکبار مصرف + ورود/ثبت‌نام خودکار' })
  async verify(@Body() dto: VerifyOtpDto, @Req() req: any) {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection?.remoteAddress || '';
    return this.otpService.verifyCode(
      dto.identifier,
      dto.code,
      dto.name,
      dto.phone,
      dto.email,
      dto.password,
      dto.rememberMe,
      userAgent,
      ip,
    );
  }
}
