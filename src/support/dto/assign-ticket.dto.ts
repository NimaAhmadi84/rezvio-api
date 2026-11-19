import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * AssignTicketDto — تخصیص یا unassign تیکت (فقط Super Admin)
 *
 * - { adminId: "<uuid>" } → تخصیص به آن ادمین
 * - { adminId: null } یا {} → unassign
 *
 * نکته: adminId = Admin.id (نه User.id)
 */
export class AssignTicketDto {
  @ApiPropertyOptional({
    description: 'شناسه ادمین (Admin.id). null یا undefined → unassign',
    nullable: true,
    example: '3f8a1234-5678-90ab-cdef-0123456789ab',
  })
  @IsOptional()
  @IsUUID('4', { message: 'شناسه ادمین نامعتبر است' })
  adminId?: string | null;
}