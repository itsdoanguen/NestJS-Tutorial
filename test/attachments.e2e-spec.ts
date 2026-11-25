import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import { ATTACHABLE_TYPE } from '../src/attachment/constants/attachment.constants.js';
import { Attachment } from '../src/database/entities/attachment.entity.js';
import {
  cleanupE2eAfterEach,
  closeE2eApp,
  createE2eTestApp,
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

describe('Attachments (e2e)', () => {
  let ctx: E2eTestContext;
  let seeder: E2eFakeDataFactory;
  let storageTestDir: string;

  beforeAll(async () => {
    ctx = await createE2eTestApp();
    seeder = new E2eFakeDataFactory(ctx.app, ctx.dataSource);
    storageTestDir = path.resolve(
      process.cwd(),
      process.env.UPLOAD_DIR || 'storage-test',
    );
  });

  afterEach(async () => {
    await cleanupE2eAfterEach(ctx.dataSource, ctx.redisClient, storageTestDir);
  });

  afterAll(async () => {
    await closeE2eApp(ctx, storageTestDir);
  });

  it('should return 401 when retrieving an attachment without Bearer token', async () => {
    const owner = await seeder.createFakeUser();

    const updateRes = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(updateRes.body.user.image as string)
      .expect(401);
  });

  it('should return 400 on invalid UUID and 404 when UUID does not exist', async () => {
    const userSeed = await seeder.createFakeUser();

    await request(ctx.app.getHttpServer())
      .get('/api/attachments/not-a-valid-uuid')
      .set('Authorization', `Bearer ${userSeed.token}`)
      .expect(400);

    await request(ctx.app.getHttpServer())
      .get(`/api/attachments/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${userSeed.token}`)
      .expect(404);
  });

  it('should allow owner and other authenticated users to stream User avatar (Option B)', async () => {
    const owner = await seeder.createFakeUser();
    const viewer = await seeder.createFakeUser();

    const updateRes = await request(ctx.app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    const imageUrl = updateRes.body.user.image as string;

    const ownerGet = await request(ctx.app.getHttpServer())
      .get(imageUrl)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(ownerGet.headers['content-type']).toContain('image/png');
    expect(ownerGet.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(ownerGet.body)).toEqual(VALID_PNG_BUFFER);

    const viewerGet = await request(ctx.app.getHttpServer())
      .get(imageUrl)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);

    expect(Buffer.from(viewerGet.body)).toEqual(VALID_PNG_BUFFER);
  });

  it('should return 403 Forbidden when non-owner requests a non-User private attachment', async () => {
    const owner = await seeder.createFakeUser();
    const other = await seeder.createFakeUser();

    const privateId = crypto.randomUUID();
    const relPath = path.join('posts', `${privateId}.png`);
    const absPath = path.join(storageTestDir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, VALID_PNG_BUFFER);

    const attachmentRepo = ctx.dataSource.getRepository(Attachment);
    await attachmentRepo.save(
      attachmentRepo.create({
        id: privateId,
        attachableId: String(owner.user.id),
        attachableType: ATTACHABLE_TYPE.POST,
        url: `/api/attachments/${privateId}`,
        fileName: 'private.png',
        filePath: relPath,
        fileType: 'image/png',
        fileSize: VALID_PNG_BUFFER.length,
      }),
    );

    await request(ctx.app.getHttpServer())
      .get(`/api/attachments/${privateId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);

    await request(ctx.app.getHttpServer())
      .get(`/api/attachments/${privateId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });
});
