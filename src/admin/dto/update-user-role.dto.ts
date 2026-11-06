import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class UpdateUserRoleDto {
  @ApiProperty({
    enum: ['CUSTOMER', 'OWNER', 'ADMIN'],
    description: 'نقش جدید کاربر',
  })
  @IsIn(['CUSTOMER', 'OWNER', 'ADMIN'], { message: 'نقش نامعتبر است' })
  role!: UserRole;
}
