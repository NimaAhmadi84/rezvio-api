import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OtpService } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('OTP')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'درخواست کد یکبار مصرف' })
  async request(@Body() dto: RequestOtpDto) {
    return this.otpService.request(dto.identifier);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تأیید کد یکبار مصرف' })
  async verify(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyCode(dto.identifier, dto.code, dto.name);
  }
}
