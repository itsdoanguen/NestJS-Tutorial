import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import type { Server } from 'http';
import { Redis } from 'ioredis';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { REDIS_CLIENT } from '../../src/redis/redis.service.js';

export const TEST_DATABASE_NAME = 'nest_tutorial_test';
export const TEST_REDIS_DB = 1;
export const TEST_UPLOAD_DIR_NAME = 'storage-test';
export const TEST_UPLOAD_DIR_PATH = path.resolve(
  process.cwd(),
  TEST_UPLOAD_DIR_NAME,
);

export interface E2eTestContext {
  app: INestApplication<Server>;
  dataSource: DataSource;
  redisClient: Redis;
}

export function assertTestDatabase(dataSource: DataSource): void {
  const dbName = dataSource.options.database;
  if (dbName !== TEST_DATABASE_NAME) {
    throw new Error(
      `CRITICAL: E2E tests are connecting to '${String(dbName)}' instead of '${TEST_DATABASE_NAME}'. Aborting.`,
    );
  }
}

export function assertTestRedis(redisClient: Redis): void {
  const redisDb = redisClient.options.db ?? 0;
  if (redisDb !== TEST_REDIS_DB) {
    throw new Error(
      `CRITICAL: E2E tests are connecting to Redis db '${redisDb}' instead of '${TEST_REDIS_DB}'. Aborting.`,
    );
  }
}

export function assertTestStorageDir(storageDir: string): void {
  const resolved = path.resolve(storageDir);
  if (resolved !== TEST_UPLOAD_DIR_PATH) {
    throw new Error(
      `CRITICAL: E2E tests are attempting to use/clean '${resolved}' instead of '${TEST_UPLOAD_DIR_PATH}'. Aborting.`,
    );
  }
}

export function resolveTestStorageDir(app: INestApplication): string {
  const uploadDir = app.get(ConfigService).getOrThrow<string>('UPLOAD_DIR');
  const resolved = path.resolve(process.cwd(), uploadDir);
  assertTestStorageDir(resolved);
  return resolved;
}

export async function removeTestStorageDir(storageDir: string): Promise<void> {
  assertTestStorageDir(storageDir);
  await fs.rm(storageDir, { recursive: true, force: true });
}

export async function truncateDatabase(dataSource: DataSource): Promise<void> {
  assertTestDatabase(dataSource);

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const metadata of dataSource.entityMetadatas) {
      await queryRunner.query(`TRUNCATE TABLE \`${metadata.tableName}\``);
    }
  } finally {
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      await queryRunner.release();
    }
  }
}

export async function clearRedisBlacklist(redisClient: Redis): Promise<void> {
  assertTestRedis(redisClient);
  const keys = await redisClient.keys('blacklist:*');
  if (keys.length > 0) {
    await redisClient.del(...keys);
  }
}

export async function cleanupE2eAfterEach(
  dataSource: DataSource,
  redisClient: Redis,
  storageDir?: string,
): Promise<void> {
  await truncateDatabase(dataSource);
  await clearRedisBlacklist(redisClient);
  if (storageDir) {
    await removeTestStorageDir(storageDir);
  }
}

export async function closeE2eApp(
  ctx: Partial<E2eTestContext>,
  storageDir?: string,
): Promise<void> {
  if (ctx.dataSource?.isInitialized) {
    await truncateDatabase(ctx.dataSource);
  }
  if (ctx.redisClient) {
    await clearRedisBlacklist(ctx.redisClient);
  }
  if (storageDir) {
    await removeTestStorageDir(storageDir);
  }
  if (ctx.app) {
    await ctx.app.close();
  }
}

export async function createE2eTestApp(): Promise<E2eTestContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<Server>>();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  assertTestDatabase(dataSource);

  const redisClient = app.get<Redis>(REDIS_CLIENT);
  assertTestRedis(redisClient);

  resolveTestStorageDir(app);

  await truncateDatabase(dataSource);
  await clearRedisBlacklist(redisClient);

  return { app, dataSource, redisClient };
}
