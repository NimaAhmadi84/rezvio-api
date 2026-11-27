import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';
import { AdminSupportService } from './admin-support.service';
import { AdminSupportController } from './admin-support.controller';

/**
 * SupportModule — Phase 27 (Support Center)
 *
 * دو زیرسیستم:
 * 1. SupportTickets (customer-facing):
 *    - SupportTicketsController → /support/tickets
 *    - JwtAuthGuard فقط (هر کاربر احراز هویت‌شده)
 *
 * 2. AdminSupport (admin-facing):
 *    - AdminSupportController → /admin/support/tickets
 *    - JwtAuthGuard + PermissionGuard (ticket:*)
 *
 * Dependencies:
 * - PrismaModule → دسترسی به DB
 * - AuthModule → JwtAuthGuard
 * - AdminModule → PermissionGuard + AdminActivityLogger
 *
 * ⚠️ هیچ سرویسی export نمی‌شود — ماژول leaf است.
 *    اگر بعداً ChatModule خواست از AdminSupportService استفاده کند،
 *    اضافه می‌کنیم به exports.
 */
@Module({
  imports: [PrismaModule, AuthModule, AdminModule, NotificationsModule],
  controllers: [SupportTicketsController, AdminSupportController],
  providers: [SupportTicketsService, AdminSupportService],
})
export class SupportModule {}