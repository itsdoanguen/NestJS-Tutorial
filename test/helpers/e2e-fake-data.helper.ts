import { faker } from '@faker-js/faker';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { Server } from 'http';
import { DataSource, In } from 'typeorm';
import { generateArticleSlug } from '../../src/articles/helpers/article.helper.js';
import { DEFAULT_JWT_EXPIRES_IN } from '../../src/auth/constants/auth.constant.js';
import type { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface.js';
import { ArticleFavorite } from '../../src/database/entities/article-favorite.entity.js';
import { ArticleTag } from '../../src/database/entities/article-tag.entity.js';
import { Article } from '../../src/database/entities/article.entity.js';
import { Comment } from '../../src/database/entities/comment.entity.js';
import { Follow } from '../../src/database/entities/follow.entity.js';
import { Tag } from '../../src/database/entities/tag.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import { RedisService } from '../../src/redis/redis.service.js';

const FAST_TEST_BCRYPT_ROUNDS = 4;

export interface FakeUserSeed {
  user: User;
  plainPassword: string;
  token: string;
}

export interface FakeUserOverrides {
  email?: string;
  username?: string;
  password?: string;
  bio?: string | null;
  image?: string | null;
  passwordChangedAt?: Date | null;
}

export interface FakeArticleOverrides {
  title?: string;
  description?: string;
  body?: string;
  slug?: string;
  tagNames?: string[];
  createdAt?: Date;
}

export interface FakeCommentOverrides {
  body?: string;
  createdAt?: Date;
}

export class E2eFakeDataFactory {
  private sequence = 0;
  private readonly jwtService: JwtService;
  private readonly redisService: RedisService;

  constructor(
    private readonly app: INestApplication<Server>,
    private readonly dataSource: DataSource,
  ) {
    this.jwtService = this.app.get(JwtService);
    this.redisService = this.app.get(RedisService);
  }

  private nextSeq(): number {
    this.sequence += 1;
    return this.sequence;
  }

  async createFakeUser(
    overrides: FakeUserOverrides = {},
  ): Promise<FakeUserSeed> {
    const seq = this.nextSeq();
    const rawUsername = faker.internet
      .username()
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase()
      .slice(0, 24);
    const username = overrides.username ?? `${rawUsername || 'user'}_${seq}`;
    const email = (overrides.email ?? `${username}@example.com`).toLowerCase();
    const plainPassword =
      overrides.password ?? faker.internet.password({ length: 12 });
    const hashedPassword = await bcrypt.hash(
      plainPassword,
      FAST_TEST_BCRYPT_ROUNDS,
    );

    const userRepo = this.dataSource.getRepository(User);
    const user = userRepo.create({
      email,
      username,
      password: hashedPassword,
      bio: overrides.bio !== undefined ? overrides.bio : faker.person.bio(),
      image: overrides.image !== undefined ? overrides.image : null,
      passwordChangedAt: overrides.passwordChangedAt ?? null,
    });

    const savedUser = await userRepo.save(user);
    const token = this.issueTokenForUser(savedUser);

    return { user: savedUser, plainPassword, token };
  }

  issueTokenForUser(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: crypto.randomUUID(),
    };

    return this.jwtService.sign(payload, {
      expiresIn: DEFAULT_JWT_EXPIRES_IN,
    });
  }

  async revokeToken(token: string): Promise<void> {
    const payload = this.jwtService.decode(token) as JwtPayload | null;
    if (payload?.jti && payload?.exp) {
      await this.redisService.blacklistToken(payload.jti, payload.exp);
    }
  }

  async createFakeFollow(
    followerId: number,
    followingId: number,
  ): Promise<Follow> {
    const followRepo = this.dataSource.getRepository(Follow);
    const follow = followRepo.create({ followerId, followingId });
    return followRepo.save(follow);
  }

  async createFakeArticle(
    author: User,
    overrides: FakeArticleOverrides = {},
  ): Promise<{ article: Article; tagNames: string[] }> {
    const seq = this.nextSeq();
    const title =
      overrides.title ?? `${faker.lorem.sentence({ min: 3, max: 5 })} ${seq}`;
    const description =
      overrides.description ??
      faker.lorem.sentence({ min: 5, max: 10 }).slice(0, 450);
    const body = overrides.body ?? faker.lorem.paragraphs(2);
    const slug = overrides.slug ?? generateArticleSlug(title);
    const tagNames = overrides.tagNames ?? [];

    const articleRepo = this.dataSource.getRepository(Article);
    const article = articleRepo.create({
      slug,
      title,
      description,
      body,
      authorId: author.id,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    });

    const savedArticle = await articleRepo.save(article);

    if (tagNames.length > 0) {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(Tag)
        .values(tagNames.map((name) => ({ name })))
        .orIgnore()
        .execute();

      const tags = await this.dataSource.getRepository(Tag).find({
        select: { id: true, name: true },
        where: { name: In(tagNames) },
      });

      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(ArticleTag)
        .values(
          tags.map((tag) => ({
            articleId: savedArticle.id,
            tagId: tag.id,
          })),
        )
        .orIgnore()
        .execute();
    }

    return { article: savedArticle, tagNames };
  }

  async createFakeFavorite(
    userId: number,
    articleId: number,
  ): Promise<ArticleFavorite> {
    const favoriteRepo = this.dataSource.getRepository(ArticleFavorite);
    const favorite = favoriteRepo.create({ userId, articleId });
    return favoriteRepo.save(favorite);
  }

  async createFakeComment(
    article: Article,
    author: User,
    overrides: FakeCommentOverrides = {},
  ): Promise<Comment> {
    const commentRepo = this.dataSource.getRepository(Comment);
    const comment = commentRepo.create({
      body: overrides.body ?? faker.lorem.sentence({ min: 3, max: 10 }),
      articleId: article.id,
      authorId: author.id,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    });
    return commentRepo.save(comment);
  }
}
