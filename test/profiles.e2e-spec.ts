import request from 'supertest';
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

describe('Profiles (e2e)', () => {
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

  describe('GET /api/profiles/:username', () => {
    it('should return profile with following=false when unauthenticated', async () => {
      const target = await seeder.createFakeUser({
        username: 'jake',
        bio: null,
        image: null,
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/profiles/${target.user.username}`)
        .expect(200);

      expect(res.body.profile).toEqual({
        username: 'jake',
        bio: null,
        image: null,
        following: false,
      });
    });

    it('should return 401 when an invalid Bearer token is supplied', async () => {
      const target = await seeder.createFakeUser();

      await request(ctx.app.getHttpServer())
        .get(`/api/profiles/${target.user.username}`)
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should return 404 when profile does not exist', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/profiles/nonexistent_user')
        .expect(404);
    });
  });

  describe('POST & DELETE /api/profiles/:username/follow', () => {
    let follower: FakeUserSeed;
    let target: FakeUserSeed;

    beforeEach(async () => {
      follower = await seeder.createFakeUser({ username: 'alice' });
      target = await seeder.createFakeUser({
        username: 'bob',
        bio: null,
        image: null,
      });
    });

    it('should follow and unfollow target user cleanly and reflect status in GET profile', async () => {
      const followRes = await request(ctx.app.getHttpServer())
        .post(`/api/profiles/${target.user.username}/follow`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(200);

      expect(followRes.body.profile).toEqual({
        username: 'bob',
        bio: null,
        image: null,
        following: true,
      });

      const repeatFollowRes = await request(ctx.app.getHttpServer())
        .post(`/api/profiles/${target.user.username}/follow`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(200);
      expect(repeatFollowRes.body.profile.following).toBe(true);

      const authProfileRes = await request(ctx.app.getHttpServer())
        .get(`/api/profiles/${target.user.username}`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(200);
      expect(authProfileRes.body.profile.following).toBe(true);

      const unfollowRes = await request(ctx.app.getHttpServer())
        .delete(`/api/profiles/${target.user.username}/follow`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(200);
      expect(unfollowRes.body.profile.following).toBe(false);

      const afterUnfollowRes = await request(ctx.app.getHttpServer())
        .get(`/api/profiles/${target.user.username}`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(200);
      expect(afterUnfollowRes.body.profile.following).toBe(false);
    });

    it('should return 400 when user tries to follow themselves', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/profiles/${follower.user.username}/follow`)
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(400);
    });

    it('should return 401 when following without token', async () => {
      await request(ctx.app.getHttpServer())
        .post(`/api/profiles/${target.user.username}/follow`)
        .expect(401);
    });

    it('should return 404 when following a nonexistent target user', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/profiles/missing_user/follow')
        .set('Authorization', `Bearer ${follower.token}`)
        .expect(404);
    });
  });
});
