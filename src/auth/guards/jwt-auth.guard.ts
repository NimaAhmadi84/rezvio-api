import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Auth Guard
 *
 * هدف: محافظت از route های نیازمند احراز هویت
 *
 * منطق:
 * - اگه JWT معتبر باشه → user رو در request قرار می‌ده
 * - اگه JWT نامعتبر یا منقضی باشه → UnauthorizedException (401)
 *
 * نکته مهم:
 * همیشه UnauthorizedException throw می‌کنیم (نه err اصلی)
 * چون err ممکنه از انواع مختلف باشه:
 * - TokenExpiredError: توکن منقضی شده (بعد از 15 دقیقه)
 * - JsonWebTokenError: توکن نامعتبر یا corrupt
 * - NotBeforeError: توکن هنوز فعال نشده
 *
 * اگه err رو مستقیم throw کنیم، NestJS نمی‌تونه به HTTP 401 تبدیل کنه
 * و به صورت پیش‌فرض 500 می‌ده (که interceptor رو هم به اشتباه می‌اندازه).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser, info: any): TUser {
    // ──── همیشه UnauthorizedException برگردون ────
    if (err || !user) {
      throw new UnauthorizedException(
        err?.message || 'توکن نامعتبر یا منقضی شده است',
      );
    }
    return user;
  }
}
