import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;

  constructor() {
    // 🎯 ساخت Connection Pool بهینه مخصوص Supabase + ایران (latency بالا)
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: 20,                        // حداکثر 20 connection همزمان
      min: 2,                         // حداقل 2 connection همیشه باز
      idleTimeoutMillis: 30000,       // 30 ثانیه قبل از بستن connection غیرفعال
      connectionTimeoutMillis: 15000, // 15 ثانیه timeout برای اتصال اولیه
      statement_timeout: 30000,       // 30 ثانیه timeout برای هر query
      query_timeout: 30000,           // 30 ثانیه timeout برای هر query
      application_name: 'rezvio-api', // برای تشخیص در Supabase Dashboard
      keepAlive: true,                // 🛡️ جلوگیری از قطع شدن اتصال توسط Supabase (Idle timeout)
      keepAliveInitialDelayMillis: 10000, // ارسال اولین Keep-Alive بعد از 10 ثانیه
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
    } catch (error: unknown) {
      // 🛡️ Fix: در strict mode، error از نوع unknown است و نیاز به type guard دارد
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to connect to database: ${message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
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
