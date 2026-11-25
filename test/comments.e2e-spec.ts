import request from 'supertest';
import { COMMENT_BODY_MAX_LENGTH } from '../src/comments/constants/comments.constants.js';
import { Comment } from '../src/database/entities/comment.entity.js';
import {
  cleanupE2eAfterEach,
  closeE2eApp,
  createE2eTestApp,
  type E2eTestContext,
} from './helpers/e2e-database.helper.js';
import { E2eFakeDataFactory } from './helpers/e2e-fake-data.helper.js';

describe('Comments (e2e)', () => {
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

  describe('POST /api/articles/:slug/comments', () => {
    it('should return 401 when adding a comment without Bearer token', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/comments`)
        .send({ body: 'Unauthorized comment' })
        .expect(401);
    });

    it('should return 400 when comment body is empty', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${author.token}`)
        .send({ body: '' })
        .expect(400);
    });

    it('should return 400 when comment body contains only whitespace', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${author.token}`)
        .send({ body: '   ' })
        .expect(400);
    });

    it('should return 400 when comment body exceeds COMMENT_BODY_MAX_LENGTH', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${author.token}`)
        .send({ body: 'a'.repeat(COMMENT_BODY_MAX_LENGTH + 1) })
        .expect(400);
    });

    it('should return 404 when adding a comment to a nonexistent article slug', async () => {
      const author = await seeder.createFakeUser();

      await request(ctx.app.getHttpServer())
        .post('/api/articles/nonexistent-slug/comments')
        .set('Authorization', `Bearer ${author.token}`)
        .send({ body: 'Valid body' })
        .expect(404);
    });

    it('should trim whitespace, add a comment to an article, and return 201', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser({
        username: 'commenter1',
        bio: null,
        image: null,
      });
      const { article } = await seeder.createFakeArticle(author.user);

      const res = await request(ctx.app.getHttpServer())
        .post(`/api/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .send({ body: '  His name was my name too.  ' })
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
    it('should return comments ordered newest first with following=false when unauthenticated', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await seeder.createFakeComment(article, commenter.user, {
        body: 'First comment',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      await seeder.createFakeComment(article, author.user, {
        body: 'Second comment',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      });

      const guestRes = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}/comments`)
        .expect(200);

      expect(guestRes.body.comments).toHaveLength(2);
      expect(guestRes.body.comments[0].body).toBe('Second comment');
      expect(guestRes.body.comments[0].author.following).toBe(false);
      expect(guestRes.body.comments[1].body).toBe('First comment');
      expect(guestRes.body.comments[1].author.following).toBe(false);
    });

    it('should reflect following=true for followed comment authors when authenticated', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser();
      const viewer = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await seeder.createFakeComment(article, commenter.user, {
        body: 'Followed comment',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      await seeder.createFakeComment(article, author.user, {
        body: 'Unfollowed comment',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      });
      await seeder.createFakeFollow(viewer.user.id, commenter.user.id);

      const viewerRes = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}/comments`)
        .set('Authorization', `Bearer ${viewer.token}`)
        .expect(200);

      expect(viewerRes.body.comments[0].author.following).toBe(false);
      expect(viewerRes.body.comments[1].author.following).toBe(true);
    });

    it('should return 404 when article does not exist', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/articles/nonexistent-slug/comments')
        .expect(404);
    });
  });

  describe('DELETE /api/articles/:slug/comments/:id', () => {
    it('should return 401 when deleting a comment without Bearer token', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);
      const comment = await seeder.createFakeComment(article, author.user);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/comments/${comment.id}`)
        .expect(401);
    });

    it('should return 400 when comment id is not a valid integer', async () => {
      const author = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/comments/not-a-number`)
        .set('Authorization', `Bearer ${author.token}`)
        .expect(400);
    });

    it('should return 404 when target article slug does not exist', async () => {
      const author = await seeder.createFakeUser();

      await request(ctx.app.getHttpServer())
        .delete('/api/articles/nonexistent-slug/comments/1')
        .set('Authorization', `Bearer ${author.token}`)
        .expect(404);
    });

    it('should return 404 when comment id belongs to a different article', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser();
      const { article: article1 } = await seeder.createFakeArticle(author.user);
      const { article: article2 } = await seeder.createFakeArticle(author.user);
      const comment = await seeder.createFakeComment(article1, commenter.user);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article2.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .expect(404);
    });

    it('should return 403 when a user tries to delete another user comment', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);
      const comment = await seeder.createFakeComment(article, commenter.user);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${author.token}`)
        .expect(403);
    });

    it('should delete own comment and return 204', async () => {
      const author = await seeder.createFakeUser();
      const commenter = await seeder.createFakeUser();
      const { article } = await seeder.createFakeArticle(author.user);
      const comment = await seeder.createFakeComment(article, commenter.user);

      await request(ctx.app.getHttpServer())
        .delete(`/api/articles/${article.slug}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.token}`)
        .expect(204);

      const deleted = await ctx.dataSource
        .getRepository(Comment)
        .findOneBy({ id: comment.id });
      expect(deleted).toBeNull();

      const afterDelete = await request(ctx.app.getHttpServer())
        .get(`/api/articles/${article.slug}/comments`)
        .expect(200);
      expect(afterDelete.body.comments).toEqual([]);
    });
  });
});
