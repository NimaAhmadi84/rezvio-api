import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { HcaptchaService } from '../common/services/hcaptcha.service';
import { SessionService } from './session.service';

const ACCESS_TOKEN_EXPIRES = 900; // 15 minutes (seconds)

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => OtpModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: ACCESS_TOKEN_EXPIRES,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    SessionService,
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    HcaptchaService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, SessionService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}