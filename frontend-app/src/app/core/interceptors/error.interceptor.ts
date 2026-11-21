import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/** Header đánh dấu request đã thử lại sau refresh — chống vòng lặp vô hạn. */
const RETRY_HEADER = 'x-retried-after-refresh';

/** Endpoint auth tự xử lý lỗi của nó, không được refresh trong interceptor. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/register'];

/**
 * Upload hiển thị lỗi ngay cạnh form (kèm tên tệp và hướng dẫn thử lại), nên toast
 * "mất kết nối" chung ở đây chỉ gây nhiễu và dễ hiểu sai là lỗi mạng.
 */
const INLINE_ERROR_ENDPOINTS = ['/api/uploads'];

/**
 * Xử lý lỗi tập trung.
 *
 * - 401: thử `POST /auth/refresh` **một lần** rồi chạy lại request gốc với token mới;
 *   refresh cũng thất bại thì xoá phiên (AuthService.refreshAccessToken đã xoá) và
 *   trả lỗi cho page. AuthService dùng chung một lần refresh cho mọi request đồng thời.
 * - 5xx / mất kết nối: hiện toast chung; 4xx vẫn để page hiển thị cạnh form.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toasts = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
      const alreadyRetried = req.headers.has(RETRY_HEADER);

      if (error.status === 401 && !isAuthEndpoint && !alreadyRetried) {
        return auth.refreshAccessToken().pipe(
          switchMap((session) =>
            next(
              req.clone({
                setHeaders: {
                  Authorization: `Bearer ${session.accessToken}`,
                  [RETRY_HEADER]: 'true',
                },
              }),
            ),
          ),
          catchError(() => throwError(() => error)),
        );
      }

      const showsInlineError = INLINE_ERROR_ENDPOINTS.some((path) => req.url.includes(path));

      if (error.status === 0 && !showsInlineError) {
        toasts.error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
      } else if (error.status >= 500) {
        toasts.error(firstMessage(error) ?? 'Máy chủ gặp lỗi, vui lòng thử lại sau ít phút.');
      }

      return throwError(() => error);
    }),
  );
};

/** Lấy câu lỗi đầu tiên từ envelope lỗi của backend. */
function firstMessage(error: HttpErrorResponse): string | null {
  const message = (error.error as { message?: string | string[] } | null)?.message;

  if (Array.isArray(message)) {
    return message[0] ?? null;
  }

  return typeof message === 'string' && message.trim() ? message : null;
}
