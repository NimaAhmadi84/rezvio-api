import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersService } from './users.service';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';

const currentUser = { id: 'user-1', email: 'old@example.com' };
const updatedUser = { id: 'user-1', email: 'new@example.com' };

/**
 * Mock Prisma with a SHARED otp row so the atomic conditional consume
 * (updateMany where id + verified=false) behaves like the real DB:
 * the first concurrent consumer wins (count 1), the rest get count 0.
 */
function buildService() {
  const otpRow = {
    id: 'otp-1',
    identifier: 'new@example.com',
    code: '111111',
    attempts: 0,
    verified: false,
  };

  const tx = {
    otpCode: {
      updateMany: jest.fn(async ({ where }: any) => {
        if (where?.id === otpRow.id && where?.verified === false && otpRow.verified === false) {
          otpRow.verified = true;
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    user: {
      update: jest.fn(async () => ({ ...updatedUser })),
    },
  };

  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(async () => ({ ...updatedUser })),
    },
    otpCode: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where?.identifier !== otpRow.identifier || otpRow.verified) return null;
        return {
          id: otpRow.id,
          identifier: otpRow.identifier,
          code: otpRow.code,
          attempts: otpRow.attempts,
        };
      }),
      update: jest.fn(async (args: any) => {
        if (args?.data?.attempts !== undefined) otpRow.attempts = args.data.attempts;
        return { ...otpRow };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const otpService: any = { isDevBypassCode: jest.fn().mockReturnValue(false) };
  const service = new UsersService(prisma, otpService);
  return { service, prisma, otpService, otpRow, tx };
}

function mockFreeEmail(prisma: any) {
  prisma.user.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.id) return currentUser;
    return null; // new email is free
  });
}

describe('ConfirmEmailChangeDto validation (contract: { code, newEmail })', () => {
  it('missing newEmail fails validation (400-equivalent)', async () => {
    const dto = plainToInstance(ConfirmEmailChangeDto, { code: '111111' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'newEmail')).toBe(true);
  });

  it('{ code, newEmail } passes validation', async () => {
    const dto = plainToInstance(ConfirmEmailChangeDto, {
      code: '111111',
      newEmail: 'new@example.com',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('UsersService.confirmEmailChange identifier binding (required newEmail)', () => {
  it('rejects at runtime when newEmail is missing', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(currentUser);

    await expect(
      service.confirmEmailChange('user-1', '111111', undefined as any),
    ).rejects.toThrow('ایمیل جدید الزامی است');
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('success: correct OTP + correct newEmail, conditional consume inside one transaction', async () => {
    const { service, prisma, tx, otpRow } = buildService();
    mockFreeEmail(prisma);

    const res = await service.confirmEmailChange('user-1', '111111', 'new@example.com');

    expect(prisma.otpCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ identifier: 'new@example.com' }),
      }),
    );
    // Consumer MUST be conditional on verified=false (race-safe).
    expect(tx.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'otp-1', verified: false }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(otpRow.verified).toBe(true);
    expect(res).toEqual(expect.objectContaining({ email: updatedUser.email }));
  });

  it('rejects an OTP issued for a DIFFERENT email', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(currentUser);

    await expect(
      service.confirmEmailChange('user-1', '111111', 'attacker@example.com'),
    ).rejects.toThrow('کد تایید نامعتبر یا منقضی شده است');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('wrong code increments attempts of THAT otp row and rejects', async () => {
    const { service, prisma, otpRow } = buildService();
    prisma.user.findUnique.mockResolvedValue(currentUser);

    await expect(
      service.confirmEmailChange('user-1', '999999', 'new@example.com'),
    ).rejects.toThrow('کد تایید نامعتبر یا منقضی شده است');
    expect(otpRow.attempts).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects exhausted codes (attempts >= 3) with zero writes', async () => {
    const { service, prisma, otpRow } = buildService();
    prisma.user.findUnique.mockResolvedValue(currentUser);
    otpRow.attempts = 3;

    await expect(
      service.confirmEmailChange('user-1', '111111', 'new@example.com'),
    ).rejects.toThrow('تعداد تلاش');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(otpRow.verified).toBe(false);
  });

  it('transaction failure leaves the OTP unverified (rollback)', async () => {
    const { service, prisma, otpRow, tx } = buildService();
    mockFreeEmail(prisma);

    prisma.$transaction.mockImplementationOnce(async (callback: any) => {
      const verifiedBeforeTransaction = otpRow.verified;

      try {
        await callback(tx);
      } catch (error) {
        otpRow.verified = verifiedBeforeTransaction;
        throw error;
      }

      throw new Error('unique violation');
    });

    tx.user.update.mockRejectedValueOnce(new Error('unique violation'));

    await expect(
      service.confirmEmailChange('user-1', '111111', 'new@example.com'),
    ).rejects.toThrow('unique violation');

    expect(tx.otpCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'otp-1',
          verified: false,
        }),
      }),
    );
    expect(otpRow.verified).toBe(false);
  });

  it('concurrent reuse: the same OTP cannot be consumed twice', async () => {
    const { service, prisma, otpRow } = buildService();
    mockFreeEmail(prisma);

    const [first, second] = await Promise.allSettled([
      service.confirmEmailChange('user-1', '111111', 'new@example.com'),
      service.confirmEmailChange('user-1', '111111', 'new@example.com'),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === 'fulfilled');
    const rejected = [first, second].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      'قبلاً استفاده شده',
    );
    expect(otpRow.verified).toBe(true);
  });

  it('sequential reuse: second use of the same OTP is rejected', async () => {
    const { service, prisma } = buildService();
    mockFreeEmail(prisma);

    await service.confirmEmailChange('user-1', '111111', 'new@example.com');
    await expect(
      service.confirmEmailChange('user-1', '111111', 'new@example.com'),
    ).rejects.toThrow('کد تایید نامعتبر یا منقضی شده است');
  });

  it('dev bypass works only with an explicit newEmail (no OTP table consume)', async () => {
    const { service, prisma, otpService, otpRow } = buildService();
    otpService.isDevBypassCode.mockReturnValue(true);
    mockFreeEmail(prisma);

    const res = await service.confirmEmailChange('user-1', '123456', 'dev@example.com');
    expect(prisma.otpCode.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(otpRow.verified).toBe(false);
    expect(res).toEqual(expect.objectContaining({ email: updatedUser.email }));
  });
});
