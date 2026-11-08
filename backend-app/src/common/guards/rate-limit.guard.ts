import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator';

interface WindowState {
  count: number;
  resetAt: number;
}

/** Dọn bộ nhớ khi có quá nhiều IP khác nhau (mỗi tiến trình giữ riêng, không cần Redis). */
const MAX_TRACKED_KEYS = 5000;

/**
 * Giới hạn request theo IP (fixed window) cho các route có `@RateLimit(...)`.
 *
 * - Chỉ áp dụng cho route được gắn decorator, nên đăng ký global không ảnh hưởng route khác.
 * - Bộ đếm nằm trong RAM của tiến trình: đủ cho 1 instance; nhiều instance thì cần store chung (Redis)
 *   và cửa sổ sẽ reset khi restart — chấp nhận được cho đồ án này.
 * - IP lấy từ `request.ip`; sau reverse proxy phải bật `TRUST_PROXY=true` để Express đọc
 *   `X-Forwarded-For`, nếu không mọi request sẽ chung một bucket của proxy.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const now = Date.now();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(request)}`;

    this.evictExpired(now);

    const previous = this.windows.get(key);
    const state: WindowState =
      previous && previous.resetAt > now
        ? previous
        : { count: 0, resetAt: now + options.windowMs };

    state.count += 1;
    this.windows.set(key, state);

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.limit - state.count)));

    if (state.count <= options.limit) {
      return true;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    response.setHeader('Retry-After', String(retryAfterSeconds));

    throw new HttpException(
      options.message ??
        `Bạn thao tác quá nhanh, vui lòng thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
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

function clientIp(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
