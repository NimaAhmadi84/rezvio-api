import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { UserRole } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRES = 900; // 15 minutes (seconds)
const REFRESH_TOKEN_EXPIRES = 604800; // 7 days (seconds)

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUserDto | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return this.toAuthUserDto(user);
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً در سیستم ثبت شده است');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.usersService.createWithHashedPassword({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      role: dto.role ?? ('CUSTOMER' as UserRole),
    });

    return this.generateTokens(user);
  }

  async login(user: AuthUserDto): Promise<AuthResponseDto> {
    return this.generateTokens(user);
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      if (!refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET is not configured');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: refreshSecret },
      );

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('کاربر یافت نشد');
      }

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      const accessToken = await this.jwtService.signAsync(newPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRES,
      });

      return { accessToken };
    } catch (error) {
      this.logger.warn(`Invalid refresh token attempt: ${(error as Error).message}`);
      throw new UnauthorizedException('Refresh Token نامعتبر یا منقضی شده است');
    }
  }

  // ورود با identifier (email یا phone) + password
  async loginWithPassword(identifier: string, password: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailOrPhone(identifier);
    if (!user || !user.password) {
      throw new UnauthorizedException('شناسه یا رمز عبور اشتباه است');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('شناسه یا رمز عبور اشتباه است');
    }
    return this.generateTokens(this.toAuthUserDto(user));
  }

  // Auto-login یا auto-register بعد از OTP verify
  async loginOrCreate(identifier: string, name?: string): Promise<AuthResponseDto & { isNew: boolean }> {
    const isEmail = identifier.includes('@');
    let user = await this.usersService.findByEmailOrPhone(identifier);
    let isNew = false;

    if (!user) {
      // ثبت‌نام خودکار
      const data: any = { role: 'CUSTOMER' };
      if (isEmail) {
        data.email = identifier;
      } else {
        data.phone = identifier;
      }
      if (name) data.name = name;
      user = await this.usersService.createMinimal(data);
      isNew = true;
      this.logger.log('🆕 کاربر جدید ثبت‌نام شد: ' + identifier);
    }

    const response = await this.generateTokens(this.toAuthUserDto(user));
    return { ...response, isNew };
  }

  private async generateTokens(user: AuthUserDto): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets are not configured');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: ACCESS_TOKEN_EXPIRES,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: REFRESH_TOKEN_EXPIRES,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  private toAuthUserDto(user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    role: any;
    createdAt: Date;
  }): AuthUserDto {
    const dto = new AuthUserDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.phone = user.phone;
    dto.name = user.name;
    dto.role = user.role;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
