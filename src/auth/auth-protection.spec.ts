import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { LocalAuthGuard } from './guards/local-auth.guard';

describe('Auth protection (Phase A)', () => {
  let authService: AuthService;
  let usersService: {
    findByEmailOrPhone: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByEmailOrPhone: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('t') },
        },
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
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('loginWithPassword throws 401 (not 400) for unknown identifier', async () => {
    usersService.findByEmailOrPhone.mockResolvedValue(null);

    const err = await authService
      .loginWithPassword('ghost@example.com', 'Whatever123!')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getStatus()).toBe(401);
  });

  it('loginWithPassword throws 401 for wrong password', async () => {
    const hash = await bcrypt.hash('Correct123!', 10);
    usersService.findByEmailOrPhone.mockResolvedValue({
      id: 'u1',
      password: hash,
    });

    const err = await authService
      .loginWithPassword('user@example.com', 'Wrong123!')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getStatus()).toBe(401);
  });

  it('checkIdentifier goes through the public service method', async () => {
    const findSpy = jest
      .spyOn(authService, 'findForIdentifierCheck')
      .mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        phone: null,
        name: null,
        nationalId: null,
        password: 'hashed',
        role: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const otpServiceMock = { request: jest.fn(), isDevBypassCode: jest.fn().mockReturnValue(false) } as any;
    const controller = new AuthController(authService, otpServiceMock);

    type CheckIdentifierInput = Parameters<
      AuthController['checkIdentifier']
    >[0];

    const input: CheckIdentifierInput = {
      identifier: 'user@example.com',
    };

    const res = await controller.checkIdentifier(input);

    expect(findSpy).toHaveBeenCalledWith('user@example.com');
    expect(res).toEqual(
      expect.objectContaining({ exists: true, hasPassword: true }),
    );
  });
});

describe('LocalAuthGuard error normalization (Phase A)', () => {
  const guard = new LocalAuthGuard();

  it('converts a plain Error into 401 Unauthorized', () => {
    let thrown: unknown;

    try {
      guard.handleRequest(new Error('boom'), null, null);
    } catch (e: unknown) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(UnauthorizedException);
    expect((thrown as UnauthorizedException).getStatus()).toBe(401);
  });

  it('throws UnauthorizedException when user is missing', () => {
    let thrown: unknown;

    try {
      guard.handleRequest(null, null, null);
    } catch (e: unknown) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(UnauthorizedException);
    expect((thrown as UnauthorizedException).getStatus()).toBe(401);
  });

  it('passes through an existing UnauthorizedException unchanged', () => {
    const original = new UnauthorizedException(
      'ایمیل یا رمز عبور اشتباه است',
    );

    let thrown: unknown;

    try {
      guard.handleRequest(original, null, null);
    } catch (e: unknown) {
      thrown = e;
    }

    expect(thrown).toBe(original);
  });

  it('returns the user when authentication succeeded', () => {
    const user = { id: 'u1' };

    expect(guard.handleRequest(null, user, null)).toBe(user);
  });
});