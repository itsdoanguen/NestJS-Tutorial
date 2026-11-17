import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../database/entities/user.entity.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userRepository: any;

  beforeEach(() => {
    const configService = {
      getOrThrow: vi.fn().mockReturnValue('test-jwt-secret'),
    } as unknown as ConfigService;

    userRepository = {
      findOne: vi.fn(),
    };

    const i18nService = {
      t: vi.fn((key: string) => key),
    } as unknown as I18nService;

    strategy = new JwtStrategy(configService, userRepository, i18nService);
  });

  it('should return user when token was issued after passwordChangedAt', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      passwordChangedAt: new Date(1700000000 * 1000),
    } as User;

    userRepository.findOne.mockResolvedValue(user);

    const result = await strategy.validate({
      sub: 1,
      email: 'test@example.com',
      jti: 'uuid-jti',
      iat: 1700000010,
    });

    expect(result).toBe(user);
  });

  it('should throw UnauthorizedException when token was issued before passwordChangedAt', async () => {
    const user = {
      id: 1,
      email: 'test@example.com',
      passwordChangedAt: new Date(1700000100 * 1000),
    } as User;

    userRepository.findOne.mockResolvedValue(user);

    await expect(
      strategy.validate({
        sub: 1,
        email: 'test@example.com',
        jti: 'uuid-jti',
        iat: 1700000050,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user no longer exists', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 999,
        email: 'deleted@example.com',
        jti: 'uuid-jti',
        iat: 1700000050,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
