import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities/user.entity.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

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
    const userRepo = dataSource.getRepository(User);
    await userRepo.clear();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const userRepo = dataSource.getRepository(User);
      await userRepo.clear();
    }
    await app.close();
  });

  describe('POST /api/users (Register)', () => {
    it('should register a new user successfully and return user response with JWT', async () => {
      const res = await request(app.getHttpServer())
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
      await request(app.getHttpServer()).post('/api/users').send({
        email: 'duplicate@example.com',
        username: 'user1',
        password: 'password123',
      });

      const res = await request(app.getHttpServer())
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
      await request(app.getHttpServer())
        .post('/api/users')
        .send({
          email: 'toolong@example.com',
          username: 'toolong',
          password: longPassword,
        })
        .expect(400);
    });

    it('should fail with 400 when password is shorter than 6 characters', async () => {
      await request(app.getHttpServer())
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
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/api/users').send({
        email: 'login@example.com',
        username: 'loginuser',
        password: 'correctpassword',
      });
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'correctpassword',
        })
        .expect(200);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
      expect(res.body.user.token).toBeDefined();
    });

    it('should return 401 Unauthorized for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should return 401 Unauthorized for non-existent email (timing attack safe)', async () => {
      await request(app.getHttpServer())
        .post('/api/users/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'randompassword',
        })
        .expect(401);
    });
  });

  describe('GET /api/user (Get Current User)', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer()).post('/api/users').send({
        email: 'profile@example.com',
        username: 'profileuser',
        password: 'password123',
      });
      token = res.body.user.token;
    });

    it('should return current user with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.user).toMatchObject({
        email: 'profile@example.com',
        username: 'profileuser',
      });
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should return 401 without Bearer token', async () => {
      await request(app.getHttpServer()).get('/api/user').expect(401);
    });
  });

  describe('POST /api/users/logout (Logout & Redis Blacklist)', () => {
    let token: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer()).post('/api/users').send({
        email: 'logout@example.com',
        username: 'logoutuser',
        password: 'password123',
      });
      token = res.body.user.token;
    });

    it('should blacklist token upon logout so it cannot be used again', async () => {
      await request(app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const logoutRes = await request(app.getHttpServer())
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(logoutRes.body.message).toBeDefined();

      await request(app.getHttpServer())
        .get('/api/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});
