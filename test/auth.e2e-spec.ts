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

describe('Auth (e2e)', () => {
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

  describe('POST /api/users (Register)', () => {
    it('should register a new user successfully and return user response with JWT', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'Test@example.com',
          username: 'testuser',
          password: 'password123',
        })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toMatchObject({
        email: 'test@example.com',
        username: 'testuser',
        bio: null,
        image: null,
      });
      expect(res.body.user.token).toBeDefined();
    });

    it('should fail with 409 Conflict when registering with duplicate email', async () => {
      await seeder.createFakeUser({
        email: 'duplicate@example.com',
        username: 'user1',
      });

      const res = await request(ctx.app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'DUPLICATE@example.com',
          username: 'user2',
          password: 'password123',
        })
        .expect(409);

      expect(res.body.message).toBeDefined();
    });

    it('should fail with 400 when password exceeds 72 bytes (Bcrypt limit)', async () => {
      const longPassword = 'a'.repeat(73);
      await request(ctx.app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'toolong@example.com',
          username: 'toolong',
          password: longPassword,
        })
        .expect(400);
    });

    it('should fail with 400 when password is shorter than 6 characters', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'short@example.com',
          username: 'short',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('POST /api/users/login (Login)', () => {
    let userSeed: FakeUserSeed;

    beforeEach(async () => {
      userSeed = await seeder.createFakeUser({
        email: 'login@example.com',
        username: 'loginuser',
        password: 'correctpassword',
      });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: userSeed.user.email,
          password: userSeed.plainPassword,
        })
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
      expect(res.body.user.token).toBeDefined();
    });

    it('should return 401 Unauthorized for wrong password', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: userSeed.user.email,
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should return 401 Unauthorized for non-existent email (timing attack safe)', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'randompassword',
        })
        .expect(401);
    });
  });

  describe('GET /api/user (Get Current User)', () => {
    let userSeed: FakeUserSeed;

    beforeEach(async () => {
      userSeed = await seeder.createFakeUser({
        email: 'profile@example.com',
        username: 'profileuser',
      });
    });

    it('should return current user with valid token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(200);

      expect(res.body.user).toMatchObject({
        email: 'profile@example.com',
        username: 'profileuser',
      });
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 401 without Bearer token', async () => {
      await request(ctx.app.getHttpServer()).get('/api/user').expect(401);
    });
  });

  describe('POST /api/users/logout (Logout & Redis Blacklist)', () => {
    let userSeed: FakeUserSeed;

    beforeEach(async () => {
      userSeed = await seeder.createFakeUser();
    });

    it('should blacklist token upon logout so it cannot be used again', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(200);

      const logoutRes = await request(ctx.app.getHttpServer())
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(200);

      expect(logoutRes.body.message).toBeDefined();

      await request(ctx.app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${userSeed.token}`)
        .expect(401);
    });
  });
});
