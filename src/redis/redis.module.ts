import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService, REDIS_CLIENT } from './redis.service.js';

const REDIS_RECONNECT_MAX_DELAY = 3000;
const REDIS_RECONNECT_STEP = 100;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          retryStrategy: (times: number) => {
            return Math.min(
              times * REDIS_RECONNECT_STEP,
              REDIS_RECONNECT_MAX_DELAY,
            );
          },
        });
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
