import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UAParser } from 'ua-parser-js';
import axios from 'axios';

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
  ) {}

  // ──── Hash refresh token برای ذخیره امن در DB ────
  private hashToken(token: string): string {
    return bcrypt.hashSync(token, 10);
  }

  private verifyTokenHash(token: string, hash: string): boolean {
    return bcrypt.compareSync(token, hash);
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
    const refreshTokenHash = this.hashToken(refreshToken);

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

  // ──── پیدا کردن session با refresh token (برای validate) ────
  async findSessionByRefreshToken(refreshToken: string): Promise<{ id: string; userId: string; isActive: boolean } | null> {
    const sessions = await this.prisma.userSession.findMany({
      where: { isActive: true, expiresAt: { gt: new Date() } },
    });

    for (const session of sessions) {
      if (this.verifyTokenHash(refreshToken, session.refreshTokenHash)) {
        return { id: session.id, userId: session.userId, isActive: session.isActive };
      }
    }
    return null;
  }

  // ──── آپدیت lastActiveAt هنگام هر API call ────
  async updateLastActive(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });
  }

  // ──── لیست sessions فعال کاربر ────
  async getActiveSessions(userId: string, currentSessionId?: string): Promise<SessionDto[]> {
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