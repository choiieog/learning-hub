import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AUTH_USER_KEY } from '../constants/api.constants';
import { User } from '../models';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

const USER: User = {
  id: 'u1',
  email: 'sinhvien@example.com',
  fullName: 'Sinh Viên',
  role: 'USER',
  status: 'ACTIVE',
  warningCount: 0,
  level: 2,
  exp: 120,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

/**
 * jsdom của builder test không cấp `localStorage`, trong khi AuthService dùng nó
 * để giữ hồ sơ user (không phải token). Stub trong memory là đủ cho phạm vi test này.
 */
const storedItems = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storedItems.get(key) ?? null,
      setItem: (key: string, value: string) => void storedItems.set(key, String(value)),
      removeItem: (key: string) => void storedItems.delete(key),
      clear: () => storedItems.clear(),
    },
  });
});

function setup() {
  const toasts = { error: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
      { provide: ToastService, useValue: toasts },
    ],
  });

  const auth = TestBed.inject(AuthService);
  auth.setSession({ accessToken: 'old-token', user: USER });

  return {
    auth,
    toasts,
    client: TestBed.inject(HttpClient),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('interceptor xác thực', () => {
  beforeEach(() => storedItems.clear());

  it('gắn Bearer token hiện tại vào request', () => {
    const { client, http } = setup();
    let response: unknown;

    client.get('/api/documents').subscribe((value) => (response = value));

    const request = http.expectOne('/api/documents');
    expect(request.request.headers.get('Authorization')).toBe('Bearer old-token');

    request.flush({ ok: true });
    expect(response).toEqual({ ok: true });
  });

  it('401 → refresh rồi retry đúng một lần với token mới', () => {
    const { auth, client, http } = setup();
    let response: unknown;
    let failure: HttpErrorResponse | undefined;

    client.get('/api/documents').subscribe({
      next: (value) => (response = value),
      error: (error: HttpErrorResponse) => (failure = error),
    });

    http.expectOne('/api/documents').flush({ message: 'Hết hạn' }, UNAUTHORIZED);

    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    refresh.flush({
      success: true,
      data: { accessToken: 'new-token', user: USER },
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const retried = http.expectOne('/api/documents');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer new-token');
    expect(retried.request.headers.has('x-retried-after-refresh')).toBe(true);
    retried.flush({ ok: true });

    expect(failure).toBeUndefined();
    expect(response).toEqual({ ok: true });
    expect(auth.token()).toBe('new-token');
    http.verify();
  });

  it('refresh thất bại → xoá phiên và trả lỗi 401 gốc', () => {
    const { auth, toasts, client, http } = setup();
    let failure: HttpErrorResponse | undefined;

    client
      .get('/api/documents')
      .subscribe({ error: (error: HttpErrorResponse) => (failure = error) });

    http.expectOne('/api/documents').flush({ message: 'Hết hạn' }, UNAUTHORIZED);
    http.expectOne('/api/auth/refresh').flush({ message: 'Phiên đã hết hạn' }, UNAUTHORIZED);

    expect(failure?.status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    // 401 do page tự hiển thị, không dùng toast chung.
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it('không refresh cho chính endpoint auth', () => {
    const { client, http } = setup();
    let failure: HttpErrorResponse | undefined;

    client
      .post('/api/auth/login', {})
      .subscribe({ error: (error: HttpErrorResponse) => (failure = error) });

    http.expectOne('/api/auth/login').flush({ message: 'Sai mật khẩu' }, UNAUTHORIZED);

    expect(failure).toBeTruthy();
    http.expectNone('/api/auth/refresh');
  });

  it('retry vẫn 401 thì trả lỗi, không refresh vòng thứ hai', () => {
    const { client, http } = setup();
    let failure: HttpErrorResponse | undefined;

    client
      .get('/api/documents')
      .subscribe({ error: (error: HttpErrorResponse) => (failure = error) });

    http.expectOne('/api/documents').flush({}, UNAUTHORIZED);
    http
      .expectOne('/api/auth/refresh')
      .flush({ success: true, data: { accessToken: 'new-token', user: USER }, timestamp: '' });
    http.expectOne('/api/documents').flush({}, UNAUTHORIZED);

    expect(failure?.status).toBe(401);
    http.expectNone('/api/auth/refresh');
  });
});
