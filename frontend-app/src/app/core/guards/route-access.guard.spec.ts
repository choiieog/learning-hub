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
const STATE = {} as RouterStateSnapshot;
const isAdmin = signal(false);

function runGuard(guard: CanActivateFn, admin: boolean): boolean | UrlTree {
  isAdmin.set(admin);

  return TestBed.runInInjectionContext(() => guard(ROUTE, STATE)) as boolean | UrlTree;
}

function redirectFor(guard: CanActivateFn, admin: boolean): string {
  const result = runGuard(guard, admin);
  expect(result).toBeInstanceOf(UrlTree);

  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('phân quyền route theo vai trò', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isAdmin } }],
    });
  });

  it('chỉ chặn ADMIN ở khu vực sinh viên, đưa về /admin/dashboard', () => {
    expect(redirectFor(studentGuard, true)).toBe('/admin/dashboard');
    expect(runGuard(studentGuard, false)).toBe(true);
  });

  it('chỉ chặn USER ở khu vực /admin, đưa về /dashboard', () => {
    expect(redirectFor(adminGuard, false)).toBe('/dashboard');
    expect(runGuard(adminGuard, true)).toBe(true);
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
