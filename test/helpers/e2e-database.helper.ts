import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import type { Server } from 'http';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { REDIS_CLIENT } from '../../src/redis/redis.service.js';

export const TEST_DATABASE_NAME = 'nest_tutorial_test';

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
    await fs.rm(storageDir, { recursive: true, force: true });
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
    await fs.rm(storageDir, { recursive: true, force: true });
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  await app.init();

  const dataSource = app.get(DataSource);
  assertTestDatabase(dataSource);

  const redisClient = app.get<Redis>(REDIS_CLIENT);
  await truncateDatabase(dataSource);
  await clearRedisBlacklist(redisClient);

  return { app, dataSource, redisClient };
}
