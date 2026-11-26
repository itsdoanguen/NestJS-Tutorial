import request from 'supertest';
import {
  BODY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  SLUG_BASE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../src/articles/constants/articles.constants.js';
import { ArticleFavorite } from '../src/database/entities/article-favorite.entity.js';
import { ArticleTag } from '../src/database/entities/article-tag.entity.js';
import { Article } from '../src/database/entities/article.entity.js';
import { Tag } from '../src/database/entities/tag.entity.js';
import {
  cleanupE2eAfterEach,
  closeE2eApp,
  createE2eTestApp,
  type E2eTestContext,
} from './helpers/e2e-database.helper.js';
import {
  E2eFakeDataFactory,
  type FakeUserSeed,
} from './helpers/e2e-fake-data.helper.js';

interface InvalidPayloadCase {
  label: string;
  payload: Record<string, unknown>;
}

interface InvalidQueryCase {
  label: string;
  query: string;
}

const INVALID_CREATE_PAYLOADS: InvalidPayloadCase[] = [
  { label: 'title is missing', payload: { description: 'Desc', body: 'Body' } },
  {
    label: 'title is empty',
    payload: { title: '', description: 'Desc', body: 'Body' },
  },
  {
    label: 'title is not a string',
    payload: { title: 123, description: 'Desc', body: 'Body' },
  },
  {
    label: 'title exceeds TITLE_MAX_LENGTH',
    payload: {
      title: 'a'.repeat(TITLE_MAX_LENGTH + 1),
      description: 'Desc',
      body: 'Body',
    },
  },
  {
    label: 'description is missing',
    payload: { title: 'Title', body: 'Body' },
  },
  {
    label: 'description is empty',
    payload: { title: 'Title', description: '', body: 'Body' },
  },
  {
    label: 'description is not a string',
    payload: { title: 'Title', description: true, body: 'Body' },
  },
  {
    label: 'description exceeds DESCRIPTION_MAX_LENGTH',
    payload: {
      title: 'Title',
      description: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1),
      body: 'Body',
    },
  },
  {
    label: 'body is missing',
    payload: { title: 'Title', description: 'Desc' },
  },
  {
    label: 'body is empty',
    payload: { title: 'Title', description: 'Desc', body: '' },
  },
  {
    label: 'body is not a string',
    payload: { title: 'Title', description: 'Desc', body: { text: 'obj' } },
  },
  {
    label: 'body exceeds BODY_MAX_LENGTH',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'a'.repeat(BODY_MAX_LENGTH + 1),
    },
  },
  {
    label: 'tagList is not an array',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'Body',
      tagList: 'not-an-array',
    },
  },
  {
    label: 'tagList contains a non-string element',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'Body',
      tagList: [123],
    },
  },
  {
    label: 'tagList contains a whitespace-only string',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'Body',
      tagList: ['   '],
    },
  },
  {
    label: 'tagList contains a tag exceeding TAG_MAX_LENGTH',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'Body',
      tagList: ['t'.repeat(TAG_MAX_LENGTH + 1)],
    },
  },
  {
    label: 'payload contains a non-whitelisted property',
    payload: {
      title: 'Title',
      description: 'Desc',
      body: 'Body',
      extraNonWhitelistedField: 'forbidden',
    },
  },
];

const INVALID_LIST_QUERIES: InvalidQueryCase[] = [
  { label: 'limit is less than 1 (limit=0)', query: 'limit=0' },
  { label: 'limit exceeds MAX_ARTICLES_LIMIT (limit=101)', query: 'limit=101' },
  { label: 'limit is not an integer (limit=1.5)', query: 'limit=1.5' },
  { label: 'limit is non-numeric (limit=abc)', query: 'limit=abc' },
  { label: 'offset is negative (offset=-1)', query: 'offset=-1' },
  { label: 'offset is non-numeric (offset=xyz)', query: 'offset=xyz' },
  { label: 'tag is an array instead of a string', query: 'tag=a&tag=b' },
  {
    label: 'author is an array instead of a string',
    query: 'author=a&author=b',
  },
  {
    label: 'favorited is an array instead of a string',
    query: 'favorited=a&favorited=b',
  },
];

const INVALID_FEED_QUERIES: InvalidQueryCase[] = [
  { label: 'limit is less than 1 (limit=0)', query: 'limit=0' },
  { label: 'offset is negative (offset=-1)', query: 'offset=-1' },
];

const INVALID_UPDATE_PAYLOADS: InvalidPayloadCase[] = [
  { label: 'title is empty', payload: { title: '' } },
  { label: 'title is not a string', payload: { title: 123 } },
  {
    label: 'title exceeds TITLE_MAX_LENGTH',
    payload: { title: 't'.repeat(TITLE_MAX_LENGTH + 1) },
  },
  { label: 'description is empty', payload: { description: '' } },
  { label: 'description is not a string', payload: { description: false } },
  {
    label: 'description exceeds DESCRIPTION_MAX_LENGTH',
    payload: { description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1) },
  },
  { label: 'body is empty', payload: { body: '' } },
  { label: 'body is not a string', payload: { body: [] } },
  {
    label: 'body exceeds BODY_MAX_LENGTH',
    payload: { body: 'b'.repeat(BODY_MAX_LENGTH + 1) },
  },
  {
    label: 'payload attempts to override non-whitelisted slug',
    payload: { slug: 'cannot-override-slug' },
  },
];

describe('ArticlesController (e2e - C2 branch coverage)', () => {
  let ctx: E2eTestContext;
  let seeder: E2eFakeDataFactory;

  beforeAll(async () => {
    ctx = await createE2eTestApp();
    seeder = new E2eFakeDataFactory(ctx.app, ctx.dataSource);
  });

  afterEach(async () => {
    await cleanupE2eAfterEach(ctx.dataSource, ctx.redisClient);
  });

  afterAll(async () => {
    await closeE2eApp(ctx);
  });

  describe('POST /api/articles (createArticle)', () => {
    let authorSeed: FakeUserSeed;
    const validPayload = {
      title: 'Auth Check Article',
      description: 'Desc',
      body: 'Body',
    };

    beforeEach(async () => {
      authorSeed = await seeder.createFakeUser();
    });

    it('should return 401 when Authorization header is missing', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .send(validPayload)
        .expect(401);
    });

    it('should return 401 when Authorization scheme is not Bearer', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send(validPayload)
        .expect(401);
    });

    it('should return 401 when Bearer JWT is invalid', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send(validPayload)
        .expect(401);
    });

    it('should return 401 when Bearer token is revoked in Redis', async () => {
      await seeder.revokeToken(authorSeed.token);

      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send(validPayload)
        .expect(401);
    });

    it.each(INVALID_CREATE_PAYLOADS)(
      'should return 400 when $label',
      async ({ payload }) => {
        await request(ctx.app.getHttpServer())
          .post('/api/articles')
          .set('Authorization', `Bearer ${authorSeed.token}`)
          .send(payload)
          .expect(400);
      },
    );

    it('should create article with empty tagList when tagList is omitted', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Article Without Tags',
          description: 'No tags omitted',
          body: 'Content without tags',
        })
        .expect(201);

      expect(res.body.article).toMatchObject({
        title: 'Article Without Tags',
        tagList: [],
        favorited: false,
        favoritesCount: 0,
        author: {
          username: authorSeed.user.username,
          following: false,
        },
      });
    });

    it('should create article with empty tagList when tagList is []', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Article Empty Tags',
          description: 'Empty tag array',
          body: 'Content empty array',
          tagList: [],
        })
        .expect(201);

      expect(res.body.article.tagList).toEqual([]);
    });

    it('should deduplicate/trim tags, reuse existing tags via orIgnore, and persist full article graph in DB', async () => {
      await seeder.createFakeArticle(authorSeed.user, {
        tagNames: ['nestjs'],
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Tagged NestJS Guide',
          description: 'Learning TypeORM transactions',
          body: 'Detailed guide body',
          tagList: ['  typescript  ', 'nestjs', 'typescript', 'mysql'],
        })
        .expect(201);

      expect(res.body.article.tagList).toEqual([
        'mysql',
        'nestjs',
        'typescript',
      ]);

      const savedArticle = await ctx.dataSource
        .getRepository(Article)
        .findOneByOrFail({ slug: res.body.article.slug as string });
      expect(savedArticle.authorId).toBe(authorSeed.user.id);

      const tagRows = await ctx.dataSource
        .getRepository(ArticleTag)
        .findBy({ articleId: savedArticle.id });
      expect(tagRows).toHaveLength(3);
    });

    it('should transliterate Vietnamese characters when generating slug', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Đánh giá NestJS & Đồng bộ dữ liệu!',
          description: 'VN slug test',
          body: 'Nội dung bài viết',
        })
        .expect(201);

      expect(res.body.article.slug).toMatch(
        /^danh-gia-nestjs-dong-bo-du-lieu-[0-9a-f]{8}$/,
      );
    });

    it('should fall back to default slug base when title has only special characters', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: '!!! @@@ ###',
          description: 'Fallback slug test',
          body: 'Body',
        })
        .expect(201);

      expect(res.body.article.slug).toMatch(/^article-[0-9a-f]{8}$/);
    });

    it('should truncate slug base to SLUG_BASE_MAX_LENGTH for long titles', async () => {
      const longTitle = 'word-'.repeat(51);
      const res = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: longTitle,
          description: 'Long title slug truncation',
          body: 'Body',
        })
        .expect(201);

      const slug = res.body.article.slug as string;
      const basePart = slug.slice(0, slug.lastIndexOf('-'));
      expect(basePart.length).toBeLessThanOrEqual(SLUG_BASE_MAX_LENGTH);
    });

    it('should generate distinct slugs when creating articles with identical titles', async () => {
      const res1 = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Identical Title',
          description: 'First',
          body: 'Body 1',
        })
        .expect(201);

      const res2 = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Identical Title',
          description: 'Second',
          body: 'Body 2',
        })
        .expect(201);

      expect(res2.body.article.slug).not.toBe(res1.body.article.slug);
    });
  });

  describe('GET /api/articles (listArticles)', () => {
    const seedListDataset = async () => {
      const alice = await seeder.createFakeUser({ username: 'alice_list' });
      const bob = await seeder.createFakeUser({ username: 'bob_list' });
      const charlie = await seeder.createFakeUser({ username: 'charlie_list' });

      await seeder.createFakeFollow(alice.user.id, bob.user.id);

      const { article: a1 } = await seeder.createFakeArticle(alice.user, {
        title: 'Alice Untouched Post',
        tagNames: [],
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      const { article: b1 } = await seeder.createFakeArticle(bob.user, {
        title: 'Bob NestJS Post',
        tagNames: ['nestjs', 'mysql'],
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });
      const { article: c1 } = await seeder.createFakeArticle(charlie.user, {
        title: 'Charlie Redis Post',
        tagNames: ['redis'],
        createdAt: new Date('2026-01-03T10:00:00Z'),
      });

      await seeder.createFakeFavorite(alice.user.id, b1.id);
      await seeder.createFakeFavorite(charlie.user.id, b1.id);

      return { alice, bob, charlie, a1, b1, c1 };
    };

    it('should return 401 when Bearer token is invalid', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', 'Bearer malformed.token')
        .expect(401);
    });

    it('should return 401 when Bearer token is revoked in Redis', async () => {
      const userSeed = await seeder.createFakeUser();
      await seeder.revokeToken(userSeed.token);

      await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(401);
    });

    it.each(INVALID_LIST_QUERIES)(
      'should return 400 when $label',
      async ({ query }) => {
        await request(ctx.app.getHttpServer())
          .get(`/api/articles?${query}`)
          .expect(400);
      },
    );

    it('should return empty list cleanly when no articles exist (hydrateArticles empty branch)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .expect(200);

      expect(res.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it('should list all articles ordered newest first with following=false and favorited=false for guests', async () => {
      const { a1, b1, c1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .expect(200);

      expect(res.body.articlesCount).toBe(3);
      expect(res.body.articles.map((a: Article) => a.slug)).toEqual([
        c1.slug,
        b1.slug,
        a1.slug,
      ]);
      expect(res.body.articles[0].author.following).toBe(false);
      expect(res.body.articles[0].favorited).toBe(false);
    });

    it('should hydrate favorited, favoritesCount, tagList, and author.following when authenticated', async () => {
      const { alice, bob, charlie, a1, b1, c1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(res.body.articles[0]).toMatchObject({
        slug: c1.slug,
        favorited: false,
        favoritesCount: 0,
        tagList: ['redis'],
        author: { username: charlie.user.username, following: false },
      });
      expect(res.body.articles[1]).toMatchObject({
        slug: b1.slug,
        favorited: true,
        favoritesCount: 2,
        tagList: ['mysql', 'nestjs'],
        author: { username: bob.user.username, following: true },
      });
      expect(res.body.articles[2]).toMatchObject({
        slug: a1.slug,
        favorited: false,
        favoritesCount: 0,
        tagList: [],
        author: { username: alice.user.username, following: false },
      });
    });

    it('should paginate articles accurately with limit and offset', async () => {
      const { b1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles?limit=1&offset=1')
        .expect(200);

      expect(res.body.articlesCount).toBe(3);
      expect(res.body.articles).toHaveLength(1);
      expect(res.body.articles[0].slug).toBe(b1.slug);
    });

    it('should filter articles by trimmed author query param', async () => {
      const { bob, b1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${encodeURIComponent(`  ${bob.user.username}  `)}`,
        )
        .expect(200);

      expect(res.body.articlesCount).toBe(1);
      expect(res.body.articles[0].slug).toBe(b1.slug);
    });

    it('should filter articles by trimmed tag query param', async () => {
      const { b1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles?tag=%20nestjs%20')
        .expect(200);

      expect(res.body.articlesCount).toBe(1);
      expect(res.body.articles[0].slug).toBe(b1.slug);
    });

    it('should filter articles by trimmed favorited query param', async () => {
      const { charlie, b1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/articles?favorited=%20${charlie.user.username}%20`)
        .expect(200);

      expect(res.body.articlesCount).toBe(1);
      expect(res.body.articles[0].slug).toBe(b1.slug);
    });

    it('should support combining author, tag, and favorited filters', async () => {
      const { alice, bob, b1 } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${bob.user.username}&tag=mysql&favorited=${alice.user.username}`,
        )
        .expect(200);

      expect(res.body.articlesCount).toBe(1);
      expect(res.body.articles[0].slug).toBe(b1.slug);
    });

    it('should return empty list when combined filters match no articles', async () => {
      const { alice, bob } = await seedListDataset();

      const res = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${bob.user.username}&tag=redis&favorited=${alice.user.username}`,
        )
        .expect(200);

      expect(res.body).toEqual({ articles: [], articlesCount: 0 });
    });
  });

  describe('GET /api/articles/feed (feedArticles)', () => {
    let reader: FakeUserSeed;

    beforeEach(async () => {
      reader = await seeder.createFakeUser({ username: 'feed_reader' });
    });

    it('should return 401 when unauthenticated', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .expect(401);
    });

    it('should return 401 when Bearer token is revoked in Redis', async () => {
      await seeder.revokeToken(reader.token);

      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(401);
    });

    it.each(INVALID_FEED_QUERIES)(
      'should return 400 when $label',
      async ({ query }) => {
        await request(ctx.app.getHttpServer())
          .get(`/api/articles/feed?${query}`)
          .set('Authorization', `Bearer ${reader.token}`)
          .expect(400);
      },
    );

    it('should return empty feed when user follows nobody', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(res.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it('should return empty feed when followed authors have no articles', async () => {
      const silentAuthor = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, silentAuthor.user.id);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(res.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it('should return only articles from followed authors with hydrated flags', async () => {
      const followedAuthor = await seeder.createFakeUser();
      const unfollowedAuthor = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, followedAuthor.user.id);

      const { article: newer } = await seeder.createFakeArticle(
        followedAuthor.user,
        {
          title: 'Followed Newer',
          tagNames: ['feed'],
          createdAt: new Date('2026-02-02T00:00:00Z'),
        },
      );
      await seeder.createFakeArticle(unfollowedAuthor.user, {
        title: 'Unfollowed Post',
        createdAt: new Date('2026-02-03T00:00:00Z'),
      });
      await seeder.createFakeFavorite(reader.user.id, newer.id);

      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(res.body.articlesCount).toBe(1);
      expect(res.body.articles).toHaveLength(1);
      expect(res.body.articles[0]).toMatchObject({
        slug: newer.slug,
        favorited: true,
        favoritesCount: 1,
        tagList: ['feed'],
        author: { username: followedAuthor.user.username, following: true },
      });
    });

    it('should paginate feed articles with limit and offset', async () => {
      const followedAuthor = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, followedAuthor.user.id);

      const { article: older } = await seeder.createFakeArticle(
        followedAuthor.user,
        {
          title: 'Followed Older',
          tagNames: ['feed'],
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      );
      await seeder.createFakeArticle(followedAuthor.user, {
        title: 'Followed Newer',
        createdAt: new Date('2026-02-02T00:00:00Z'),
      });

      const page2 = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed?limit=1&offset=1')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(page2.body.articlesCount).toBe(2);
      expect(page2.body.articles).toHaveLength(1);
      expect(page2.body.articles[0]).toMatchObject({
        slug: older.slug,
        favorited: false,
        favoritesCount: 0,
        tagList: ['feed'],
        author: { username: followedAuthor.user.username, following: true },
      });
    });
  });

  describe('GET /api/articles/:slug (getArticle)', () => {
    it('should return 404 in English by default when slug does not exist', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles/missing-article-slug')
        .expect(404);

      expect(res.body.message).toBe('Article not found.');
    });

    it('should return 404 in Vietnamese when x-lang is vi and slug does not exist', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles/missing-article-slug')
        .set('x-lang', 'vi')
        .expect(404);

      expect(res.body.message).toBe('Không tìm thấy bài viết.');
    });

    it('should return 401 when Bearer token is invalid', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);
    });

    it('should return 401 when Bearer token is revoked in Redis', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);
      await seeder.revokeToken(author.token);

      await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${author.token}`)
        .expect(401);
    });

    it('should return article with following=false and favorited=false when unauthenticated', async () => {
      const author = await seeder.createFakeUser();
      const reader = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user, {
        tagNames: ['nestjs'],
      });
      await seeder.createFakeFavorite(reader.user.id, article.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        slug: article.slug,
        favorited: false,
        favoritesCount: 1,
        tagList: ['nestjs'],
        author: { username: author.user.username, following: false },
      });
    });

    it('should return article with hydrated following and favorited flags when authenticated', async () => {
      const author = await seeder.createFakeUser();
      const reader = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, author.user.id);
      const { article } = await seeder.createFakeArticle(author.user, {
        tagNames: ['nestjs'],
      });
      await seeder.createFakeFavorite(reader.user.id, article.id);

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        slug: article.slug,
        favorited: true,
        favoritesCount: 1,
        tagList: ['nestjs'],
        author: { username: author.user.username, following: true },
      });
    });
  });

  describe('PUT /api/articles/:slug (updateArticle)', () => {
    let owner: FakeUserSeed;
    let other: FakeUserSeed;
    let targetArticle: Article;

    beforeEach(async () => {
      owner = await seeder.createFakeUser();
      other = await seeder.createFakeUser();
      const seeded = await seeder.createFakeArticle(owner.user, {
        title: 'Original Title',
        description: 'Original Description',
        body: 'Original Body',
        tagNames: ['tag1'],
      });
      targetArticle = seeded.article;
    });

    it('should return 401 when updating without Bearer token', async () => {
      await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .send({ title: 'No Auth' })
        .expect(401);
    });

    it('should return 401 when Bearer token is revoked in Redis', async () => {
      await seeder.revokeToken(owner.token);

      await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Revoked' })
        .expect(401);
    });

    it('should return 404 when target article slug does not exist', async () => {
      await request(ctx.app.getHttpServer())
        .put('/api/articles/unknown-slug')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Missing' })
        .expect(404);
    });

    it('should return 403 in English and keep DB article unchanged when non-owner tries to update', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Tampered Title' })
        .expect(403);

      expect(res.body.message).toBe(
        'You are not authorized to modify this article.',
      );

      const unchanged = await ctx.dataSource
        .getRepository(Article)
        .findOneByOrFail({ id: targetArticle.id });
      expect(unchanged.title).toBe('Original Title');
      expect(unchanged.slug).toBe(targetArticle.slug);
    });

    it('should return 403 in Vietnamese and keep DB article unchanged when non-owner tries to update with x-lang=vi', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .set('x-lang', 'vi')
        .send({ title: 'Tampered Title' })
        .expect(403);

      expect(res.body.message).toBe(
        'Bạn không có quyền chỉnh sửa hoặc xóa bài viết này.',
      );

      const unchanged = await ctx.dataSource
        .getRepository(Article)
        .findOneByOrFail({ id: targetArticle.id });
      expect(unchanged.title).toBe('Original Title');
      expect(unchanged.slug).toBe(targetArticle.slug);
    });

    it.each(INVALID_UPDATE_PAYLOADS)(
      'should return 400 when $label',
      async ({ payload }) => {
        await request(ctx.app.getHttpServer())
          .put(`/api/articles/${targetArticle.slug}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send(payload)
          .expect(400);
      },
    );

    it('should preserve all fields and slug when update payload is empty', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({})
        .expect(200);

      expect(res.body.article).toMatchObject({
        slug: targetArticle.slug,
        title: 'Original Title',
        description: 'Original Description',
        body: 'Original Body',
        tagList: ['tag1'],
      });
    });

    it('should preserve slug when title is identical to current title', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          title: 'Original Title',
          description: 'Updated Description Only',
        })
        .expect(200);

      expect(res.body.article.slug).toBe(targetArticle.slug);
      expect(res.body.article.description).toBe('Updated Description Only');
    });

    it('should regenerate slug and persist updates when title, description, and body change', async () => {
      const res = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          title: 'Brand New Title',
          description: 'Updated Description',
          body: 'Updated Body Content',
        })
        .expect(200);

      expect(res.body.article.slug).not.toBe(targetArticle.slug);
      expect(res.body.article.slug).toMatch(/^brand-new-title-[0-9a-f]{8}$/);
      expect(res.body.article).toMatchObject({
        title: 'Brand New Title',
        description: 'Updated Description',
        body: 'Updated Body Content',
      });

      const persisted = await ctx.dataSource
        .getRepository(Article)
        .findOneByOrFail({ id: targetArticle.id });
      expect(persisted.slug).toBe(res.body.article.slug);
      expect(persisted.title).toBe('Brand New Title');
      expect(persisted.description).toBe('Updated Description');
      expect(persisted.body).toBe('Updated Body Content');
    });
  });

  describe('DELETE /api/articles/:slug (deleteArticle)', () => {
    let owner: FakeUserSeed;
    let other: FakeUserSeed;
    let article: Article;

    beforeEach(async () => {
      owner = await seeder.createFakeUser();
      other = await seeder.createFakeUser();
      const seeded = await seeder.createFakeArticle(owner.user, {
        tagNames: ['cleanup'],
      });
      article = seeded.article;
      await seeder.createFakeFavorite(other.user.id, article.id);
    });

    it('should return 401 when deleting without Bearer token', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}`)
        .expect(401);
    });

    it('should return 404 when target article slug does not exist', async () => {
      await request(ctx.app.getHttpServer())
        .delete('/api/articles/unknown-slug')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('should return 403 and keep article in DB when non-owner tries to delete', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);

      const stillExists = await ctx.dataSource
        .getRepository(Article)
        .findOneBy({ id: article.id });
      expect(stillExists).not.toBeNull();
    });

    it('should delete article and cascade delete article_tags and article_favorites while keeping tags when requested by owner', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(204);

      const deletedArticle = await ctx.dataSource
        .getRepository(Article)
        .findOneBy({ id: article.id });
      expect(deletedArticle).toBeNull();

      const remainingArticleTags = await ctx.dataSource
        .getRepository(ArticleTag)
        .findBy({ articleId: article.id });
      expect(remainingArticleTags).toEqual([]);

      const remainingFavorites = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ articleId: article.id });
      expect(remainingFavorites).toEqual([]);

      const tagStillExists = await ctx.dataSource
        .getRepository(Tag)
        .findOneBy({ name: 'cleanup' });
      expect(tagStillExists).not.toBeNull();
    });
  });

  describe('POST & DELETE /api/articles/:slug/favorite (favoriteArticle & unfavoriteArticle)', () => {
    let author: FakeUserSeed;
    let fan: FakeUserSeed;
    let article: Article;

    beforeEach(async () => {
      author = await seeder.createFakeUser();
      fan = await seeder.createFakeUser();
      const seeded = await seeder.createFakeArticle(author.user);
      article = seeded.article;
    });

    it('should return 401 when favoriting without Bearer token', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .expect(401);
    });

    it('should return 401 when unfavoriting without Bearer token', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .expect(401);
    });

    it('should return 404 when favoriting a nonexistent article', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/articles/missing-slug/favorite')
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(404);
    });

    it('should return 404 when unfavoriting a nonexistent article', async () => {
      await request(ctx.app.getHttpServer())
        .delete('/api/articles/missing-slug/favorite')
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(404);
    });

    it('should return 200 idempotently when unfavoriting an article that is not favorited', async () => {
      const res = await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        favorited: false,
        favoritesCount: 0,
      });
    });

    it('should favorite an article and persist record in article_favorites', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        favorited: true,
        favoritesCount: 1,
      });

      const rows = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ userId: fan.user.id, articleId: article.id });
      expect(rows).toHaveLength(1);
    });

    it('should handle duplicate favorite idempotently without creating duplicate rows', async () => {
      await seeder.createFakeFavorite(fan.user.id, article.id);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        favorited: true,
        favoritesCount: 1,
      });

      const rows = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ userId: fan.user.id, articleId: article.id });
      expect(rows).toHaveLength(1);
    });

    it('should unfavorite a favorited article and remove record from article_favorites', async () => {
      await seeder.createFakeFavorite(fan.user.id, article.id);

      const res = await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);

      expect(res.body.article).toMatchObject({
        favorited: false,
        favoritesCount: 0,
      });

      const rows = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ userId: fan.user.id, articleId: article.id });
      expect(rows).toEqual([]);
    });
  });
});
