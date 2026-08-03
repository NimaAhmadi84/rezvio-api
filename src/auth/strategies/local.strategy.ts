import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

import { AuthService } from '../auth.service';
import { AuthUserDto } from '../dto/auth-response.dto';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  async validate(email: string, password: string): Promise<AuthUserDto> {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('ایمیل یا رمز عبور اشتباه است');
    }

    return user;
  }
}
