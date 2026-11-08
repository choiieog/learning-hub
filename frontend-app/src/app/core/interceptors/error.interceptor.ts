import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Xử lý lỗi tập trung.
 * TODO(phase 1):
 *  - 401: thử refresh token 1 lần rồi gọi lại request; thất bại thì logout + về /auth/login
 *  - hiển thị toast/thông báo từ `error.error.message`
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        auth.logout();
      }

      return throwError(() => error);
    }),
  );
};
