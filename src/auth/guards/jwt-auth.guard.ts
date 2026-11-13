import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service.js';
import { I18nService } from 'nestjs-i18n';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { Request } from 'express';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { AUTH_SCHEME_BEARER } from '../constants/auth.constant.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isValid = (await super.canActivate(context)) as boolean;
    if (!isValid) {
      return false;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        message: this.i18n.t('auth.INVALID_CREDENTIALS'),
      });
    }

    const payload = this.jwtService.decode(token) as JwtPayload | null;
    if (!payload) {
      throw new UnauthorizedException({
        message: this.i18n.t('auth.INVALID_CREDENTIALS'),
      });
    }

    if (payload.jti) {
      let isBlacklisted = false;
      try {
        isBlacklisted = await this.redisService.isBlacklisted(payload.jti);
      } catch {
        throw new ServiceUnavailableException({
          message: this.i18n.t('auth.SERVICE_UNAVAILABLE'),
        });
      }

      if (isBlacklisted) {
        throw new UnauthorizedException({
          message: this.i18n.t('auth.TOKEN_REVOKED'),
        });
      }
    }

    request.token = token;
    request.tokenPayload = payload;

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === AUTH_SCHEME_BEARER ? token : undefined;
  }
}
