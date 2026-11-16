import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { Attachment } from '../src/database/entities/attachment.entity.js';
import { Follow } from '../src/database/entities/follow.entity.js';
import { User } from '../src/database/entities/user.entity.js';

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let storageTestDir: string;

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
    storageTestDir = path.resolve(
      process.cwd(),
      process.env.UPLOAD_DIR || 'storage-test',
    );

    const dbName = dataSource.options.database;
    if (dbName !== 'nest_tutorial_test') {
      throw new Error(
        `CRITICAL: E2E tests are connecting to '${dbName}' instead of 'nest_tutorial_test'. Aborting.`,
      );
    }
  });

  beforeEach(async () => {
    await clearTestTables();
    await fs.rm(storageTestDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await clearTestTables();
    }
    await fs.rm(storageTestDir, { recursive: true, force: true });
    await app.close();
  });

  const registerUser = async (
    email: string,
    username: string,
    password = 'password123',
  ): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email, username, password })
      .expect(201);
    return res.body.user.token as string;
  };

  it('should return 401 when calling PUT /api/user without token', async () => {
    await request(app.getHttpServer())
      .put('/api/user')
      .send({ bio: 'No auth' })
      .expect(401);
  });

  it('should update bio, username, and email cleanly via JSON', async () => {
    const token = await registerUser('user1@example.com', 'user1');

    const res = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: '  NewMail@Example.com ',
        username: 'user1_updated',
        bio: 'NestJS developer',
      })
      .expect(200);

    expect(res.body.user).toMatchObject({
      email: 'newmail@example.com',
      username: 'user1_updated',
      bio: 'NestJS developer',
    });
  });

  it('should return 409 Conflict when updating to an email already used by another user', async () => {
    const token1 = await registerUser('first@example.com', 'first');
    await registerUser('second@example.com', 'second');

    await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token1}`)
      .send({ email: 'second@example.com' })
      .expect(409);
  });

  it('should upload avatar via multipart/form-data, replace old avatar file, and store attachment record', async () => {
    const token = await registerUser('avatar@example.com', 'avataruser');

    const firstRes = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token}`)
      .field('bio', 'With avatar')
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'first.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(firstRes.body.user.image).toMatch(
      /^\/api\/attachments\/[0-9a-f-]{36}$/,
    );
    const firstId = (firstRes.body.user.image as string).split('/').pop()!;
    const firstFile = path.join(storageTestDir, 'avatars', `${firstId}.png`);
    await expect(fs.access(firstFile)).resolves.toBeUndefined();

    const secondRes = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'second.png',
        contentType: 'image/png',
      })
      .expect(200);

    const secondId = (secondRes.body.user.image as string).split('/').pop()!;
    expect(secondId).not.toBe(firstId);
    const secondFile = path.join(storageTestDir, 'avatars', `${secondId}.png`);
    await expect(fs.access(secondFile)).resolves.toBeUndefined();
    await expect(fs.access(firstFile)).rejects.toThrow();
  });

  it('should reject spoofed image upload with invalid magic bytes (400)', async () => {
    const token = await registerUser('spoof@example.com', 'spoofuser');

    await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', Buffer.from('not-an-image-at-all'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('should revoke old token and return a valid new token when password is changed', async () => {
    const oldToken = await registerUser('pw@example.com', 'pwuser');

    const updateRes = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ password: 'newStrongPassword123' })
      .expect(200);

    const newToken = updateRes.body.user.token as string;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);

    await request(app.getHttpServer())
      .get('/api/user')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/user')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);
  });
});
