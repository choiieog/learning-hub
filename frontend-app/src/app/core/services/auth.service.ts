import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { API_BASE_URL, AUTH_USER_KEY } from '../constants/api.constants';
import {
  ApiResponse,
  AuthResponse,
  ChangePasswordPayload,
  ChangePasswordResult,
  LoginPayload,
  MessageResult,
  RegisterPayload,
  ResetPasswordPayload,
  User,
} from '../models';

/**
 * Trạng thái đăng nhập dùng signals → component đọc trực tiếp:
 *   auth.isAuthenticated() | auth.currentUser() | auth.isAdmin()
 *
 * Bảo mật:
 *  - access token (15 phút) chỉ nằm trong memory, không ghi localStorage;
 *  - refresh token nằm trong cookie HttpOnly do backend set, JavaScript không đọc được;
 *  - sau F5, `bootstrapSession()` đổi cookie lấy access token mới;
 *  - khi API trả 401, `errorInterceptor` gọi `refreshAccessToken()` rồi chạy lại
 *    request một lần (nhiều request đồng thời dùng chung một lần refresh).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/auth`;

  private readonly userSignal = signal<User | null>(readStoredUser());
  private accessToken: string | null = null;
  /** Dùng chung cho mọi request cùng lúc bị 401 — tránh gọi /refresh N lần. */
  private refreshRequest$: Observable<AuthResponse> | null = null;

  readonly currentUser = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly isAdmin = computed(() => this.userSignal()?.role === 'ADMIN');
  /** Hồ sơ cá nhân nằm trong đúng không gian: /profile hoặc /admin/profile. */
  readonly profilePath = computed(() => (this.isAdmin() ? '/admin/profile' : '/profile'));
  readonly level = computed(() => this.userSignal()?.level ?? 1);

  /** Access token hiện tại — chỉ interceptor dùng. */
  token(): string | null {
    return this.accessToken;
  }

  /**
   * Creates an unverified account and triggers the verification email.
   * There is no session yet — the user must confirm the email before logging in.
   */
  register(payload: RegisterPayload): Observable<MessageResult> {
    return this.http
      .post<ApiResponse<MessageResult>>(`${this.baseUrl}/register`, payload)
      .pipe(map((res) => res.data));
  }

  /** Activates the account behind the token taken from the email link. */
  verifyEmail(token: string): Observable<MessageResult> {
    return this.http
      .post<ApiResponse<MessageResult>>(`${this.baseUrl}/verify-email`, { token })
      .pipe(map((res) => res.data));
  }

  /** Re-sends the verification link (backend throttles to one email / 5 minutes). */
  resendVerification(email: string): Observable<MessageResult> {
    return this.http
      .post<ApiResponse<MessageResult>>(`${this.baseUrl}/resend-verification`, { email })
      .pipe(map((res) => res.data));
  }

  /**
   * Asks the backend for a password reset link. The response is deliberately
   * neutral (it never says whether the email is registered).
   */
  forgotPassword(email: string): Observable<MessageResult> {
    return this.http
      .post<ApiResponse<MessageResult>>(`${this.baseUrl}/forgot-password`, { email })
      .pipe(map((res) => res.data));
  }

  /** Sets a new password with the one-time token from the email link. */
  resetPassword(payload: ResetPasswordPayload): Observable<MessageResult> {
    return this.http
      .post<ApiResponse<MessageResult>>(`${this.baseUrl}/reset-password`, payload)
      .pipe(map((res) => res.data));
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<ApiResponse<AuthResponse>>(`${this.baseUrl}/login`, payload, { withCredentials: true })
      .pipe(
        map((res) => res.data),
        tap((session) => this.setSession(session)),
      );
  }

  /**
   * Đổi mật khẩu. Server cấp lại cặp token cho phiên hiện tại (các thiết bị khác bị
   * đăng xuất), nên người dùng **không** phải đăng nhập lại.
   */
  changePassword(payload: ChangePasswordPayload): Observable<ChangePasswordResult> {
    return this.http
      .patch<ApiResponse<ChangePasswordResult>>(`${this.baseUrl}/password`, payload, {
        withCredentials: true,
      })
      .pipe(
        map((res) => res.data),
        tap((result) => this.setSession({ accessToken: result.accessToken, user: result.user })),
      );
  }

  /**
   * Đổi refresh token (trong cookie) lấy access token mới. Lỗi thì xoá phiên.
   * `shareReplay` + biến `refreshRequest$`: nhiều request 401 cùng lúc chỉ refresh một lần.
   */
  refreshAccessToken(): Observable<AuthResponse> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.http
        .post<ApiResponse<AuthResponse>>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
        .pipe(
          map((res) => res.data),
          tap((session) => this.setSession(session)),
          catchError((error: unknown) => {
            this.clearSession();
            return throwError(() => error);
          }),
          finalize(() => {
            this.refreshRequest$ = null;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this.refreshRequest$;
  }

  /** Chạy lúc app khởi động: đã từng đăng nhập thì thử lấy lại access token từ cookie. */
  bootstrapSession(): Observable<void> {
    if (!this.userSignal()) {
      return of(undefined);
    }

    return this.refreshAccessToken().pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  logout(): void {
    // Thu hồi phiên ở backend (xoá hash + cookie); lỗi mạng vẫn phải xoá state local.
    this.http
      .post(`${this.baseUrl}/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => undefined });
    this.clearSession();
  }

  /** Xoá state local ngay (không gọi API) — dùng khi refresh thất bại. */
  clearSession(): void {
    this.accessToken = null;
    localStorage.removeItem(AUTH_USER_KEY);
    this.userSignal.set(null);
  }

  /** Cập nhật lại user trong signal + storage sau khi sửa hồ sơ / avatar. */
  setCurrentUser(user: User): void {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    this.userSignal.set(user);
  }

  /** Lưu phiên server vừa trả: access token vào memory, user vào signal + localStorage. */
  setSession(session: AuthResponse): void {
    this.accessToken = session.accessToken;
    this.setCurrentUser(session.user);
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
