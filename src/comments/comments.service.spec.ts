import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Article } from '../database/entities/article.entity.js';
import { Comment } from '../database/entities/comment.entity.js';
import { Follow } from '../database/entities/follow.entity.js';
import { User } from '../database/entities/user.entity.js';
import { CommentsService } from './comments.service.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepository: any;
  let articleRepository: any;
  let followRepository: any;

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

  const sampleArticle = {
    id: 10,
    slug: 'how-to-train-your-dragon-1234abcd',
  } as Article;

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

    articleRepository = {
      findOne: vi.fn(),
    };

    followRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    const i18nService = {
      t: vi.fn((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepository },
        { provide: getRepositoryToken(Article), useValue: articleRepository },
        { provide: getRepositoryToken(Follow), useValue: followRepository },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  describe('addComment', () => {
    it('should throw NotFoundException when article does not exist', async () => {
      articleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addComment('missing-slug', author, { body: 'Hello' }),
      ).rejects.toThrow(NotFoundException);

      expect(articleRepository.findOne).toHaveBeenCalledWith({
        select: { id: true },
        where: { slug: 'missing-slug' },
      });
    });

    it('should create comment and return formatted CommentResponse', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);

      const result = await service.addComment(sampleArticle.slug, author, {
        body: 'Great article!',
      });

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
      articleRepository.findOne.mockResolvedValue(null);

      await expect(service.getComments('missing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when article has no comments without querying follows', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);
      commentRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({ getMany: vi.fn().mockResolvedValue([]) }),
      );

      const result = await service.getComments(
        sampleArticle.slug,
        otherUser.id,
      );

      expect(result).toEqual({ comments: [] });
      expect(followRepository.find).not.toHaveBeenCalled();
    });

    it('should return comments with batch-hydrated author.following flag', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);
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
      followRepository.find.mockResolvedValue([{ followingId: 1 }]);

      const result = await service.getComments(
        sampleArticle.slug,
        otherUser.id,
      );

      expect(followRepository.find).toHaveBeenCalledTimes(1);
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
      articleRepository.findOne.mockResolvedValue(sampleArticle);
      commentRepository.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock({
          getMany: vi.fn().mockResolvedValue([sampleComment]),
        }),
      );

      const result = await service.getComments(sampleArticle.slug);

      expect(followRepository.find).not.toHaveBeenCalled();
      expect(result.comments[0].author.following).toBe(false);
    });
  });

  describe('deleteComment', () => {
    it('should throw NotFoundException when article does not exist', async () => {
      articleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment('missing-slug', 100, author.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment does not exist on the article', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);
      commentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteComment(sampleArticle.slug, 999, author.id),
      ).rejects.toThrow(NotFoundException);

      expect(commentRepository.findOne).toHaveBeenCalledWith({
        select: { id: true, authorId: true },
        where: { id: 999, articleId: 10 },
      });
    });

    it('should throw ForbiddenException when non-author tries to delete comment', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);
      commentRepository.findOne.mockResolvedValue({ id: 100, authorId: 1 });

      await expect(
        service.deleteComment(sampleArticle.slug, 100, otherUser.id),
      ).rejects.toThrow(ForbiddenException);

      expect(commentRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete comment when requested by its author', async () => {
      articleRepository.findOne.mockResolvedValue(sampleArticle);
      commentRepository.findOne.mockResolvedValue({ id: 100, authorId: 1 });

      await service.deleteComment(sampleArticle.slug, 100, author.id);

      expect(commentRepository.delete).toHaveBeenCalledWith({
        id: 100,
        articleId: 10,
      });
    });
  });
});
