import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleFavorite } from '../database/entities/article-favorite.entity.js';
import { ArticleTag } from '../database/entities/article-tag.entity.js';
import { Article } from '../database/entities/article.entity.js';
import { Follow } from '../database/entities/follow.entity.js';
import { User } from '../database/entities/user.entity.js';
import { ArticlesService } from './articles.service.js';

describe('ArticlesService', () => {
  let service: ArticlesService;
  let articleRepository: any;
  let articleTagRepository: any;
  let articleFavoriteRepository: any;
  let followRepository: any;
  let dataSource: any;
  let mockManager: any;

  const author = {
    id: 1,
    username: 'author1',
    bio: 'Writer',
    image: '/api/attachments/uuid-1',
  } as User;

  const otherUser = {
    id: 2,
    username: 'reader1',
    bio: null,
    image: null,
  } as User;

  const sampleArticle = {
    id: 10,
    slug: 'how-to-train-your-dragon-1234abcd',
    title: 'How to train your dragon',
    description: 'Ever wonder how?',
    body: 'You have to believe',
    authorId: 1,
    author,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as Article;

  const createQueryBuilderMock = (overrides: Record<string, any> = {}) => {
    const qb: any = {
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(null),
      getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
      getRawMany: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
    return qb;
  };

  beforeEach(async () => {
    mockManager = {
      create: vi.fn((_entity, data) => ({
        id: 10,
        createdAt: sampleArticle.createdAt,
        updatedAt: sampleArticle.updatedAt,
        ...data,
      })),
      save: vi.fn(async (_entity, data) => data),
      find: vi.fn().mockResolvedValue([
        { id: 100, name: 'dragons' },
        { id: 101, name: 'nestjs' },
      ]),
      createQueryBuilder: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        into: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        orIgnore: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };

    dataSource = {
      transaction: vi.fn(async (cb) => cb(mockManager)),
    };

    articleRepository = {
      createQueryBuilder: vi.fn(),
      save: vi.fn(async (article) => article),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    articleTagRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(
          createQueryBuilderMock({ getRawMany: vi.fn().mockResolvedValue([]) }),
        ),
    };

    articleFavoriteRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(
          createQueryBuilderMock({ getRawMany: vi.fn().mockResolvedValue([]) }),
        ),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((data) => ({ ...data })),
      save: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    followRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    const i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: articleRepository },
        {
          provide: getRepositoryToken(ArticleTag),
          useValue: articleTagRepository,
        },
        {
          provide: getRepositoryToken(ArticleFavorite),
          useValue: articleFavoriteRepository,
        },
        { provide: getRepositoryToken(Follow), useValue: followRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
  });

  describe('createArticle', () => {
    it('should create an article with deduplicated tags inside a transaction', async () => {
      const result = await service.createArticle(author, {
        title: 'How to train your dragon',
        description: 'Ever wonder how?',
        body: 'You have to believe',
        tagList: ['nestjs', 'dragons', 'nestjs'],
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.article).toMatchObject({
        title: 'How to train your dragon',
        description: 'Ever wonder how?',
        body: 'You have to believe',
        tagList: ['dragons', 'nestjs'],
        favorited: false,
        favoritesCount: 0,
        author: {
          username: 'author1',
          following: false,
        },
      });
      expect(result.article.slug).toMatch(
        /^how-to-train-your-dragon-[0-9a-f]{8}$/,
      );
    });
  });

  describe('listArticles', () => {
    it('should query articles with pagination and batch-hydrate tags, favorites, and following', async () => {
      const qb = createQueryBuilderMock({
        getManyAndCount: vi.fn().mockResolvedValue([[sampleArticle], 1]),
      });
      articleRepository.createQueryBuilder.mockReturnValue(qb);

      articleTagRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getRawMany: vi.fn().mockResolvedValue([
            { articleId: 10, tagName: 'dragons' },
            { articleId: 10, tagName: 'nestjs' },
          ]),
        }),
      );
      articleFavoriteRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getRawMany: vi
            .fn()
            .mockResolvedValue([{ articleId: 10, count: '3' }]),
        }),
      );
      articleFavoriteRepository.find.mockResolvedValue([{ articleId: 10 }]);
      followRepository.find.mockResolvedValue([{ followingId: 1 }]);

      const result = await service.listArticles(
        { tag: 'nestjs', author: 'author1', limit: 10, offset: 0 },
        otherUser.id,
      );

      expect(result.articlesCount).toBe(1);
      expect(result.articles[0]).toMatchObject({
        slug: sampleArticle.slug,
        tagList: ['dragons', 'nestjs'],
        favoritesCount: 3,
        favorited: true,
        author: {
          username: 'author1',
          following: true,
        },
      });
    });
  });

  describe('feedArticles', () => {
    it('should return empty feed immediately when user follows nobody', async () => {
      followRepository.find.mockResolvedValue([]);

      const result = await service.feedArticles(otherUser.id, {
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({ articles: [], articlesCount: 0 });
      expect(articleRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return feed articles from followed authors', async () => {
      followRepository.find.mockResolvedValue([{ followingId: 1 }]);
      const qb = createQueryBuilderMock({
        getManyAndCount: vi.fn().mockResolvedValue([[sampleArticle], 1]),
      });
      articleRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.feedArticles(otherUser.id, {
        limit: 20,
        offset: 0,
      });

      expect(result.articlesCount).toBe(1);
      expect(result.articles[0].author.following).toBe(true);
    });
  });

  describe('getArticle', () => {
    it('should throw NotFoundException when slug does not exist', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getOne: vi.fn().mockResolvedValue(null) }),
      );

      await expect(service.getArticle('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateArticle & deleteArticle', () => {
    it('should update article fields and regenerate slug when title changes', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: vi.fn().mockResolvedValue({ ...sampleArticle }),
        }),
      );

      const result = await service.updateArticle(sampleArticle.slug, author, {
        title: 'Updated Title',
        body: 'Updated body',
      });

      expect(result.article.title).toBe('Updated Title');
      expect(result.article.body).toBe('Updated body');
      expect(result.article.slug).not.toBe(sampleArticle.slug);
    });

    it('should throw ForbiddenException when non-author attempts update or delete', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: vi.fn().mockResolvedValue({ ...sampleArticle }),
        }),
      );

      await expect(
        service.updateArticle(sampleArticle.slug, otherUser, {
          title: 'Hacked',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteArticle(sampleArticle.slug, otherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete article when requested by author', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: vi.fn().mockResolvedValue({ ...sampleArticle }),
        }),
      );

      await service.deleteArticle(sampleArticle.slug, author);

      expect(articleRepository.delete).toHaveBeenCalledWith({ id: 10 });
    });
  });

  describe('favoriteArticle & unfavoriteArticle', () => {
    it('should handle duplicate favorite idempotently on ER_DUP_ENTRY', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: vi.fn().mockResolvedValue({ ...sampleArticle }),
        }),
      );
      const dupError: any = new Error('Duplicate');
      dupError.code = 'ER_DUP_ENTRY';
      dupError.errno = 1062;
      articleFavoriteRepository.save.mockRejectedValue(dupError);
      articleFavoriteRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getRawMany: vi
            .fn()
            .mockResolvedValue([{ articleId: 10, count: '1' }]),
        }),
      );
      articleFavoriteRepository.find.mockResolvedValue([{ articleId: 10 }]);

      const result = await service.favoriteArticle(
        sampleArticle.slug,
        otherUser.id,
      );

      expect(result.article.favorited).toBe(true);
      expect(result.article.favoritesCount).toBe(1);
    });

    it('should unfavorite article and return favorited=false', async () => {
      articleRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getOne: vi.fn().mockResolvedValue({ ...sampleArticle }),
        }),
      );

      const result = await service.unfavoriteArticle(
        sampleArticle.slug,
        otherUser.id,
      );

      expect(articleFavoriteRepository.delete).toHaveBeenCalledWith({
        userId: otherUser.id,
        articleId: 10,
      });
      expect(result.article.favorited).toBe(false);
      expect(result.article.favoritesCount).toBe(0);
    });
  });
});
