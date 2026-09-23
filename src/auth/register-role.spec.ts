import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';

describe('AuthService.register role hardening (Phase A)', () => {
  let authService: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    createWithHashedPassword: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      createWithHashedPassword: jest.fn().mockImplementation(async (data) => ({
        id: 'user-id-1',
        email: data.email,
        phone: null,
        name: data.name,
        role: data.role,
        createdAt: new Date(),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed-token') } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return 'a'.repeat(40);
              if (key === 'JWT_REFRESH_SECRET') return 'b'.repeat(40);
              return undefined;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            otpCode: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            $transaction: jest.fn((fn) => fn({ otpCode: { updateMany: jest.fn() }, user: { update: jest.fn() } })),
          },
        },
        {
          provide: OtpService,
          useValue: { request: jest.fn(), isDevBypassCode: jest.fn().mockReturnValue(false) },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('forces CUSTOMER even when dto requests ADMIN', async () => {
    const res = await authService.register({
      email: 'attacker@example.com',
      name: 'Test User',
      password: 'StrongPass123!',
      role: UserRole.ADMIN,
    } as any);

    expect(usersService.createWithHashedPassword).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' }),
    );
    expect(res.user.role).toBe('CUSTOMER');
  });

  it('forces CUSTOMER even when dto requests OWNER', async () => {
    await authService.register({
      email: 'owner-try@example.com',
      name: 'Test User',
      password: 'StrongPass123!',
      role: UserRole.OWNER,
    } as any);

    expect(usersService.createWithHashedPassword).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'CUSTOMER' }),
    );
  });

  it('still registers a plain CUSTOMER request', async () => {
    const res = await authService.register({
      email: 'normal@example.com',
      name: 'Normal User',
      password: 'StrongPass123!',
    } as any);

    expect(res.user.role).toBe('CUSTOMER');
    expect(res.accessToken).toBe('signed-token');
    expect(res.refreshToken).toBe('signed-token');
  });
});
