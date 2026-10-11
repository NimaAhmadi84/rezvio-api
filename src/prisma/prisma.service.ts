import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;
  private keepAliveTimer?: NodeJS.Timeout;

  constructor() {
    // 🎯 ساخت Connection Pool بهینه مخصوص Supabase + ایران (latency بالا)
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      // ── Supabase Session Pooler Tuning (P1 — DB Resilience) ──
      // Pool size روی Supabase Nano = 15. max=10 عمداً < 15 است تا:
      //   (۱) headroom برای admin/migration connection باقی بماند
      //   (۲) در ترافیک peak، MaxClientsInSessionMode رخ ندهد
      max: 10,
      min: 2,                              // ۲ connection همیشه warm
      idleTimeoutMillis: 30000,            // زودتر از PgBouncer (~60s) idle را می‌بندیم
      connectionTimeoutMillis: 5000,       // fail fast (best practice 5s)
      statement_timeout: 30000,            // سرور-side query kill
      query_timeout: 30000,                // کلاینت-side query kill
      idle_in_transaction_session_timeout: 30000, // 🛡️ kill orphan transactions (30s)
      maxUses: 7500,                       // 🔄 چرخش connection برای جلوگیری از state accumulation
      application_name: 'rezvio-api',      // برای pg_stat_activity در Supabase Dashboard
      keepAlive: true,                     // 🛡️ TCP keepalive در برابر قطع PgBouncer
      keepAliveInitialDelayMillis: 10000,  // اولین probe بعد از ۱۰s idle
    });

    super({
      adapter: new PrismaPg(pool),
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    this.pool = pool;

    // 📊 لاگ queryهای کند (بیش از 1 ثانیه) — برای بهینه‌سازی آینده
    this.$on('query' as never, (e: any) => {
      if (e.duration > 1000) {
        this.logger.warn(`🐢 Slow query (${e.duration}ms): ${e.query}`);
      }
    });

    pool.on('error', (err) => {
      this.logger.error(`❌ Unexpected error on idle client: ${err.message}`);
    });

    pool.on('connect', () => {
      this.logger.debug('✅ New connection established');
    });

    pool.on('remove', () => {
      this.logger.debug('🔌 Connection removed from pool');
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
      this.logger.log(`📊 Pool config: max=${this.pool.options.max}, min=${this.pool.options.min}`);

      // 🔥 Warm-up: دو query ساده که connectionهای min رو از قبل باز کنن
      // بدون این، اولین query کاربر بعد از idle timeout حدود ۲ ثانیه طول می‌کشه
      await this.$queryRaw`SELECT 1`;
      await this.$queryRaw`SELECT 1`;
      this.logger.log('🔥 Pool warmed up (2 connections active)');

      // 💓 Keepalive: هر 30 ثانیه یه ping کوچیک تا connectionها warm بمونن
      this.keepAliveTimer = setInterval(() => {
        this.$queryRaw`SELECT 1`.catch((err) => {
          this.logger.warn(`Keepalive ping failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, 30_000);
      this.keepAliveTimer.unref();
    } catch (error: unknown) {
      // 🛡️ Fix: در strict mode، error از نوع unknown است و نیاز به type guard دارد
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to connect to database: ${message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('🔌 Database disconnected and pool closed');
  }

  getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}
