import { IsOptional, IsString } from 'class-validator';

/**
 * Body of POST /api/auth/refresh.
 *
 * Trình duyệt không cần gửi gì: refresh token nằm trong cookie HttpOnly.
 * Body chỉ dành cho client khác (mobile, script) không dùng cookie.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
