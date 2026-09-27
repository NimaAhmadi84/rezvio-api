import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Body برای دریافت لیست دستگاه‌های فعال در جریان سقف دستگاه
 * (بعد از 409 DEVICE_LIMIT_REACHED — بدون نیاز به JWT کامل)
 */
export class PendingDeviceSessionsDto {
  @ApiProperty({ description: 'توکن موقت ۵ دقیقه‌ای صادرشده در خطای 409' })
  @IsString()
  @IsNotEmpty({ message: 'pendingToken الزامی است' })
  pendingToken!: string;
}

/**
 * Body برای تکمیل لاگین پس از خروج از یکی از دستگاه‌ها
 */
export class CompleteDeviceLimitLoginDto {
  @ApiProperty({ description: 'توکن موقت ۵ دقیقه‌ای صادرشده در خطای 409' })
  @IsString()
  @IsNotEmpty({ message: 'pendingToken الزامی است' })
  pendingToken!: string;

  @ApiProperty({ description: 'شناسه سشنی که کاربر انتخاب کرده تا خارج شود' })
  @IsUUID('4', { message: 'شناسه session نامعتبر است' })
  revokeSessionId!: string;
}