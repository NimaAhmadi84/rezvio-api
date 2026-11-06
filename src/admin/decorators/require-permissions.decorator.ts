import { SetMetadata } from '@nestjs/common';

/**
 * کلید متادیتا برای ذخیره‌ی مجوزهای لازم روی route
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator برای تعیین مجوزهای لازم برای دسترسی به یک route
 *
 * استفاده:
 *   @RequirePermissions('user:view')
 *   @Get('users')
 *   findAll() { ... }
 *
 *   @RequirePermissions('user:view', 'user:delete')
 *   @Delete('users/:id')
 *   remove() { ... }
 *
 * نکته: کاربر باید ALL permissions رو داشته باشه (AND logic).
 * اگر می‌خوای OR باشه، دو route جدا بساز.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
