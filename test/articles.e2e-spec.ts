import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { BODY_MAX_LENGTH } from '../src/articles/constants/articles.constants.js';
import { ArticleFavorite } from '../src/database/entities/article-favorite.entity.js';
import { ArticleTag } from '../src/database/entities/article-tag.entity.js';
import { Article } from '../src/database/entities/article.entity.js';
import { Attachment } from '../src/database/entities/attachment.entity.js';
import { Follow } from '../src/database/entities/follow.entity.js';
import { Tag } from '../src/database/entities/tag.entity.js';
import { User } from '../src/database/entities/user.entity.js';

describe('Articles (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const clearTestTables = async () => {
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

  describe('POST /api/articles (Create Article)', () => {
    it('should return 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/articles')
        .send({
          title: 'Unauthorized article',
          description: 'Desc',
          body: 'Body',
        })
        .expect(401);
    });

    it('should create articles with unique slugs even for identical titles and deduplicate tags', async () => {
      const token = await registerUser('author@example.com', 'author1');

      const res1 = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'How to train your dragon',
          description: 'Ever wonder how?',
          body: 'You have to believe',
          tagList: [' dragons ', 'nestjs', 'dragons'],
        })
        .expect(201);

      expect(res1.body.article).toMatchObject({
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

      const res2 = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'How to train your dragon',
          description: 'Second one',
          body: 'More content',
        })
        .expect(201);

      expect(res2.body.article.slug).not.toBe(res1.body.article.slug);
    });

    it('should return 400 when body exceeds BODY_MAX_LENGTH on create and update', async () => {
      const token = await registerUser('maxlen@example.com', 'maxlen');
      const oversizedBody = 'a'.repeat(BODY_MAX_LENGTH + 1);

      await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Too long body',
          description: 'Desc',
          body: oversizedBody,
        })
        .expect(400);

      const created = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Valid article',
          description: 'Desc',
          body: 'Valid body',
        })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/api/articles/${created.body.article.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: oversizedBody })
        .expect(400);
    });
  });

  describe('GET /api/articles & GET /api/articles/feed & GET /api/articles/:slug', () => {
    it('should filter articles by tag, author, favorited and paginate accurately', async () => {
      const aliceToken = await registerUser('alice@example.com', 'alice');
      const bobToken = await registerUser('bob@example.com', 'bob');

      const a1 = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          title: 'Alice NestJS Post',
          description: 'D1',
          body: 'B1',
          tagList: ['nestjs', 'mysql'],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          title: 'Bob Redis Post',
          description: 'D2',
          body: 'B2',
          tagList: ['redis'],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/articles/${a1.body.article.slug}/favorite`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      const listAll = await request(app.getHttpServer())
        .get('/api/articles?limit=1&offset=0')
        .expect(200);
      expect(listAll.body.articlesCount).toBe(2);
      expect(listAll.body.articles).toHaveLength(1);

      const byTag = await request(app.getHttpServer())
        .get('/api/articles?tag=nestjs')
        .expect(200);
      expect(byTag.body.articlesCount).toBe(1);
      expect(byTag.body.articles[0].title).toBe('Alice NestJS Post');

      const byAuthor = await request(app.getHttpServer())
        .get('/api/articles?author=bob')
        .expect(200);
      expect(byAuthor.body.articlesCount).toBe(1);
      expect(byAuthor.body.articles[0].author.username).toBe('bob');

      const byFavorited = await request(app.getHttpServer())
        .get('/api/articles?favorited=bob')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      expect(byFavorited.body.articlesCount).toBe(1);
      expect(byFavorited.body.articles[0].favorited).toBe(true);
      expect(byFavorited.body.articles[0].favoritesCount).toBe(1);
    });

    it('should return feed only from followed authors and never conflict with :slug route', async () => {
      const aliceToken = await registerUser('alicef@example.com', 'alicef');
      const bobToken = await registerUser('bobf@example.com', 'bobf');

      await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({
          title: 'Bob Feed Article',
          description: 'Desc',
          body: 'Body',
        })
        .expect(201);

      const emptyFeed = await request(app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      expect(emptyFeed.body).toEqual({ articles: [], articlesCount: 0 });

      await request(app.getHttpServer())
        .post('/api/profiles/bobf/follow')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      const populatedFeed = await request(app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      expect(populatedFeed.body.articlesCount).toBe(1);
      expect(populatedFeed.body.articles[0].author).toMatchObject({
        username: 'bobf',
        following: true,
      });
    });

    it('should get single article by slug and return 404 when missing', async () => {
      const token = await registerUser('get@example.com', 'getter');
      const created = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Single Article',
          description: 'Desc',
          body: 'Body',
        })
        .expect(201);

      const slug = created.body.article.slug as string;

      const fetched = await request(app.getHttpServer())
        .get(`/api/articles/${slug}`)
        .expect(200);
      expect(fetched.body.article.slug).toBe(slug);

      await request(app.getHttpServer())
        .get('/api/articles/nonexistent-slug-123')
        .expect(404);
    });
  });

  describe('PUT, DELETE, Favorite & Unfavorite /api/articles/:slug', () => {
    it('should enforce author permission (403) and allow author to update and delete', async () => {
      const authorToken = await registerUser('own@example.com', 'owner');
      const otherToken = await registerUser('oth@example.com', 'other');

      const created = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Original Title',
          description: 'Original Desc',
          body: 'Original Body',
          tagList: ['tag1'],
        })
        .expect(201);

      const originalSlug = created.body.article.slug as string;

      await request(app.getHttpServer())
        .put(`/api/articles/${originalSlug}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Tampered' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/articles/${originalSlug}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      const updated = await request(app.getHttpServer())
        .put(`/api/articles/${originalSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ title: 'New Title', body: 'New Body' })
        .expect(200);

      const newSlug = updated.body.article.slug as string;
      expect(newSlug).not.toBe(originalSlug);
      expect(updated.body.article.title).toBe('New Title');
      expect(updated.body.article.tagList).toEqual(['tag1']);

      await request(app.getHttpServer())
        .delete(`/api/articles/${newSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/articles/${newSlug}`)
        .expect(404);
    });

    it('should favorite idempotently and unfavorite cleanly', async () => {
      const authorToken = await registerUser('fav1@example.com', 'favauthor');
      const fanToken = await registerUser('fav2@example.com', 'fan');

      const created = await request(app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          title: 'Popular Article',
          description: 'Desc',
          body: 'Body',
        })
        .expect(201);

      const slug = created.body.article.slug as string;

      const favRes1 = await request(app.getHttpServer())
        .post(`/api/articles/${slug}/favorite`)
        .set('Authorization', `Bearer ${fanToken}`)
        .expect(200);
      expect(favRes1.body.article.favorited).toBe(true);
      expect(favRes1.body.article.favoritesCount).toBe(1);

      const favRes2 = await request(app.getHttpServer())
        .post(`/api/articles/${slug}/favorite`)
        .set('Authorization', `Bearer ${fanToken}`)
        .expect(200);
      expect(favRes2.body.article.favoritesCount).toBe(1);

      const unfavRes = await request(app.getHttpServer())
        .delete(`/api/articles/${slug}/favorite`)
        .set('Authorization', `Bearer ${fanToken}`)
        .expect(200);
      expect(unfavRes.body.article.favorited).toBe(false);
      expect(unfavRes.body.article.favoritesCount).toBe(0);
    });
  });
});
