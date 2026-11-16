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
import { RateLimitStoreService } from './rate-limit.store';

/**
 * Giới hạn request theo IP (fixed window) cho các route có `@RateLimit(...)`.
 *
 * - Chỉ áp dụng cho route được gắn decorator, nên đăng ký global không ảnh hưởng route khác.
 * - Bộ đếm nằm trong `RateLimitStoreService`: RAM khi chạy 1 instance, Redis khi có
 *   `REDIS_URL` (nhiều instance thì giới hạn không bị nhân lên).
 * - IP lấy từ `request.ip`; sau reverse proxy phải bật `TRUST_PROXY=true` để Express đọc
 *   `X-Forwarded-For`, nếu không mọi request sẽ chung một bucket của proxy.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(request)}`;

    const { count, resetAt } = await this.store.hit(key, options.windowMs);

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.limit - count)));

    if (count <= options.limit) {
      return true;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    response.setHeader('Retry-After', String(retryAfterSeconds));

    throw new HttpException(
      options.message ??
        `Bạn thao tác quá nhanh, vui lòng thử lại sau ${Math.ceil(retryAfterSeconds / 60)} phút.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function clientIp(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
