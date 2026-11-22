import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { routes } from '../../app.routes';
import { AuthService } from '../services/auth.service';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { studentGuard } from './student.guard';

const ROUTE = {} as ActivatedRouteSnapshot;
const isAuthenticated = signal(false);
const isAdmin = signal(false);

function runGuard(guard: CanActivateFn, options: { admin?: boolean; url?: string } = {}) {
  isAdmin.set(options.admin ?? false);

  return TestBed.runInInjectionContext(() =>
    guard(ROUTE, { url: options.url ?? '/' } as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

function redirectUrl(result: boolean | UrlTree): string {
  expect(result).toBeInstanceOf(UrlTree);

  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('phân quyền route', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated, isAdmin } },
      ],
    });
  });

  it('đưa khách chưa đăng nhập về /auth/login kèm redirect URL gốc', () => {
    isAuthenticated.set(false);

    expect(redirectUrl(runGuard(authGuard, { url: '/dashboard' }))).toBe(
      '/auth/login?redirect=%2Fdashboard',
    );
  });

  it('cho phiên đã đăng nhập vào thẳng', () => {
    isAuthenticated.set(true);

    expect(runGuard(authGuard, { url: '/dashboard' })).toBe(true);
  });

  it('chỉ chặn ADMIN ở khu vực sinh viên, đưa về /admin/dashboard', () => {
    expect(redirectUrl(runGuard(studentGuard, { admin: true }))).toBe('/admin/dashboard');
    expect(runGuard(studentGuard, { admin: false })).toBe(true);
  });

  it('chỉ chặn USER ở khu vực /admin, đưa về /dashboard', () => {
    expect(redirectUrl(runGuard(adminGuard, { admin: false }))).toBe('/dashboard');
    expect(runGuard(adminGuard, { admin: true })).toBe(true);
  });

  it('gắn guard vai trò vào đúng layout, sau authGuard', () => {
    const studentLayout = routes.find(
      (route) => route.path === '' && route.children?.some((child) => child.path === 'dashboard'),
    );
    const adminLayout = routes.find((route) => route.path === 'admin');

    expect(studentLayout?.canActivate?.[0]).toBe(authGuard);
    expect(studentLayout?.canActivate).toContain(studentGuard);
    expect(adminLayout?.canActivate?.[0]).toBe(authGuard);
    expect(adminLayout?.canActivate).toContain(adminGuard);
  });
});
