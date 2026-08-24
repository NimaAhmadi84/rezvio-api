import { IsArray, IsUUID, ValidateNested, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReorderItemDto {
  @ApiProperty({ example: 'uuid-of-image', description: 'ID تصویر' })
  @IsUUID('4', { message: 'ID تصویر نامعتبر است' })
  id!: string;

  @ApiProperty({ example: 0, description: 'ترتیب جدید' })
  @IsNumber({}, { message: 'sortOrder باید عدد باشد' })
  sortOrder!: number;
}

export class ReorderBusinessImagesDto {
  @ApiProperty({
    type: [ReorderItemDto],
    description: 'لیست تصاویر با ترتیب جدید',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  images!: ReorderItemDto[];
}