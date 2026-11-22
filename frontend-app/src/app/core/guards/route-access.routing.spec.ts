import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { studentGuard } from './student.guard';

@Component({ template: '' })
class StubPage {}

/** Cùng cách ghép guard như app.routes.ts, nhưng thay layout thật bằng component giả. */
const testRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, studentGuard],
    children: [{ path: 'dashboard', component: StubPage }],
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    children: [
      { path: 'dashboard', component: StubPage },
      { path: 'users', component: StubPage },
    ],
  },
];

const isAdmin = signal(false);

describe('điều hướng route theo vai trò', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        { provide: AuthService, useValue: { isAuthenticated: () => true, isAdmin } },
      ],
    });
  });

  async function navigate(url: string): Promise<string> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);

    return router.url;
  }

  it('đẩy ADMIN gõ URL sinh viên sang /admin/dashboard', async () => {
    isAdmin.set(true);

    expect(await navigate('/dashboard')).toBe('/admin/dashboard');
  });

  it('đẩy USER vào /admin/users về /dashboard', async () => {
    isAdmin.set(false);

    expect(await navigate('/admin/users')).toBe('/dashboard');
  });
});
