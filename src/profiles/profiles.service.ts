import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';
import {
  MYSQL_DUP_ENTRY_ERRNO,
  MYSQL_ER_DUP_ENTRY,
} from '../common/constants/database.constants.js';
import { Follow } from '../database/entities/follow.entity.js';
import { User } from '../database/entities/user.entity.js';
import type { ProfileResponse } from './interfaces/profile-response.interface.js';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepository: Repository<Follow>,
    private readonly i18n: I18nService,
  ) {}

  async getProfile(
    username: string,
    currentUserId?: number,
  ): Promise<{ profile: ProfileResponse }> {
    const targetUser = await this.findTargetUserByUsername(username);

    let isFollowing = false;
    if (currentUserId && currentUserId !== targetUser.id) {
      isFollowing = await this.followRepository.exists({
        where: {
          followerId: currentUserId,
          followingId: targetUser.id,
        },
      });
    }

    return this.buildProfileResponse(targetUser, isFollowing);
  }

  async followUser(
    username: string,
    currentUserId: number,
  ): Promise<{ profile: ProfileResponse }> {
    const targetUser = await this.findTargetUserByUsername(username);

    if (targetUser.id === currentUserId) {
      throw new BadRequestException({
        message: this.i18n.t('profiles.CANNOT_FOLLOW_SELF'),
      });
    }

    try {
      const follow = this.followRepository.create({
        followerId: currentUserId,
        followingId: targetUser.id,
      });
      await this.followRepository.save(follow);
    } catch (error: unknown) {
      const dbError = error as { code?: string; errno?: number };
      if (
        dbError?.code !== MYSQL_ER_DUP_ENTRY &&
        dbError?.errno !== MYSQL_DUP_ENTRY_ERRNO
      ) {
        throw new InternalServerErrorException({
          message: this.i18n.t('auth.SERVICE_UNAVAILABLE'),
        });
      }
    }

    return this.buildProfileResponse(targetUser, true);
  }

  async unfollowUser(
    username: string,
    currentUserId: number,
  ): Promise<{ profile: ProfileResponse }> {
    const targetUser = await this.findTargetUserByUsername(username);

    await this.followRepository.delete({
      followerId: currentUserId,
      followingId: targetUser.id,
    });

    return this.buildProfileResponse(targetUser, false);
  }

  async getFollowedUserIds(
    followerId?: number,
    targetUserIds?: number[],
  ): Promise<Set<number>> {
    if (!followerId) {
      return new Set();
    }

    if (targetUserIds !== undefined) {
      const filteredIds = Array.from(new Set(targetUserIds)).filter(
        (id) => id !== followerId,
      );
      if (filteredIds.length === 0) {
        return new Set();
      }

      const followRows = await this.followRepository.find({
        select: { followingId: true },
        where: {
          followerId,
          followingId: In(filteredIds),
        },
      });
      return new Set(followRows.map((row) => row.followingId));
    }

    const followRows = await this.followRepository.find({
      select: { followingId: true },
      where: { followerId },
    });
    return new Set(followRows.map((row) => row.followingId));
  }

  private async findTargetUserByUsername(username: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (!user) {
      throw new NotFoundException({
        message: this.i18n.t('profiles.PROFILE_NOT_FOUND'),
      });
    }

    return user;
  }

  private buildProfileResponse(
    user: User,
    following: boolean,
  ): { profile: ProfileResponse } {
    return {
      profile: {
        username: user.username,
        bio: user.bio,
        image: user.image,
        following,
      },
    };
  }
}
