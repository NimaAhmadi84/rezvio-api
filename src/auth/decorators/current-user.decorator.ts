import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUserDto } from '../dto/auth-response.dto';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUserDto | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUserDto = request.user;

    if (!user) {
      return null;
    }

    if (data) {
      return user[data];
    }

    return user;
  },
);
