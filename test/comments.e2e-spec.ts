import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { COMMENT_BODY_MAX_LENGTH } from '../src/comments/constants/comments.constants.js';
import { ArticleFavorite } from '../src/database/entities/article-favorite.entity.js';
import { ArticleTag } from '../src/database/entities/article-tag.entity.js';
import { Article } from '../src/database/entities/article.entity.js';
import { Attachment } from '../src/database/entities/attachment.entity.js';
import { Comment } from '../src/database/entities/comment.entity.js';
import { Follow } from '../src/database/entities/follow.entity.js';
import { Tag } from '../src/database/entities/tag.entity.js';
import { User } from '../src/database/entities/user.entity.js';

describe('Comments (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const clearTestTables = async () => {
    await dataSource
      .getRepository(Comment)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource
      .getRepository(ArticleFavorite)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource
      .getRepository(ArticleTag)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource
      .getRepository(Article)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource.getRepository(Tag).createQueryBuilder().delete().execute();
    await dataSource
      .getRepository(Follow)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource
      .getRepository(Attachment)
      .createQueryBuilder()
      .delete()
      .execute();
    await dataSource
      .getRepository(User)
      .createQueryBuilder()
      .delete()
      .execute();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);

    const dbName = dataSource.options.database;
    if (dbName !== 'nest_tutorial_test') {
      throw new Error(
        `CRITICAL: E2E tests are connecting to '${dbName}' instead of 'nest_tutorial_test'. Aborting.`,
      );
    }
  });

  beforeEach(async () => {
    await clearTestTables();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await clearTestTables();
    }
    await app.close();
  });

  const registerUser = async (email: string, username: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email, username, password: 'password123' })
      .expect(201);
    return res.body.user.token as string;
  };

  const createArticle = async (token: string, title = 'Test Article') => {
    const res = await request(app.getHttpServer())
      .post('/api/articles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        description: 'Article description',
        body: 'Article body',
      })
      .expect(201);
    return res.body.article.slug as string;
  };

  describe('POST /api/articles/:slug/comments', () => {
    it('should return 401 when unauthenticated', async () => {
      const authorToken = await registerUser('a1@example.com', 'author1');
      const slug = await createArticle(authorToken);

      await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .send({ body: 'Unauthorized comment' })
        .expect(401);
    });

    it('should return 400 for empty or oversized body and 404 for unknown slug', async () => {
      const token = await registerUser('a2@example.com', 'author2');
      const slug = await createArticle(token);

      await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: '' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'a'.repeat(COMMENT_BODY_MAX_LENGTH + 1) })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/articles/nonexistent-slug/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Valid body' })
        .expect(404);
    });

    it('should add a comment to an article and return 201', async () => {
      const authorToken = await registerUser('a3@example.com', 'author3');
      const commenterToken = await registerUser('c1@example.com', 'commenter1');
      const slug = await createArticle(authorToken);

      const res = await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ body: 'His name was my name too.' })
        .expect(201);

      expect(res.body.comment).toMatchObject({
        id: expect.any(Number),
        body: 'His name was my name too.',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        author: {
          username: 'commenter1',
          bio: null,
          image: null,
          following: false,
        },
      });
    });
  });

  describe('GET /api/articles/:slug/comments', () => {
    it('should return comments without auth and reflect following status when authenticated', async () => {
      const authorToken = await registerUser('a4@example.com', 'author4');
      const commenterToken = await registerUser('c2@example.com', 'commenter2');
      const viewerToken = await registerUser('v1@example.com', 'viewer1');
      const slug = await createArticle(authorToken);

      await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ body: 'First comment' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ body: 'Second comment' })
        .expect(201);

      const guestRes = await request(app.getHttpServer())
        .get(`/api/articles/${slug}/comments`)
        .expect(200);
      expect(guestRes.body.comments).toHaveLength(2);
      expect(guestRes.body.comments[0].body).toBe('Second comment');
      expect(guestRes.body.comments[0].author.following).toBe(false);
      expect(guestRes.body.comments[1].body).toBe('First comment');
      expect(guestRes.body.comments[1].author.following).toBe(false);

      await request(app.getHttpServer())
        .post('/api/profiles/commenter2/follow')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const viewerRes = await request(app.getHttpServer())
        .get(`/api/articles/${slug}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      expect(viewerRes.body.comments[0].author.following).toBe(false);
      expect(viewerRes.body.comments[1].author.following).toBe(true);
    });

    it('should return 404 when article does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/articles/nonexistent-slug/comments')
        .expect(404);
    });
  });

  describe('DELETE /api/articles/:slug/comments/:id', () => {
    it('should enforce ownership, validate comment belonging to slug, and delete cleanly', async () => {
      const authorToken = await registerUser('a5@example.com', 'author5');
      const commenterToken = await registerUser('c3@example.com', 'commenter3');
      const slug1 = await createArticle(authorToken, 'Article One');
      const slug2 = await createArticle(authorToken, 'Article Two');

      const created = await request(app.getHttpServer())
        .post(`/api/articles/${slug1}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ body: 'Delete me' })
        .expect(201);

      const commentId = created.body.comment.id as number;

      await request(app.getHttpServer())
        .delete(`/api/articles/${slug1}/comments/${commentId}`)
        .expect(401);

      await request(app.getHttpServer())
        .delete(`/api/articles/${slug1}/comments/not-a-number`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .delete(`/api/articles/${slug2}/comments/${commentId}`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/articles/${slug1}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/articles/${slug1}/comments/${commentId}`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(204);

      const afterDelete = await request(app.getHttpServer())
        .get(`/api/articles/${slug1}/comments`)
        .expect(200);
      expect(afterDelete.body.comments).toEqual([]);
    });
  });
});
