import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import {
  cleanupE2eAfterEach,
  closeE2eApp,
  createE2eTestApp,
  resolveTestStorageDir,
  type E2eTestContext,
} from './helpers/e2e-database.helper.js';
import { E2eFakeDataFactory } from './helpers/e2e-fake-data.helper.js';

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

describe('Users (e2e)', () => {
  let ctx: E2eTestContext;
  let seeder: E2eFakeDataFactory;
  let storageTestDir: string;

  beforeAll(async () => {
    ctx = await createE2eTestApp();
    seeder = new E2eFakeDataFactory(ctx.app, ctx.dataSource);
    storageTestDir = resolveTestStorageDir(ctx.app);
  });

  afterEach(async () => {
    await cleanupE2eAfterEach(ctx.dataSource, ctx.redisClient, storageTestDir);
  });

  afterAll(async () => {
    await closeE2eApp(ctx, storageTestDir);
  });

  it('should return 401 when calling PUT /api/user without token', async () => {
    await request(ctx.app.getHttpServer())
      .put('/api/user')
      .send({ bio: 'No auth' })
      .expect(401);
  });

  it('should update bio, username, and email cleanly via JSON', async () => {
    const userSeed = await seeder.createFakeUser();

    const res = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
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
    const first = await seeder.createFakeUser();
    const second = await seeder.createFakeUser();

    await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ email: second.user.email })
      .expect(409);
  });

  it('should upload avatar via multipart/form-data, replace old avatar file, and store attachment record', async () => {
    const userSeed = await seeder.createFakeUser();

    const firstRes = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
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

    const secondRes = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
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
    const userSeed = await seeder.createFakeUser();

    await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
      .attach('avatar', Buffer.from('not-an-image-at-all'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('should revoke old token and return a valid new token when password is changed', async () => {
    const userSeed = await seeder.createFakeUser();

    const updateRes = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
      .send({ password: 'newStrongPassword123' })
      .expect(200);

    const newToken = updateRes.body.user.token as string;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(userSeed.token);

    await request(ctx.app.getHttpServer())
      .get('/api/user')
      .set('Authorization', `Bearer ${userSeed.token}`)
      .expect(401);

    await request(ctx.app.getHttpServer())
      .get('/api/user')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);
  });
});
