import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Chặn khu vực /admin với tài khoản không phải ADMIN. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { redirect: state.url },
    });
  }

  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};
