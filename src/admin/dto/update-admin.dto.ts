import { IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAdminDto {
  @ApiPropertyOptional({ description: 'نقش جدید' })
  @IsOptional()
  @IsUUID('4', { message: 'roleId معتبر نیست' })
  roleId?: string;

  @ApiPropertyOptional({ description: 'فعال/غیرفعال' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
