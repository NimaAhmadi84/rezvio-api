import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global HTTP Exception Filter
 *
 * همه خطاها رو به شکل یکسان درمیاره:
 *   { statusCode, message, code?, timestamp, path }
 *
 * - HttpException ها: message اصلی حفظ می‌شه
 * - خطاهای Prisma: پیام مناسب فارسی
 * - خطاهای غیرمنتظره: پیام عمومی + لاگ کامل سرور
 * - در production هیچ stack trace برنمی‌گرده
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'خطای داخلی سرور';
    let code: string | undefined;

    // ──── HttpException (NestJS built-in + custom) ────
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        // class-validator ممکنه آرایه‌ای از پیام‌ها برگردونه
        if (Array.isArray(obj.message)) {
          message = obj.message as string[];
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (typeof obj.error === 'string') {
          message = obj.error;
        }
        if (typeof obj.code === 'string') {
          code = obj.code;
        }
      }
    }
    // ──── Prisma errors (شناسایی با کد) ────
    else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as { code: unknown }).code === 'string'
    ) {
      // Prisma 7 + adapter-pg: بعضی خطاهای Postgres داخل P2039 wrap می‌شن
      // originalCode واقعی در meta.driverAdapterError.cause.code ذخیره شده
      const errObj = exception as {
        code: string;
        meta?: {
          driverAdapterError?: {
            cause?: { originalCode?: string; code?: string };
          };
        };
      };
      const prismaCode = errObj.code;
      const driverCause = errObj.meta?.driverAdapterError?.cause;
      const effectiveCode = driverCause?.originalCode ?? driverCause?.code ?? prismaCode;

      switch (effectiveCode) {
        case 'P2002':
        case '23505': // Postgres unique_violation (unwrap شده)
          statusCode = HttpStatus.CONFLICT;
          message = 'این مقدار قبلاً ثبت شده است';
          code = 'DUPLICATE_ENTRY';
          break;
        case 'P2003':
        case '23503': // Postgres foreign_key_violation (unwrap شده)
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'ارجاع نامعتبر به منبع مرتبط';
          code = 'FOREIGN_KEY_VIOLATION';
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = 'منبع یافت نشد';
          code = 'NOT_FOUND';
          break;
        case 'P1001':
        case 'P1002':
        case 'P2028':
          statusCode = HttpStatus.SERVICE_UNAVAILABLE;
          message = 'ارتباط با دیتابیس برقرار نشد. لطفاً بعداً تلاش کنید';
          code = 'DB_UNAVAILABLE';
          break;
        case '23P01': // Postgres exclusion_violation (booking overlap)
          statusCode = HttpStatus.CONFLICT;
          message = 'این زمان قبلاً رزرو شده است. لطفاً زمان دیگری را انتخاب کنید';
          code = 'BOOKING_OVERLAP';
          break;
        default:
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'خطای دیتابیس';
          code = effectiveCode;
      }
    }
    // ──── خطای غیرمنتظره ────
    else {
      const err = exception as Error;
      this.logger.error(
        `[${request.method} ${request.url}] ${err?.message ?? 'Unknown error'}`,
        err?.stack,
      );
    }

    // ──── لاگ خطاهای 5xx ────
    if (statusCode >= 500) {
      const err = exception as Error;
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode}`,
        isProduction ? undefined : err?.stack,
      );
    }

    // ──── پاسخ نهایی ────
    const errorResponse: Record<string, unknown> = {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
    if (code) {
      errorResponse.code = code;
    }

    // در production، خطاهای 5xx فقط پیام عمومی
    if (isProduction && statusCode >= 500 && !(exception instanceof HttpException)) {
      errorResponse.message = 'خطای داخلی سرور. لطفاً بعداً تلاش کنید';
    }

    response.status(statusCode).json(errorResponse);
  }
}