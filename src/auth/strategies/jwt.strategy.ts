import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly i18n: I18nService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException({
        message: this.i18n.t('auth.INVALID_CREDENTIALS'),
      });
    }

    if (user.passwordChangedAt && payload.iat) {
      const changedAtSeconds = Math.floor(
        user.passwordChangedAt.getTime() / 1000,
      );
      if (payload.iat < changedAtSeconds) {
        throw new UnauthorizedException({
          message: this.i18n.t('auth.TOKEN_REVOKED'),
        });
      }
    }

    return user;
  }
}
