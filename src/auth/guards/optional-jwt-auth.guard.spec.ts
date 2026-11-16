import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../../redis/redis.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    const redisService = {
      isBlacklisted: vi.fn(),
    } as unknown as RedisService;
    const jwtService = { decode: vi.fn() } as unknown as JwtService;
    const i18nService = {
      t: vi.fn((key: string) => key),
    } as unknown as I18nService;

    guard = new OptionalJwtAuthGuard(redisService, jwtService, i18nService);
  });

  const createMockContext = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization ? { authorization } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  it('should allow request when Authorization header is absent', async () => {
    const superSpy = vi.spyOn(JwtAuthGuard.prototype, 'canActivate');
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
    superSpy.mockRestore();
  });

  it('should delegate to JwtAuthGuard when Authorization header is present', async () => {
    const superSpy = vi
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const context = createMockContext('Bearer valid.token.here');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(superSpy).toHaveBeenCalledWith(context);
    superSpy.mockRestore();
  });
});
