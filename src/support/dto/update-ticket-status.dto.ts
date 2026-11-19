import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';

/**
 * UpdateTicketStatusDto — تغییر وضعیت تیکت (فقط ادمین با ticket:change-status)
 *
 * ⚠️ اعتبارسنجی transitions در service انجام می‌شود (نه در DTO):
 *   - OPEN → IN_PROGRESS/CLOSED
 *   - IN_PROGRESS → RESOLVED/CLOSED
 *   - RESOLVED → CLOSED/OPEN (reopen)
 *   - CLOSED → OPEN (reopen — نادر)
 */
export class UpdateTicketStatusDto {
  @ApiProperty({
    enum: TicketStatus,
    description: 'وضعیت جدید تیکت',
  })
  @IsEnum(TicketStatus, { message: 'وضعیت نامعتبر است' })
  status!: TicketStatus;
}