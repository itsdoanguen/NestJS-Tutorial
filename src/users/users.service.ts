import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { AttachmentsService } from '../attachment/attachment.service.js';
import {
  ATTACHABLE_TYPE,
  AVATAR_SUBDIR,
} from '../attachment/constants/attachment.constants.js';
import { AuthService } from '../auth/auth.service.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import type { UserResponse } from '../auth/interfaces/user-response.interface.js';
import {
  MYSQL_DUP_ENTRY_ERRNO,
  MYSQL_ER_DUP_ENTRY,
} from '../common/constants/database.constants.js';
import { User } from '../database/entities/user.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { BCRYPT_SALT_ROUNDS } from './constants/users.constants.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly attachmentsService: AttachmentsService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {}

  async updateUser(
    currentUser: User,
    dto: UpdateUserDto,
    avatarFile?: Express.Multer.File,
    tokenPayload?: JwtPayload,
    currentToken?: string,
  ): Promise<{ user: UserResponse }> {
    let newFilePath: string | null = null;
    let oldFilePaths: string[] = [];
    const isPasswordChanged = dto.password !== undefined;

    let updatedUser: User;
    try {
      updatedUser = await this.userRepository.manager.transaction(
        async (manager) => {
          const user = await manager.findOne(User, {
            where: { id: currentUser.id },
          });

          if (!user) {
            throw new NotFoundException({
              message: this.i18n.t('users.USER_NOT_FOUND'),
            });
          }

          await this.applyDtoUpdates(user, dto);

          if (avatarFile) {
            const replaceResult =
              await this.attachmentsService.replaceAttachment(manager, {
                file: avatarFile,
                attachableId: String(user.id),
                attachableType: ATTACHABLE_TYPE.USER,
                subDir: AVATAR_SUBDIR,
              });
            newFilePath = replaceResult.attachment.filePath;
            oldFilePaths = replaceResult.oldFilePaths;
            user.image = replaceResult.attachment.url;
          }

          return manager.save(User, user);
        },
      );
    } catch (error: unknown) {
      if (newFilePath) {
        await this.attachmentsService.deleteFilesSafely([newFilePath]);
      }
      throw this.mapUpdateError(error);
    }

    if (oldFilePaths.length > 0) {
      await this.attachmentsService.deleteFilesSafely(oldFilePaths);
    }

    if (isPasswordChanged) {
      if (tokenPayload?.jti && tokenPayload?.exp) {
        await this.redisService.blacklistToken(
          tokenPayload.jti,
          tokenPayload.exp,
        );
      }
      return {
        user: this.authService.buildUserResponse(updatedUser),
      };
    }

    return {
      user: this.authService.buildUserResponse(updatedUser, currentToken),
    };
  }

  private async applyDtoUpdates(user: User, dto: UpdateUserDto): Promise<void> {
    if (dto.email !== undefined) {
      user.email = dto.email;
    }
    if (dto.username !== undefined) {
      user.username = dto.username;
    }
    if (dto.bio !== undefined) {
      user.bio = dto.bio;
    }
    if (dto.image !== undefined) {
      user.image = dto.image;
    }
    if (dto.password !== undefined) {
      user.password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
      const nowSeconds = Math.floor(Date.now() / 1000);
      user.passwordChangedAt = new Date(nowSeconds * 1000);
    }
  }

  private mapUpdateError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error;
    }

    const dbError = error as { code?: string; errno?: number };
    if (
      dbError?.code === MYSQL_ER_DUP_ENTRY ||
      dbError?.errno === MYSQL_DUP_ENTRY_ERRNO
    ) {
      return new ConflictException({
        message: this.i18n.t('users.EMAIL_OR_USERNAME_EXISTS'),
      });
    }

    return new InternalServerErrorException({
      message: this.i18n.t('auth.SERVICE_UNAVAILABLE'),
    });
  }
}
