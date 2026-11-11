import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.getOrThrow<string>('REDIS_HOST'),
      port: this.configService.getOrThrow<number>('REDIS_PORT'),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        this.logger.warn(`Redis connection failed. Reconnecting in ${delay}ms... (attempt ${times})`);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error occurred:', err.message);
    });
  }


  async blacklistToken(jti: string, exp: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const ttl = exp - now;

    if (ttl > 0) {
      await this.client.set(`blacklist:${jti}`, '1', 'EX', ttl);
      this.logger.log(`Token ${jti} blacklisted for ${ttl} seconds`);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.client.get(`blacklist:${jti}`);
    return result !== null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}