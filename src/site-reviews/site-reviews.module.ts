import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SiteReviewsService } from './site-reviews.service';
import { SiteReviewsController } from './site-reviews.controller';
import { AdminSiteReviewsService } from './admin-site-reviews.service';
import { AdminSiteReviewsController } from './admin-site-reviews.controller';

/**
 * SiteReviewsModule — نظرات کاربران درباره خود سایت رزویو (Phase 29)
 *
 * دو زیرسیستم:
 * 1. SiteReviews (customer-facing):
 *    - SiteReviewsController → /site-reviews
 *    - JwtAuthGuard / OptionalJwtAuthGuard
 *
 * 2. AdminSiteReviews (admin-facing):
 *    - AdminSiteReviewsController → /admin/site-reviews
 *    - JwtAuthGuard + PermissionGuard (site-review:*)
 *
 * Dependencies:
 * - PrismaModule → دسترسی به DB
 * - AuthModule → JwtAuthGuard
 * - AdminModule → PermissionGuard + AdminActivityLogger
 * - NotificationsModule → اعلان‌های تأیید/رد به نظردهنده
 */
@Module({
  imports: [PrismaModule, AuthModule, AdminModule, NotificationsModule],
  controllers: [SiteReviewsController, AdminSiteReviewsController],
  providers: [SiteReviewsService, AdminSiteReviewsService],
})
export class SiteReviewsModule {}
