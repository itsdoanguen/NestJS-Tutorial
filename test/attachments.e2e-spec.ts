import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { ATTACHABLE_TYPE } from '../src/attachment/constants/attachment.constants.js';
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

describe('Attachments (e2e)', () => {
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

  const registerUser = async (email: string, username: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .send({ email, username, password: 'password123' })
      .expect(201);
    const user = await dataSource
      .getRepository(User)
      .findOneByOrFail({ username });
    return { token: res.body.user.token as string, user };
  };

  it('should return 401 when retrieving an attachment without Bearer token', async () => {
    const { token } = await registerUser('owner@example.com', 'owner');

    const updateRes = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get(updateRes.body.user.image as string)
      .expect(401);
  });

  it('should return 400 on invalid UUID and 404 when UUID does not exist', async () => {
    const { token } = await registerUser('check@example.com', 'checkuser');

    await request(app.getHttpServer())
      .get('/api/attachments/not-a-valid-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/attachments/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('should allow owner and other authenticated users to stream User avatar (Option B)', async () => {
    const owner = await registerUser('owner2@example.com', 'owner2');
    const viewer = await registerUser('viewer@example.com', 'viewer');

    const updateRes = await request(app.getHttpServer())
      .put('/api/user')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('avatar', VALID_PNG_BUFFER, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    const imageUrl = updateRes.body.user.image as string;

    const ownerGet = await request(app.getHttpServer())
      .get(imageUrl)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(ownerGet.headers['content-type']).toContain('image/png');
    expect(ownerGet.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(ownerGet.body)).toEqual(VALID_PNG_BUFFER);

    const viewerGet = await request(app.getHttpServer())
      .get(imageUrl)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);

    expect(Buffer.from(viewerGet.body)).toEqual(VALID_PNG_BUFFER);
  });

  it('should return 403 Forbidden when non-owner requests a non-User private attachment', async () => {
    const owner = await registerUser('docowner@example.com', 'docowner');
    const other = await registerUser('other@example.com', 'other');

    const privateId = crypto.randomUUID();
    const relPath = path.join('posts', `${privateId}.png`);
    const absPath = path.join(storageTestDir, relPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, VALID_PNG_BUFFER);

    const attachmentRepo = dataSource.getRepository(Attachment);
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

    await request(app.getHttpServer())
      .get(`/api/attachments/${privateId}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/attachments/${privateId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });
});
