import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { UsersController } from './users.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

function guardsOf(method: string): unknown[] {
  return (
    Reflect.getMetadata(
      GUARDS_METADATA,
      UsersController.prototype[method as keyof UsersController],
    ) ?? []
  );
}

function rolesOf(method: string): UserRole[] | undefined {
  return Reflect.getMetadata(
    ROLES_KEY,
    UsersController.prototype[method as keyof UsersController],
  );
}

describe('UsersController CRUD guards (Phase A)', () => {
  const adminOnlyMethods = [
    'create',
    'findAll',
    'findOne',
    'update',
    'remove',
  ];

  it.each(adminOnlyMethods)(
    '%s requires JwtAuthGuard + RolesGuard + ADMIN role',
    (method) => {
      const guards = guardsOf(method);

      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);
      expect(rolesOf(method)).toEqual([UserRole.ADMIN]);
    },
  );

  const selfServiceMethods = [
    'getMe',
    'updateProfile',
    'changeName',
    'requestEmailChange',
    'confirmEmailChange',
    'changePassword',
  ];

  it.each(selfServiceMethods)(
    '%s still requires auth but is NOT admin-only',
    (method) => {
      const guards = guardsOf(method);

      expect(guards).toContain(JwtAuthGuard);
      expect(rolesOf(method)).toBeUndefined();
    },
  );
});