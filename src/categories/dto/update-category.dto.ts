import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/**
 * DTO برای آپدیت دسته‌بندی
 * تمام فیلدها اختیاری هستن (PartialType از CreateCategoryDto)
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
