import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticlesService } from '../articles/articles.service.js';
import { Comment } from '../database/entities/comment.entity.js';
import { User } from '../database/entities/user.entity.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { CommentsService } from './comments.service.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepository: any;
  let articlesService: any;
  let profilesService: any;

  const author = {
    id: 1,
    username: 'commenter1',
    bio: 'Reader',
    image: '/api/attachments/uuid-1',
  } as User;

  const otherUser = {
    id: 2,
    username: 'viewer1',
    bio: null,
    image: null,
  } as User;

  const sampleSlug = 'how-to-train-your-dragon-1234abcd';

  const sampleComment = {
    id: 100,
    body: 'Great article!',
    articleId: 10,
    authorId: 1,
    author,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as Comment;

  const createQueryBuilderMock = (overrides: Record<string, any> = {}) => ({
    leftJoin: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
    ...overrides,
  });

  beforeEach(async () => {
    commentRepository = {
      create: vi.fn((data) => ({
        id: 100,
        createdAt: sampleComment.createdAt,
        updatedAt: sampleComment.updatedAt,
        ...data,
      })),
      save: vi.fn(async (data) => data),
      findOne: vi.fn(),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn(),
    };

    articlesService = {
      findArticleIdBySlugOrFail: vi.fn().mockResolvedValue(10),
    };

    profilesService = {
      getFollowedUserIds: vi.fn().mockResolvedValue(new Set()),
    };

    const i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        { provide: ArticlesService, useValue: articlesService },
        { provide: ProfilesService, useValue: profilesService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  describe('addComment', () => {
    it('should throw NotFoundException when article does not exist', async () => {
      articlesService.findArticleIdBySlugOrFail.mockRejectedValue(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );

      await expect(
        service.addComment('missing-slug', author, { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);

      expect(articlesService.findArticleIdBySlugOrFail).toHaveBeenCalledWith(
        'missing-slug',
      );
    });

    it('should create comment and return formatted CommentResponse', async () => {
      const result = await service.addComment(sampleSlug, author, {
        body: 'Great article!',
      });

      expect(articlesService.findArticleIdBySlugOrFail).toHaveBeenCalledWith(
        sampleSlug,
      );
      expect(commentRepository.create).toHaveBeenCalledWith({
        body: 'Great article!',
        articleId: 10,
        authorId: 1,
      });
      expect(commentRepository.save).toHaveBeenCalledTimes(1);
      expect(result.comment).toEqual({
        id: 100,
        createdAt: sampleComment.createdAt,
        updatedAt: sampleComment.updatedAt,
        body: 'Great article!',
        author: {
          username: 'commenter1',
          bio: 'Reader',
          image: '/api/attachments/uuid-1',
          following: false,
        },
      });
    });
  });

  describe('getComments', () => {
    it('should throw NotFoundException when article does not exist', async () => {
      articlesService.findArticleIdBySlugOrFail.mockRejectedValue(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );

      await expect(service.getComments('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when article has no comments without querying follows', async () => {
      commentRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getMany: vi.fn().mockResolvedValue([]) }),
      );

      const result = await service.getComments(sampleSlug, otherUser.id);

      expect(result).toEqual({ comments: [] });
      expect(profilesService.getFollowedUserIds).not.toHaveBeenCalled();
    });

    it('should return comments with batch-hydrated author.following flag via ProfilesService', async () => {
      const comment2 = {
        ...sampleComment,
        id: 101,
        authorId: 2,
        author: otherUser,
        body: 'Second comment',
      } as Comment;
      commentRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getMany: vi.fn().mockResolvedValue([comment2, sampleComment]),
        }),
      );
      profilesService.getFollowedUserIds.mockResolvedValue(new Set([1]));

      const result = await service.getComments(sampleSlug, otherUser.id);

      expect(profilesService.getFollowedUserIds).toHaveBeenCalledWith(
        otherUser.id,
        [2, 1],
      );
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0]).toMatchObject({
        id: 101,
        body: 'Second comment',
        author: { username: 'viewer1', following: false },
      });
      expect(result.comments[1]).toMatchObject({
        id: 100,
        body: 'Great article!',
        author: { username: 'commenter1', following: true },
      });
    });

    it('should set following=false for all comments when unauthenticated', async () => {
      commentRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getMany: vi.fn().mockResolvedValue([sampleComment]),
        }),
      );

      const result = await service.getComments(sampleSlug);

      expect(profilesService.getFollowedUserIds).toHaveBeenCalledWith(
        undefined,
        [1],
      );
      expect(result.comments[0].author.following).toBe(false);
    });
  });

  describe('deleteComment', () => {
    it('should throw NotFoundException when article does not exist', async () => {
      articlesService.findArticleIdBySlugOrFail.mockRejectedValue(
        new NotFoundException('articles.ARTICLE_NOT_FOUND'),
      );

      await expect(
        service.deleteComment('missing-slug', 100, author.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment does not exist on the article', async () => {
      commentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment(sampleSlug, 999, author.id),
      ).rejects.toThrow(NotFoundException);

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        select: { id: true, authorId: true },
        where: { id: 999, articleId: 10 },
      });
    });

    it('should throw ForbiddenException when non-author tries to delete comment', async () => {
      commentRepository.findOne.mockResolvedValue({ id: 100, authorId: 1 });

      await expect(
        service.deleteComment(sampleSlug, 100, otherUser.id),
      ).rejects.toThrow(ForbiddenException);

      expect(commentRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete comment when requested by its author', async () => {
      commentRepository.findOne.mockResolvedValue({ id: 100, authorId: 1 });

      await service.deleteComment(sampleSlug, 100, author.id);

      expect(commentRepository.delete).toHaveBeenCalledWith({
        id: 100,
        articleId: 10,
      });
    });
  });
});
