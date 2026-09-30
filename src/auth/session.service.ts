import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as bcrypt from 'bcryptjs';
import { UAParser } from 'ua-parser-js';
import axios from 'axios';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════
// Phase 10D+: سقف دستگاه‌های فعال همزمان برای هر کاربر
// (الگوی Adobe: کاربر خودش انتخاب می‌کند کدام دستگاه بیرون برود)
// ═══════════════════════════════════════════════════════════════
export const MAX_ACTIVE_SESSIONS = 3;

// ──── فاصله‌ی حداقلی بین دو آپدیت lastActiveAt (cache-guard — طبق §8) ────
const LAST_ACTIVE_TOUCH_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه

// ──── pendingToken: توکن موقت ادامه‌ی لاگین بعد از رفع سقف دستگاه ────
// ۵ دقیقه اعتبار + single-use (jti در cache) + قفل به همان مرورگر (ua fingerprint)
const PENDING_LOGIN_TTL_SECONDS = 300;
const PENDING_LOGIN_TTL_MS = PENDING_LOGIN_TTL_SECONDS * 1000;

export interface DeviceInfo {
  deviceName: string;
  deviceType: string;
  browser?: string;
  os?: string;
}

export interface SessionDto {
  id: string;
  deviceName: string;
  deviceType: string;
  browser?: string;
  os?: string;
  ipAddress: string;
  country?: string;
  city?: string;
  lastActiveAt: string; // ISO string (UTC)
  createdAt: string;    // ISO string (UTC)
  isCurrent: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ──── Hash refresh token برای ذخیره امن در DB ────
  // async تا event loop بلاک نشود (bcrypt ~100ms per call)
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  private async verifyTokenHash(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  // ──── Parse User-Agent برای استخراج اطلاعات دستگاه ────
  parseDevice(userAgent: string): DeviceInfo {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const browserName = result.browser.name || 'Unknown Browser';
    const osName = result.os.name || 'Unknown OS';
    const deviceType = result.device.type || 'desktop';

    return {
      deviceName: `${browserName} on ${osName}`,
      deviceType,
      browser: result.browser.name,
      os: result.os.name,
    };
  }

  // ──── Geolocation از IP (با ip-api.com — رایگان) ────
  async getGeoLocation(ip: string): Promise<{ country: string; city: string }> {
    // Localhost یا IP خصوصی → skip
    if (
      !ip ||
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.')
    ) {
      return { country: 'Local', city: 'Localhost' };
    }

    try {
      const response = await axios.get(
        `http://ip-api.com/json/${ip}?fields=country,city&lang=fa`,
        { timeout: 3000 },
      );
      return {
        country: response.data.country || 'Unknown',
        city: response.data.city || 'Unknown',
      };
    } catch (error) {
      this.logger.warn(`Geolocation failed for IP ${ip}: ${(error as Error).message}`);
      return { country: 'Unknown', city: 'Unknown' };
    }
  }

  // ──── ایجاد session جدید هنگام login ────
  async createSession(
    userId: string,
    refreshToken: string,
    userAgent: string,
    ip: string,
    expiresAt: Date,
  ): Promise<string> {
    const deviceInfo = this.parseDevice(userAgent);
    const geo = await this.getGeoLocation(ip);
    const refreshTokenHash = await this.hashToken(refreshToken);

    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ipAddress: ip,
        country: geo.country,
        city: geo.city,
        expiresAt,
      },
    });

    this.logger.debug(`✅ Session created for user ${userId} (${deviceInfo.deviceName})`);
    return session.id;
  }

  // ════════════════ Phase 10D+ — Device Limit ════════════════

  // ──── شمارش sessionهای فعال کاربر (مبنای سقف دستگاه) ────
  // فقط isActive=true و منقضی‌نشده شمرده می‌شوند — سشن مرده سهمیه اشغال نمی‌کند
  async countActiveSessions(userId: string): Promise<number> {
    return this.prisma.userSession.count({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
    });
  }

  // ──── جایگزینی درجای session (لاگین مجدد از همان مرورگر) ────
  // به‌جای ساخت سشن جدید، همان ردیف آپدیت می‌شود:
  // → id ثابت می‌ماند، سهمیه‌ی ۳ دستگاه مصرف نمی‌شود، localStorage دست‌نخورده می‌ماند
  async replaceSessionInPlace(
    sessionId: string,
    userId: string,
    refreshToken: string,
    userAgent: string,
    ip: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    // سشن باید فعال، منقضی‌نشده و متعلق به همین کاربر باشد
    // (مرورگر مشترک: session-id کاربر قبلی هرگز جایگزین نمی‌شود)
    if (
      !session ||
      !session.isActive ||
      session.expiresAt <= new Date() ||
      session.userId !== userId
    ) {
      return false;
    }

    const deviceInfo = this.parseDevice(userAgent);
    const geo = await this.getGeoLocation(ip);
    const refreshTokenHash = await this.hashToken(refreshToken);

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash,
        expiresAt,
        lastActiveAt: new Date(),
        ipAddress: ip,
        country: geo.country,
        city: geo.city,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
      },
    });

    this.logger.debug(`🔄 Session ${sessionId} replaced in-place for user ${userId}`);
    return true;
  }

  // ──── اعتبارسنجی session هنگام refresh ────
  // اینجا revoke «واقعاً» اعمال می‌شود: سشن غیرفعال/منقضی/غیرمالک
  // یا با هش ناهمخوان → refresh مردود → فرانت logout می‌کند
  async validateForRefresh(
    sessionId: string,
    userId: string,
    refreshToken: string,
  ): Promise<{
    valid: boolean;
    reason?: 'NOT_FOUND' | 'INACTIVE' | 'EXPIRED' | 'OWNERSHIP' | 'HASH_MISMATCH';
  }> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return { valid: false, reason: 'NOT_FOUND' };
    if (!session.isActive) return { valid: false, reason: 'INACTIVE' };
    if (session.expiresAt <= new Date()) return { valid: false, reason: 'EXPIRED' };
    if (session.userId !== userId) return { valid: false, reason: 'OWNERSHIP' };
    if (!(await this.verifyTokenHash(refreshToken, session.refreshTokenHash))) {
      return { valid: false, reason: 'HASH_MISMATCH' };
    }
    return { valid: true };
  }

  // ──── آپدیت lastActiveAt با cache-guard ────
  // حداکثر هر ۵ دقیقه یک DB write برای هر سشن (عملکرد — طبق §8)
  // هیچ‌وقت خطا پرتاب نمی‌کند تا refresh را نشکند
  async touchLastActive(sessionId: string): Promise<void> {
    try {
      const cacheKey = `session-touch:${sessionId}`;
      const touched = await this.cacheManager.get(cacheKey);
      if (touched) return;

      await this.cacheManager.set(cacheKey, '1', LAST_ACTIVE_TOUCH_TTL_MS);
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, isActive: true },
        data: { lastActiveAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `touchLastActive failed for session ${sessionId}: ${(error as Error).message}`,
      );
    }
  }

  // ════════════════ pendingToken — ادامه‌ی لاگین پس از رفع سقف ════════════════
  //
  // سناریو: کاربر با دستگاه چهارم لاگین می‌کند → 409 با pendingToken →
  // او در پروفایلِ ویزارد یکی از ۳ دستگاه را revoke می‌کند → با pendingToken
  // لاگین «بدون تکرار رمز» کامل می‌شود.
  //
  // امنیت:
  //  - امضا با JWT_REFRESH_SECRET اما با type='pending-login' (جدا از refresh token)
  //  - single-use: jti در cache ذخیره و هنگام consume حذف می‌شود
  //  - قفل به مرورگر: fingerprint از User-Agent (سرقت توکن به دستگاه دیگر بی‌فایده است)
  //  - ۵ دقیقه انقضا

  private uaFingerprint(userAgent?: string): string {
    return createHash('sha256').update(userAgent || '').digest('hex').substring(0, 32);
  }

  /** صدور pendingToken برای ادامه‌ی لاگین پس از رفع سقف دستگاه */
  async issuePendingLoginToken(
    userId: string,
    rememberMe: boolean,
    userAgent?: string,
  ): Promise<string> {
    const jti = randomUUID();
    const payload = {
      sub: userId,
      rememberMe,
      type: 'pending-login',
      jti,
      ua: this.uaFingerprint(userAgent),
    };
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');

    const token = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: PENDING_LOGIN_TTL_SECONDS,
    });
    await this.cacheManager.set(`pending-login:${jti}`, '1', PENDING_LOGIN_TTL_MS);
    return token;
  }

  /** بررسی pendingToken بدون مصرف (peek — برای لیست دستگاه‌ها در ویزارد) */
  async verifyPendingLoginToken(
    token: string,
    userAgent?: string,
  ): Promise<{ userId: string; rememberMe: boolean } | null> {
    try {
      const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
      if (!secret) return null;

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        rememberMe?: boolean;
        type?: string;
        jti?: string;
        ua?: string;
      }>(token, { secret });

      if (payload.type !== 'pending-login' || !payload.jti || !payload.sub) return null;
      if (payload.ua !== this.uaFingerprint(userAgent)) return null;

      const exists = await this.cacheManager.get(`pending-login:${payload.jti}`);
      if (!exists) return null; // منقضی یا قبلاً مصرف شده

      return { userId: payload.sub, rememberMe: !!payload.rememberMe };
    } catch {
      return null;
    }
  }

  /** مصرف pendingToken (single-use) — فقط یک‌بار برای complete */
  async consumePendingLoginToken(
    token: string,
    userAgent?: string,
  ): Promise<{ userId: string; rememberMe: boolean } | null> {
    const verified = await this.verifyPendingLoginToken(token, userAgent);
    if (!verified) return null;

    // حذف jti از cache → توکن غیرقابل استفاده مجدد
    try {
      const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
      const payload = await this.jwtService.verifyAsync<{ jti?: string }>(token, { secret });
      if (payload.jti) {
        await this.cacheManager.del(`pending-login:${payload.jti}`);
      }
    } catch {
      // verify بالا موفق شده — این مسیر عملاً رخ نمی‌دهد
    }
    return verified;
  }


  // ──── لیست sessions فعال کاربر ────
  async getActiveSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionDto[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      browser: s.browser ?? undefined,
      os: s.os ?? undefined,
      ipAddress: s.ipAddress,
      country: s.country ?? undefined,
      city: s.city ?? undefined,
      lastActiveAt: s.lastActiveAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    }));
  }

  // ──── حذف یک session خاص (با ownership validation) ────
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session یافت نشد');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('شما مجاز به حذف این session نیستید');
    }

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    this.logger.log(`🔒 Session ${sessionId} revoked for user ${userId}`);
  }

  // ──── حذف همه sessions کاربر (logout from all devices) ────
  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId,
        isActive: true,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { isActive: false },
    });

    this.logger.log(`🔒 ${result.count} sessions revoked for user ${userId}`);
    return result.count;
  }

  // ──── پاکسازی sessions منقضی شده (برای cron job) ────
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isActive: false, lastActiveAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // 30 روز غیرفعال
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(`🧹 Cleaned up ${result.count} expired/inactive sessions`);
    }
    return result.count;
  }
}