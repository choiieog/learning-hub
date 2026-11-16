import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import configuration from '../../config/configuration';

export interface RateLimitHit {
  count: number;
  resetAt: number;
}

/** Dọn bộ nhớ khi có quá nhiều IP khác nhau. */
const MAX_TRACKED_KEYS = 5000;

/** Phần API của ioredis mà store dùng — không kéo cả type definitions vào guard. */
interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  quit(): Promise<unknown>;
}

/**
 * Bộ đếm rate limit.
 *
 * - Mặc định: `Map` trong RAM — đủ cho 1 instance, reset khi restart.
 * - Có `REDIS_URL`: dùng Redis (`INCR` + `PEXPIRE`) để nhiều instance chia sẻ
 *   cùng một cửa sổ. Redis lỗi giữa chừng thì tự quay lại bộ đếm RAM thay vì
 *   làm sập request.
 */
@Injectable()
export class RateLimitStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitStoreService.name);
  private readonly windows = new Map<string, RateLimitHit>();
  private redis: RedisLike | null = null;

  constructor() {
    const url = configuration().redisUrl;

    if (url) {
      void this.connectRedis(url);
    }
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    if (this.redis) {
      const shared = await this.hitRedis(key, windowMs);

      if (shared) {
        return shared;
      }
    }

    return this.hitMemory(key, windowMs);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  private async connectRedis(url: string): Promise<void> {
    try {
      const module = await import('ioredis');
      // ioredis v5 export default class, một số bản build chỉ có named export.
      const RedisConstructor = (module.default ?? module) as unknown as new (
        url: string,
        options?: Record<string, unknown>,
      ) => RedisLike;
      const client = new RedisConstructor(url, { maxRetriesPerRequest: 1 });

      client.on('error', (error: unknown) => {
        this.logger.warn(`Redis lỗi, tạm dùng bộ đếm RAM: ${String(error)}`);
      });

      this.redis = client;
      this.logger.log('Rate limit dùng Redis (nhiều instance chia sẻ cửa sổ).');
    } catch (error) {
      this.logger.warn(`Không kết nối được Redis, dùng RAM: ${String(error)}`);
      this.redis = null;
    }
  }

  private async hitRedis(
    key: string,
    windowMs: number,
  ): Promise<RateLimitHit | null> {
    try {
      const count = await this.redis!.incr(key);

      if (count === 1) {
        await this.redis!.pexpire(key, windowMs);
      }

      const ttl = await this.redis!.pttl(key);

      return { count, resetAt: Date.now() + Math.max(ttl, 0) };
    } catch {
      this.redis = null;
      return null;
    }
  }

  private hitMemory(key: string, windowMs: number): RateLimitHit {
    const now = Date.now();
    this.evictExpired(now);

    const previous = this.windows.get(key);
    const state: RateLimitHit =
      previous && previous.resetAt > now
        ? previous
        : { count: 0, resetAt: now + windowMs };

    state.count += 1;
    this.windows.set(key, state);

    return state;
  }

  /** Chỉ chạy khi map đã lớn: xoá các cửa sổ đã hết hạn để không phình bộ nhớ. */
  private evictExpired(now: number): void {
    if (this.windows.size < MAX_TRACKED_KEYS) {
      return;
    }

    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
