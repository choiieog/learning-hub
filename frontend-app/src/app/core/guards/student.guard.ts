import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Chặn khu vực sinh viên với tài khoản ADMIN. Luôn chạy sau authGuard để phiên
 * đăng nhập đã được kiểm tra; admin chỉ dùng console quản trị, muốn xem giao diện
 * sinh viên phải đăng nhập bằng tài khoản sinh viên.
 */
export const studentGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? router.createUrlTree(['/admin/dashboard']) : true;
};
