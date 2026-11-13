import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity.js';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service.js';
import { I18nService } from 'nestjs-i18n';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: any;
  let jwtService: any;
  let redisService: any;
  let i18nService: any;

  beforeEach(async () => {
    userRepository = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn(),
      findOne: vi.fn(),
    };

    jwtService = {
      sign: vi.fn().mockReturnValue('mocked.jwt.token'),
    };

    redisService = {
      blacklistToken: vi.fn().mockResolvedValue(undefined),
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };

    i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
        {
          provide: I18nService,
          useValue: i18nService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should successfully register a user and return user info with token', async () => {
      const dto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const savedUser = {
        id: 1,
        email: dto.email,
        username: dto.username,
        password: 'hashedPassword',
        bio: null,
        image: null,
      };

      userRepository.save.mockResolvedValue(savedUser);

      const result = await service.register(dto);

      expect(userRepository.create).toHaveBeenCalled();
      expect(userRepository.save).toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalled();
      expect(result.user).toEqual({
        email: 'test@example.com',
        username: 'testuser',
        token: 'mocked.jwt.token',
        bio: null,
        image: null,
      });
    });

    it('should throw ConflictException on duplicate email/username error (ER_DUP_ENTRY)', async () => {
      const dto = {
        email: 'duplicate@example.com',
        username: 'dup',
        password: 'password123',
      };

      const duplicateError: any = new Error('Duplicate entry');
      duplicateError.code = 'ER_DUP_ENTRY';
      duplicateError.errno = 1062;

      userRepository.save.mockRejectedValue(duplicateError);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('validpass', 10);
      const user = {
        id: 1,
        email: 'user@example.com',
        username: 'user1',
        password: hashedPassword,
        bio: null,
        image: null,
      };

      userRepository.findOne.mockResolvedValue(user);

      const result = await service.login({
        email: 'user@example.com',
        password: 'validpass',
      });

      expect(result.user.email).toBe('user@example.com');
      expect(result.user.token).toBe('mocked.jwt.token');
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      const hashedPassword = await bcrypt.hash('validpass', 10);
      const user = {
        id: 1,
        email: 'user@example.com',
        username: 'user1',
        password: hashedPassword,
      };

      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.login({
          email: 'user@example.com',
          password: 'wrongpass',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should execute dummy compare and throw UnauthorizedException when user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'notfound@example.com',
          password: 'somepassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should blacklist token when payload contains jti and exp', async () => {
      const payload = {
        sub: 1,
        email: 'user@example.com',
        jti: 'test-uuid-jti',
        exp: 1799999999,
      };

      const result = await service.logout(payload);

      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'test-uuid-jti',
        1799999999,
      );
      expect(result).toHaveProperty('message');
    });
  });
});
