import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentsService } from '../attachment/attachment.service.js';
import { AuthService } from '../auth/auth.service.js';
import { User } from '../database/entities/user.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: any;
  let attachmentsService: any;
  let authService: any;
  let redisService: any;
  let i18nService: any;
  let mockManager: any;

  const currentUser = {
    id: 1,
    email: 'old@example.com',
    username: 'olduser',
    password: 'hashedOldPassword',
    bio: null,
    image: null,
    passwordChangedAt: null,
  } as User;

  beforeEach(async () => {
    mockManager = {
      findOne: vi.fn(),
      save: vi.fn(async (_entity, user) => ({ ...user })),
    };

    userRepository = {
      manager: {
        transaction: vi.fn(async (cb) => cb(mockManager)),
      },
    };

    attachmentsService = {
      replaceAttachment: vi.fn(),
      deleteFilesSafely: vi.fn().mockResolvedValue(undefined),
    };

    authService = {
      buildUserResponse: vi.fn((user: User, token?: string) => ({
        email: user.email,
        username: user.username,
        token: token ?? 'new.jwt.token',
        bio: user.bio,
        image: user.image,
      })),
    };

    redisService = {
      blacklistToken: vi.fn().mockResolvedValue(undefined),
    };

    i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: AttachmentsService,
          useValue: attachmentsService,
        },
        {
          provide: AuthService,
          useValue: authService,
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

    service = module.get<UsersService>(UsersService);
  });

  it('should update user profile fields and keep current token when password is not changed', async () => {
    mockManager.findOne.mockResolvedValue({ ...currentUser });

    const result = await service.updateUser(
      currentUser,
      { bio: 'Updated bio', username: 'newname' },
      undefined,
      { sub: 1, email: 'old@example.com', jti: 'old-jti', exp: 1800000000 },
      'current.jwt.token',
    );

    expect(redisService.blacklistToken).not.toHaveBeenCalled();
    expect(authService.buildUserResponse).toHaveBeenCalledWith(
      expect.objectContaining({ bio: 'Updated bio', username: 'newname' }),
      'current.jwt.token',
    );
    expect(result.user.token).toBe('current.jwt.token');
  });

  it('should blacklist current token, set passwordChangedAt, and issue a new token when password is updated', async () => {
    mockManager.findOne.mockResolvedValue({ ...currentUser });

    const result = await service.updateUser(
      currentUser,
      { password: 'newPassword123' },
      undefined,
      { sub: 1, email: 'old@example.com', jti: 'old-jti', exp: 1800000000 },
      'current.jwt.token',
    );

    const savedArg = mockManager.save.mock.calls[0][1] as User;
    expect(savedArg.password).not.toBe('newPassword123');
    expect(savedArg.passwordChangedAt).toBeInstanceOf(Date);
    expect(redisService.blacklistToken).toHaveBeenCalledWith(
      'old-jti',
      1800000000,
    );
    expect(authService.buildUserResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
    expect(result.user.token).toBe('new.jwt.token');
  });

  it('should replace avatar attachment and delete old files after commit', async () => {
    mockManager.findOne.mockResolvedValue({ ...currentUser });
    attachmentsService.replaceAttachment.mockResolvedValue({
      attachment: {
        id: 'new-uuid',
        url: '/api/attachments/new-uuid',
        filePath: 'avatars/new-uuid.png',
      },
      oldFilePaths: ['avatars/old-uuid.png'],
    });

    const mockFile = { originalname: 'avatar.png' } as Express.Multer.File;
    const result = await service.updateUser(
      currentUser,
      {},
      mockFile,
      undefined,
      'current.jwt.token',
    );

    expect(result.user.image).toBe('/api/attachments/new-uuid');
    expect(attachmentsService.deleteFilesSafely).toHaveBeenCalledWith([
      'avatars/old-uuid.png',
    ]);
  });

  it('should throw ConflictException and delete newly saved file when duplicate email/username occurs', async () => {
    mockManager.findOne.mockResolvedValue({ ...currentUser });
    attachmentsService.replaceAttachment.mockResolvedValue({
      attachment: {
        id: 'new-uuid',
        url: '/api/attachments/new-uuid',
        filePath: 'avatars/new-uuid.png',
      },
      oldFilePaths: ['avatars/old-uuid.png'],
    });

    const duplicateError: any = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';
    duplicateError.errno = 1062;
    mockManager.save.mockRejectedValue(duplicateError);

    const mockFile = { originalname: 'avatar.png' } as Express.Multer.File;

    await expect(
      service.updateUser(currentUser, { email: 'taken@example.com' }, mockFile),
    ).rejects.toThrow(ConflictException);

    expect(attachmentsService.deleteFilesSafely).toHaveBeenCalledWith([
      'avatars/new-uuid.png',
    ]);
    expect(attachmentsService.deleteFilesSafely).not.toHaveBeenCalledWith([
      'avatars/old-uuid.png',
    ]);
  });

  it('should throw NotFoundException if user no longer exists', async () => {
    mockManager.findOne.mockResolvedValue(null);

    await expect(
      service.updateUser(currentUser, { bio: 'test' }),
    ).rejects.toThrow(NotFoundException);
  });
});
