import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import {
  API_BASE_URL,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  REFRESH_TOKEN_KEY,
} from '../constants/api.constants';
import {
  ApiResponse,
  AuthResponse,
  ChangePasswordPayload,
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
 * TODO(phase 1): lưu refresh token an toàn hơn, và gọi POST /auth/refresh
 * trong errorInterceptor khi access token hết hạn (401).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/auth`;

  private readonly userSignal = signal<User | null>(readStoredUser());

  readonly currentUser = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly isAdmin = computed(() => this.userSignal()?.role === 'ADMIN');
  readonly level = computed(() => this.userSignal()?.level ?? 1);

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
      .post<ApiResponse<AuthResponse>>(`${this.baseUrl}/login`, payload)
      .pipe(
        map((res) => res.data),
        tap((session) => this.setSession(session)),
      );
  }

  changePassword(payload: ChangePasswordPayload): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/password`, payload);
  }

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    this.userSignal.set(null);
  }

  /** Cập nhật lại user trong signal + storage sau khi sửa hồ sơ / avatar. */
  setCurrentUser(user: User): void {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    this.userSignal.set(user);
  }

  private setSession(session: AuthResponse): void {
    localStorage.setItem(AUTH_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
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
