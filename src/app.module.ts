import { Module } from '@nestjs/common';
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
import { OtpModule } from './otp/otp.module';

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
