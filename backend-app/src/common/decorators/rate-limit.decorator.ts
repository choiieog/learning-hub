import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Số request tối đa trong một cửa sổ. */
  limit: number;
  /** Độ dài cửa sổ tính bằng ms. */
  windowMs: number;
  /** Thông báo tiếng Việt trả về khi vượt giới hạn. */
  message?: string;
}

export const RATE_LIMIT_KEY = 'rate-limit';

/**
 * Giới hạn số request theo IP cho một route (xem `RateLimitGuard`).
 * Đặt trên handler để bật; handler không có decorator thì không bị giới hạn.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
