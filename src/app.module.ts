import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BusinessesModule } from './businesses/businesses.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { AvailabilityModule } from './availability/availability.module';
import { SlotsModule } from './slots/slots.module';
import { BookingsModule } from './bookings/bookings.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { CategoriesModule } from './categories/categories.module';
import { StatsModule } from './stats/stats.module';
import { OtpModule } from './otp/otp.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true, // 🌍 Global cache - accessible from all modules
      ttl: 30000, // 30 seconds default TTL
      max: 500, // Maximum 500 items in cache
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60000, // 1 minute
          limit: 100, // 100 requests per minute per IP
        },
      ],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    BusinessesModule,
    ServicesModule,
    StaffModule,
    AvailabilityModule,
    SlotsModule,
    BookingsModule,
    EmailModule,
    SmsModule,
    OtpModule,
    CategoriesModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },AppService],
})
export class AppModule {}
