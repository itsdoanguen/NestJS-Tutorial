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

    beforeEach(async () => {
      authorSeed = await seeder.createFakeUser();
    });

    it('should return 401 when unauthenticated, malformed scheme, invalid JWT, or revoked token', async () => {
      const payload = {
        title: 'Auth Check Article',
        description: 'Desc',
        body: 'Body',
      };

      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .send(payload)
        .expect(401);

      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .send(payload)
        .expect(401);

      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .send(payload)
        .expect(401);

      await seeder.revokeToken(authorSeed.token);
      await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send(payload)
        .expect(401);
    });

    it('should return 400 for all DTO validation branches on createArticle', async () => {
      const invalidPayloads: Record<string, unknown>[] = [
        { description: 'Desc', body: 'Body' },
        { title: '', description: 'Desc', body: 'Body' },
        { title: 123, description: 'Desc', body: 'Body' },
        {
          title: 'a'.repeat(TITLE_MAX_LENGTH + 1),
          description: 'Desc',
          body: 'Body',
        },
        { title: 'Title', body: 'Body' },
        { title: 'Title', description: '', body: 'Body' },
        { title: 'Title', description: true, body: 'Body' },
        {
          title: 'Title',
          description: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1),
          body: 'Body',
        },
        { title: 'Title', description: 'Desc' },
        { title: 'Title', description: 'Desc', body: '' },
        { title: 'Title', description: 'Desc', body: { text: 'obj' } },
        {
          title: 'Title',
          description: 'Desc',
          body: 'a'.repeat(BODY_MAX_LENGTH + 1),
        },
        {
          title: 'Title',
          description: 'Desc',
          body: 'Body',
          tagList: 'not-an-array',
        },
        {
          title: 'Title',
          description: 'Desc',
          body: 'Body',
          tagList: [123],
        },
        {
          title: 'Title',
          description: 'Desc',
          body: 'Body',
          tagList: ['   '],
        },
        {
          title: 'Title',
          description: 'Desc',
          body: 'Body',
          tagList: ['t'.repeat(TAG_MAX_LENGTH + 1)],
        },
        {
          title: 'Title',
          description: 'Desc',
          body: 'Body',
          extraNonWhitelistedField: 'forbidden',
        },
      ];

      for (const payload of invalidPayloads) {
        await request(ctx.app.getHttpServer())
          .post('/api/articles')
          .set('Authorization', `Bearer ${authorSeed.token}`)
          .send(payload)
          .expect(400);
      }
    });

    it('should create article without tagList and with empty tagList (tagNames.length === 0 branch)', async () => {
      const resNoTags = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Article Without Tags',
          description: 'No tags omitted',
          body: 'Content without tags',
        })
        .expect(201);

      expect(resNoTags.body.article).toMatchObject({
        title: 'Article Without Tags',
        tagList: [],
        favorited: false,
        favoritesCount: 0,
        author: {
          username: authorSeed.user.username,
          following: false,
        },
      });

      const resEmptyTags = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Article Empty Tags',
          description: 'Empty tag array',
          body: 'Content empty array',
          tagList: [],
        })
        .expect(201);

      expect(resEmptyTags.body.article.tagList).toEqual([]);
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

    it('should handle Vietnamese slug transliteration, special-char fallback, max base length, and duplicate titles', async () => {
      const vnRes = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Đánh giá NestJS & Đồng bộ dữ liệu!',
          description: 'VN slug test',
          body: 'Nội dung bài viết',
        })
        .expect(201);
      expect(vnRes.body.article.slug).toMatch(
        /^danh-gia-nestjs-dong-bo-du-lieu-[0-9a-f]{8}$/,
      );

      const symbolsRes = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: '!!! @@@ ###',
          description: 'Fallback slug test',
          body: 'Body',
        })
        .expect(201);
      expect(symbolsRes.body.article.slug).toMatch(/^article-[0-9a-f]{8}$/);

      const longTitle = 'word-'.repeat(51);
      const longRes = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: longTitle,
          description: 'Long title slug truncation',
          body: 'Body',
        })
        .expect(201);
      const longSlug = longRes.body.article.slug as string;
      const basePart = longSlug.slice(0, longSlug.lastIndexOf('-'));
      expect(basePart.length).toBeLessThanOrEqual(SLUG_BASE_MAX_LENGTH);

      const dupRes = await request(ctx.app.getHttpServer())
        .post('/api/articles')
        .set('Authorization', `Bearer ${authorSeed.token}`)
        .send({
          title: 'Đánh giá NestJS & Đồng bộ dữ liệu!',
          description: 'Duplicate title',
          body: 'Body 2',
        })
        .expect(201);
      expect(dupRes.body.article.slug).not.toBe(vnRes.body.article.slug);
    });
  });

  describe('GET /api/articles (listArticles)', () => {
    it('should return 401 when an invalid or revoked Bearer token is provided to OptionalJwtAuthGuard', async () => {
      const userSeed = await seeder.createFakeUser();

      await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', 'Bearer malformed.token')
        .expect(401);

      await seeder.revokeToken(userSeed.token);
      await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(401);
    });

    it('should return 400 when limit, offset, or string filter query params violate validation rules', async () => {
      const invalidQueries = [
        'limit=0',
        'limit=101',
        'limit=1.5',
        'limit=abc',
        'offset=-1',
        'offset=xyz',
        'tag=a&tag=b',
        'author=a&author=b',
        'favorited=a&favorited=b',
      ];

      for (const query of invalidQueries) {
        await request(ctx.app.getHttpServer())
          .get(`/api/articles?${query}`)
          .expect(400);
      }
    });

    it('should return empty list cleanly when no articles match (hydrateArticles empty branch)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .expect(200);

      expect(res.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it('should list, filter by author/tag/favorited, paginate, and hydrate following/favorites across guest and auth callers', async () => {
      const alice = await seeder.createFakeUser({ username: 'alice_list' });
      const bob = await seeder.createFakeUser({ username: 'bob_list' });
      const charlie = await seeder.createFakeUser({ username: 'charlie_list' });

      await seeder.createFakeFollow(alice.user.id, bob.user.id);

      const t1 = new Date('2026-01-01T10:00:00Z');
      const t2 = new Date('2026-01-02T10:00:00Z');
      const t3 = new Date('2026-01-03T10:00:00Z');

      const { article: a1 } = await seeder.createFakeArticle(alice.user, {
        title: 'Alice Untouched Post',
        tagNames: [],
        createdAt: t1,
      });
      const { article: b1 } = await seeder.createFakeArticle(bob.user, {
        title: 'Bob NestJS Post',
        tagNames: ['nestjs', 'mysql'],
        createdAt: t2,
      });
      const { article: c1 } = await seeder.createFakeArticle(charlie.user, {
        title: 'Charlie Redis Post',
        tagNames: ['redis'],
        createdAt: t3,
      });

      await seeder.createFakeFavorite(alice.user.id, b1.id);
      await seeder.createFakeFavorite(charlie.user.id, b1.id);

      const guestAll = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .expect(200);
      expect(guestAll.body.articlesCount).toBe(3);
      expect(guestAll.body.articles.map((a: Article) => a.slug)).toEqual([
        c1.slug,
        b1.slug,
        a1.slug,
      ]);
      expect(guestAll.body.articles[0].author.following).toBe(false);
      expect(guestAll.body.articles[0].favorited).toBe(false);

      const authAll = await request(ctx.app.getHttpServer())
        .get('/api/articles')
        .set('Authorization', `Bearer ${alice.token}`)
        .expect(200);

      expect(authAll.body.articles[0]).toMatchObject({
        slug: c1.slug,
        favorited: false,
        favoritesCount: 0,
        tagList: ['redis'],
        author: { username: charlie.user.username, following: false },
      });
      expect(authAll.body.articles[1]).toMatchObject({
        slug: b1.slug,
        favorited: true,
        favoritesCount: 2,
        tagList: ['mysql', 'nestjs'],
        author: { username: bob.user.username, following: true },
      });
      expect(authAll.body.articles[2]).toMatchObject({
        slug: a1.slug,
        favorited: false,
        favoritesCount: 0,
        tagList: [],
        author: { username: alice.user.username, following: false },
      });

      const paged = await request(ctx.app.getHttpServer())
        .get('/api/articles?limit=1&offset=1')
        .expect(200);
      expect(paged.body.articlesCount).toBe(3);
      expect(paged.body.articles).toHaveLength(1);
      expect(paged.body.articles[0].slug).toBe(b1.slug);

      const byAuthor = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${encodeURIComponent(`  ${bob.user.username}  `)}`,
        )
        .expect(200);
      expect(byAuthor.body.articlesCount).toBe(1);
      expect(byAuthor.body.articles[0].slug).toBe(b1.slug);

      const byTag = await request(ctx.app.getHttpServer())
        .get('/api/articles?tag=%20nestjs%20')
        .expect(200);
      expect(byTag.body.articlesCount).toBe(1);
      expect(byTag.body.articles[0].slug).toBe(b1.slug);

      const byFavorited = await request(ctx.app.getHttpServer())
        .get(`/api/articles?favorited=%20${charlie.user.username}%20`)
        .expect(200);
      expect(byFavorited.body.articlesCount).toBe(1);
      expect(byFavorited.body.articles[0].slug).toBe(b1.slug);

      const combinedMatch = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${bob.user.username}&tag=mysql&favorited=${alice.user.username}`,
        )
        .expect(200);
      expect(combinedMatch.body.articlesCount).toBe(1);

      const combinedNoMatch = await request(ctx.app.getHttpServer())
        .get(
          `/api/articles?author=${bob.user.username}&tag=redis&favorited=${alice.user.username}`,
        )
        .expect(200);
      expect(combinedNoMatch.body).toEqual({ articles: [], articlesCount: 0 });
    });
  });

  describe('GET /api/articles/feed (feedArticles)', () => {
    let reader: FakeUserSeed;

    beforeEach(async () => {
      reader = await seeder.createFakeUser({ username: 'feed_reader' });
    });

    it('should return 401 without auth or with revoked token, and 400 on invalid pagination params', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .expect(401);

      await seeder.revokeToken(reader.token);
      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(401);

      const freshReader = await seeder.createFakeUser();
      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed?limit=0')
        .set('Authorization', `Bearer ${freshReader.token}`)
        .expect(400);

      await request(ctx.app.getHttpServer())
        .get('/api/articles/feed?offset=-1')
        .set('Authorization', `Bearer ${freshReader.token}`)
        .expect(400);
    });

    it('should return empty feed when following nobody and when followed authors have no articles', async () => {
      const noFollowRes = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(noFollowRes.body).toEqual({ articles: [], articlesCount: 0 });

      const silentAuthor = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, silentAuthor.user.id);

      const silentRes = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(silentRes.body).toEqual({ articles: [], articlesCount: 0 });
    });

    it('should return paginated feed exclusively from followed authors with hydrated flags', async () => {
      const followedAuthor = await seeder.createFakeUser();
      const unfollowedAuthor = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, followedAuthor.user.id);

      const { article: older } = await seeder.createFakeArticle(
        followedAuthor.user,
        {
          title: 'Followed Older',
          tagNames: ['feed'],
          createdAt: new Date('2026-02-01T00:00:00Z'),
        },
      );
      const { article: newer } = await seeder.createFakeArticle(
        followedAuthor.user,
        {
          title: 'Followed Newer',
          createdAt: new Date('2026-02-02T00:00:00Z'),
        },
      );
      await seeder.createFakeArticle(unfollowedAuthor.user, {
        title: 'Unfollowed Post',
        createdAt: new Date('2026-02-03T00:00:00Z'),
      });
      await seeder.createFakeFavorite(reader.user.id, newer.id);

      const page1 = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed?limit=1&offset=0')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(page1.body.articlesCount).toBe(2);
      expect(page1.body.articles).toHaveLength(1);
      expect(page1.body.articles[0]).toMatchObject({
        slug: newer.slug,
        favorited: true,
        favoritesCount: 1,
        author: { username: followedAuthor.user.username, following: true },
      });

      const page2 = await request(ctx.app.getHttpServer())
        .get('/api/articles/feed?limit=1&offset=1')
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);

      expect(page2.body.articlesCount).toBe(2);
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
    it('should handle missing slug (404 in en/vi), invalid/revoked auth (401), and guest vs authenticated hydration', async () => {
      const author = await seeder.createFakeUser();
      const reader = await seeder.createFakeUser();
      await seeder.createFakeFollow(reader.user.id, author.user.id);
      const { article } = await seeder.createFakeArticle(author.user, {
        tagNames: ['nestjs'],
      });
      await seeder.createFakeFavorite(reader.user.id, article.id);

      const notFoundEn = await request(ctx.app.getHttpServer())
        .get('/api/articles/missing-article-slug')
        .expect(404);
      expect(notFoundEn.body.message).toBe('Article not found.');

      const notFoundVi = await request(ctx.app.getHttpServer())
        .get('/api/articles/missing-article-slug')
        .set('x-lang', 'vi')
        .expect(404);
      expect(notFoundVi.body.message).toBe('Không tìm thấy bài viết.');

      await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);

      const guestRes = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .expect(200);
      expect(guestRes.body.article).toMatchObject({
        slug: article.slug,
        favorited: false,
        favoritesCount: 1,
        tagList: ['nestjs'],
        author: { username: author.user.username, following: false },
      });

      const authRes = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(authRes.body.article).toMatchObject({
        slug: article.slug,
        favorited: true,
        favoritesCount: 1,
        author: { username: author.user.username, following: true },
      });

      await seeder.revokeToken(reader.token);
      await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(401);
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

    it('should enforce auth (401), existence (404), ownership (403 in en/vi), and DTO validation (400)', async () => {
      await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .send({ title: 'No Auth' })
        .expect(401);

      await request(ctx.app.getHttpServer())
        .put('/api/articles/unknown-slug')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Missing' })
        .expect(404);

      const forbiddenEn = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Tampered' })
        .expect(403);
      expect(forbiddenEn.body.message).toBe(
        'You are not authorized to modify this article.',
      );

      const forbiddenVi = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .set('x-lang', 'vi')
        .send({ title: 'Tampered' })
        .expect(403);
      expect(forbiddenVi.body.message).toBe(
        'Bạn không có quyền chỉnh sửa hoặc xóa bài viết này.',
      );

      const invalidUpdates: Record<string, unknown>[] = [
        { title: '' },
        { title: 123 },
        { title: 't'.repeat(TITLE_MAX_LENGTH + 1) },
        { description: '' },
        { description: false },
        { description: 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1) },
        { body: '' },
        { body: [] },
        { body: 'b'.repeat(BODY_MAX_LENGTH + 1) },
        { slug: 'cannot-override-slug' },
      ];

      for (const payload of invalidUpdates) {
        await request(ctx.app.getHttpServer())
          .put(`/api/articles/${targetArticle.slug}`)
          .set('Authorization', `Bearer ${owner.token}`)
          .send(payload)
          .expect(400);
      }
    });

    it('should preserve slug when title is omitted or identical, and regenerate slug when title changes', async () => {
      const noOpRes = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({})
        .expect(200);
      expect(noOpRes.body.article).toMatchObject({
        slug: targetArticle.slug,
        title: 'Original Title',
        description: 'Original Description',
        body: 'Original Body',
        tagList: ['tag1'],
      });

      const sameTitleRes = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          title: 'Original Title',
          description: 'Updated Description Only',
        })
        .expect(200);
      expect(sameTitleRes.body.article.slug).toBe(targetArticle.slug);
      expect(sameTitleRes.body.article.description).toBe(
        'Updated Description Only',
      );

      const changedTitleRes = await request(ctx.app.getHttpServer())
        .put(`/api/articles/${targetArticle.slug}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          title: 'Brand New Title',
          body: 'Updated Body Content',
        })
        .expect(200);
      expect(changedTitleRes.body.article.slug).not.toBe(targetArticle.slug);
      expect(changedTitleRes.body.article.slug).toMatch(
        /^brand-new-title-[0-9a-f]{8}$/,
      );
      expect(changedTitleRes.body.article).toMatchObject({
        title: 'Brand New Title',
        description: 'Updated Description Only',
        body: 'Updated Body Content',
      });

      const persisted = await ctx.dataSource
        .getRepository(Article)
        .findOneByOrFail({ id: targetArticle.id });
      expect(persisted.slug).toBe(changedTitleRes.body.article.slug);
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

    it('should return 401 unauthenticated, 404 for unknown slug, 403 for non-owner, and 204 with DB cascade for owner', async () => {
      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}`)
        .expect(401);

      await request(ctx.app.getHttpServer())
        .delete('/api/articles/unknown-slug')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);

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

    it('should enforce 401/404 and handle favorite, duplicate favorite (ER_DUP_ENTRY), unfavorite, and repeat unfavorite idempotently', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .expect(401);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .expect(401);

      await request(ctx.app.getHttpServer())
        .post('/api/articles/missing-slug/favorite')
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(404);

      await request(ctx.app.getHttpServer())
        .delete('/api/articles/missing-slug/favorite')
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(404);

      const unfavoriteWhenEmpty = await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);
      expect(unfavoriteWhenEmpty.body.article).toMatchObject({
        favorited: false,
        favoritesCount: 0,
      });

      const firstFavorite = await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);
      expect(firstFavorite.body.article).toMatchObject({
        favorited: true,
        favoritesCount: 1,
      });

      const repeatFavorite = await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);
      expect(repeatFavorite.body.article).toMatchObject({
        favorited: true,
        favoritesCount: 1,
      });

      const persistedFavorites = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ userId: fan.user.id, articleId: article.id });
      expect(persistedFavorites).toHaveLength(1);

      const unfavoriteRes = await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/favorite`)
        .set('Authorization', `Bearer ${fan.token}`)
        .expect(200);
      expect(unfavoriteRes.body.article).toMatchObject({
        favorited: false,
        favoritesCount: 0,
      });

      const afterUnfavorite = await ctx.dataSource
        .getRepository(ArticleFavorite)
        .findBy({ userId: fan.user.id, articleId: article.id });
      expect(afterUnfavorite).toEqual([]);
    });
  });
});
