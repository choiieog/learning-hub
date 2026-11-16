import type { Request, Response } from 'express';
import configuration from '../../config/configuration';

/**
 * Refresh token sống trong cookie HttpOnly thay vì localStorage: JavaScript
 * (kể cả một thư viện npm bị nhiễm) không đọc được, nên một lỗ XSS không lấy
 * được phiên 7 ngày. Access token ngắn hạn giữ trong memory ở frontend.
 *
 * Path `/api/auth` để cookie chỉ đi kèm các route auth, không gửi kèm mọi
 * request tài liệu.
 */
export const REFRESH_COOKIE_NAME = 'lh_refresh';
const COOKIE_PATH = '/api/auth';

/** Ghi cookie sau khi login / refresh (refresh token bị rotate mỗi lần). */
export function setRefreshCookie(response: Response, token: string): void {
  const { env, jwt } = configuration();

  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: jwt.refreshTtlSeconds * 1000,
  });
}

/** Xoá cookie khi logout / đổi mật khẩu. */
export function clearRefreshCookie(response: Response): void {
  const { env } = configuration();

  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
  });
}

/**
 * Đọc cookie bằng tay (không cần thêm `cookie-parser`): header `Cookie` là
 * danh sách `name=value` phân tách bởi `;`.
 */
export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.cookie;

  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');

    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}
