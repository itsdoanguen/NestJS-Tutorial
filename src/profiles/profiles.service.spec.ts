import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Follow } from '../database/entities/follow.entity.js';
import { User } from '../database/entities/user.entity.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let userRepository: any;
  let followRepository: any;
  let i18nService: any;

  const targetUser = {
    id: 2,
    username: 'jake',
    bio: 'I work at statefarm',
    image: '/api/attachments/avatar-uuid',
  } as User;

  beforeEach(async () => {
    userRepository = {
      findOne: vi.fn(),
    };

    followRepository = {
      exists: vi.fn(),
      create: vi.fn((data) => ({ ...data })),
      save: vi.fn(),
      delete: vi.fn(),
    };

    i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(Follow),
          useValue: followRepository,
        },
        {
          provide: I18nService,
          useValue: i18nService,
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  describe('getProfile', () => {
    it('should return profile with following=false for unauthenticated user', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);

      const result = await service.getProfile('jake');

      expect(followRepository.exists).not.toHaveBeenCalled();
      expect(result.profile).toEqual({
        username: 'jake',
        bio: 'I work at statefarm',
        image: '/api/attachments/avatar-uuid',
        following: false,
      });
    });

    it('should return following=true when authenticated user follows target user', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);
      followRepository.exists.mockResolvedValue(true);

      const result = await service.getProfile('jake', 1);

      expect(followRepository.exists).toHaveBeenCalledWith({
        where: { followerId: 1, followingId: 2 },
      });
      expect(result.profile.following).toBe(true);
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfile('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('followUser', () => {
    it('should create follow relation and return following=true', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);
      followRepository.save.mockResolvedValue({
        followerId: 1,
        followingId: 2,
      });

      const result = await service.followUser('jake', 1);

      expect(followRepository.save).toHaveBeenCalled();
      expect(result.profile.following).toBe(true);
    });

    it('should handle duplicate follow idempotently on ER_DUP_ENTRY', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);
      const duplicateError: any = new Error('Duplicate');
      duplicateError.code = 'ER_DUP_ENTRY';
      duplicateError.errno = 1062;
      followRepository.save.mockRejectedValue(duplicateError);

      const result = await service.followUser('jake', 1);

      expect(result.profile.following).toBe(true);
    });

    it('should throw BadRequestException when trying to follow yourself', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);

      await expect(service.followUser('jake', 2)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('unfollowUser', () => {
    it('should delete follow relation and return following=false', async () => {
      userRepository.findOne.mockResolvedValue(targetUser);
      followRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.unfollowUser('jake', 1);

      expect(followRepository.delete).toHaveBeenCalledWith({
        followerId: 1,
        followingId: 2,
      });
      expect(result.profile.following).toBe(false);
    });
  });
});
