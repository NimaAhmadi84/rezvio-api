import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PermissionGuard } from './guards/permission.guard';
import { AdminActivityLogger } from './admin-activity-logger.service';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminManagementService } from './admin-management.service';
import { AdminManagementController } from './admin-management.controller';

/**
 * AdminModule — RBAC module
 *
 * این ماژول فعلاً فقط PermissionGuard رو export می‌کنه.
 * در فازهای بعدی (۳ به بعد):
 * - AdminService (مدیریت ادمین‌ها و نقش‌ها)
 * - AdminController (REST endpoints)
 * - AdminUsersController (مدیریت کاربران)
 * - AdminBookingsController (مدیریت رزروها)
 * و ... به این ماژول اضافه می‌شن.
 *
 * Guard ها (PermissionGuard) به صورت global register نمی‌شن؛
 * هر controller که بخواد RBAC داشته باشه، به صورت دستی
 * @UseGuards(JwtAuthGuard, PermissionGuard) می‌زنه.
 */
@Module({
  imports: [PrismaModule, BookingsModule],
  controllers: [
    AdminUsersController,
    AdminBookingsController,
    AdminDashboardController,
    AdminManagementController,
  ],
  providers: [
    PermissionGuard,
    AdminActivityLogger,
    AdminUsersService,
    AdminBookingsService,
    AdminDashboardService,
    AdminManagementService,
  ],
  exports: [PermissionGuard, AdminActivityLogger],
})
export class AdminModule {}
