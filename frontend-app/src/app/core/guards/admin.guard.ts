import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Chặn khu vực /admin với tài khoản không phải ADMIN. Luôn chạy sau authGuard để
 * phiên đăng nhập đã được kiểm tra.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};
