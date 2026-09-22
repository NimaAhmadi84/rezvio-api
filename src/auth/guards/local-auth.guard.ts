import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    return result;
  }

  handleRequest<TUser = any>(err: any, user: TUser, info: any): TUser {
    // ──── Always normalize to 401: raw errors (e.g. plain Error) would
    // surface as 500 and leak internals ────
    if (err || !user) {
      throw err instanceof UnauthorizedException
        ? err
        : new UnauthorizedException('ایمیل یا رمز عبور اشتباه است');
    }
    return user;
  }
}
