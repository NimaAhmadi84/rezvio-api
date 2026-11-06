import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({ description: 'ID کاربری که ادمین می‌شود' })
  @IsUUID('4', { message: 'userId معتبر نیست' })
  userId!: string;

  @ApiProperty({ description: 'ID نقش ادمین' })
  @IsUUID('4', { message: 'roleId معتبر نیست' })
  roleId!: string;
}
