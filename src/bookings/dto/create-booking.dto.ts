import { IsString, IsOptional, IsUUID, IsDateString, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'شناسه کسب‌وکار', example: 'uuid' })
  @IsUUID('4', { message: 'businessId باید UUID معتبر باشد' })
  businessId!: string;

  @ApiProperty({ description: 'شناسه خدمت', example: 'uuid' })
  @IsUUID('4', { message: 'serviceId باید UUID معتبر باشد' })
  serviceId!: string;

  @ApiProperty({ description: 'شناسه کارمند', example: 'uuid' })
  @IsUUID('4', { message: 'staffId باید UUID معتبر باشد' })
  staffId!: string;

  @ApiProperty({ description: 'تاریخ و ساعت شروع رزرو', example: '2026-08-05T14:00:00' })
  @IsDateString({}, { message: 'startTime باید به فرمت ISO 8601 باشد' })
  startTime!: string;

  @ApiPropertyOptional({ description: 'یادداشت برای رزرو', example: 'لطفاً راس ساعت بیایم' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'روش پرداخت',
    enum: PaymentMethod,
    default: PaymentMethod.IN_PERSON,
    example: 'IN_PERSON',
  })
  @IsEnum(PaymentMethod, { message: 'روش پرداخت نامعتبر است (IN_PERSON یا ONLINE)' })
  @IsOptional()
  paymentMethod?: PaymentMethod;

  /**
   * کلید Idempotency — جلوگیری از رزرو تکراری در اثر double-click یا network retry.
   * فرانت‌اند باید یک UUID یکتا per-intent تولید کند و با هر submit ارسال نماید.
   * فرمت: UUID v4 استاندارد
   */
  @ApiProperty({
    description: 'کلید یکتای درخواست (Idempotency Key) — UUID v4',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString({ message: 'idempotencyKey باید رشته باشد' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { message: 'idempotencyKey باید فرمت UUID v4 معتبر داشته باشد' },
  )
  idempotencyKey!: string;
}