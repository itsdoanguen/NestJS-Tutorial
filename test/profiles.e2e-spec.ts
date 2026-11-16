import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Attachment } from '../src/database/entities/attachment.entity.js';
import { Follow } from '../src/database/entities/follow.entity.js';
import { User } from '../src/database/entities/user.entity.js';

describe('Profiles (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const clearTestTables = async () => {
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

  describe('GET /api/profiles/:username', () => {
    it('should return profile with following=false when unauthenticated', async () => {
      await registerUser('jake@example.com', 'jake');

      const res = await request(app.getHttpServer())
        .get('/api/profiles/jake')
        .expect(200);

      expect(res.body.profile).toEqual({
        username: 'jake',
        bio: null,
        image: null,
        following: false,
      });
    });

    it('should return 401 when an invalid Bearer token is supplied', async () => {
      await registerUser('jake2@example.com', 'jake2');

      await request(app.getHttpServer())
        .get('/api/profiles/jake2')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });

    it('should return 404 when profile does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/profiles/nonexistent_user')
        .expect(404);
    });
  });

  describe('POST & DELETE /api/profiles/:username/follow', () => {
    let followerToken: string;

    beforeEach(async () => {
      followerToken = await registerUser('alice@example.com', 'alice');
      await registerUser('bob@example.com', 'bob');
    });

    it('should follow and unfollow target user cleanly and reflect status in GET profile', async () => {
      const followRes = await request(app.getHttpServer())
        .post('/api/profiles/bob/follow')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);

      expect(followRes.body.profile).toEqual({
        username: 'bob',
        bio: null,
        image: null,
        following: true,
      });

      const repeatFollowRes = await request(app.getHttpServer())
        .post('/api/profiles/bob/follow')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);
      expect(repeatFollowRes.body.profile.following).toBe(true);

      const authProfileRes = await request(app.getHttpServer())
        .get('/api/profiles/bob')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);
      expect(authProfileRes.body.profile.following).toBe(true);

      const unfollowRes = await request(app.getHttpServer())
        .delete('/api/profiles/bob/follow')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);
      expect(unfollowRes.body.profile.following).toBe(false);

      const afterUnfollowRes = await request(app.getHttpServer())
        .get('/api/profiles/bob')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(200);
      expect(afterUnfollowRes.body.profile.following).toBe(false);
    });

    it('should return 400 when user tries to follow themselves', async () => {
      await request(app.getHttpServer())
        .post('/api/profiles/alice/follow')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(400);
    });

    it('should return 401 when following without token and 404 for unknown target', async () => {
      await request(app.getHttpServer())
        .post('/api/profiles/bob/follow')
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/profiles/missing_user/follow')
        .set('Authorization', `Bearer ${followerToken}`)
        .expect(404);
    });
  });
});
