import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../database/entities/user.entity.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RedisService } from '../redis/redis.service.js';
import { I18nService } from 'nestjs-i18n';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';
import {
  DUMMY_HASH,
  MYSQL_DUP_ENTRY_ERRNO,
  MYSQL_ER_DUP_ENTRY,
  DEFAULT_JWT_EXPIRES_IN,
} from './constants/auth.constant.js';
import type { UserResponse } from './interfaces/user-response.interface.js';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: UserResponse }> {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      username: dto.username,
      password: hashedPassword,
    });

    try {
      const savedUser = await this.userRepository.save(user);
      const token = this.generateToken(savedUser);
      return { user: this.buildUserResponse(savedUser, token) };
    } catch (error: any) {
      if (
        error?.code === MYSQL_ER_DUP_ENTRY ||
        error?.errno === MYSQL_DUP_ENTRY_ERRNO
      ) {
        throw new ConflictException({
          message: this.i18n.t('auth.EMAIL_OR_USERNAME_EXISTS'),
        });
      }
      throw new InternalServerErrorException({
        message: this.i18n.t('auth.SERVICE_UNAVAILABLE'),
      });
    }
  }

  async login(dto: LoginDto): Promise<{ user: UserResponse }> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    const passwordToCompare = user ? user.password : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      passwordToCompare,
    );

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException({
        message: this.i18n.t('auth.INVALID_CREDENTIALS'),
      });
    }

    const token = this.generateToken(user);
    return { user: this.buildUserResponse(user, token) };
  }

  async logout(payload: JwtPayload): Promise<{ message: string }> {
    if (payload?.jti && payload?.exp) {
      await this.redisService.blacklistToken(payload.jti, payload.exp);
    }

    return {
      message: this.i18n.t('auth.LOGOUT_SUCCESS'),
    };
  }

  buildUserResponse(user: User, token?: string): UserResponse {
    return {
      email: user.email,
      token: token ?? this.generateToken(user),
      username: user.username,
      bio: user.bio,
      image: user.image,
    };
  }

  private generateToken(user: User): string {
    const jti = crypto.randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti,
    };

    return this.jwtService.sign(payload, {
      expiresIn: DEFAULT_JWT_EXPIRES_IN,
    });
  }
}
