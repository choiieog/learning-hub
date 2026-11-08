import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { getApiErrorCode, getApiErrorMessages } from '../../../../core/utils/api-error.util';

/**
 * Login form.
 * - 403 EMAIL_NOT_VERIFIED → offers a "gửi lại email xác thực" action;
 * - honours the `redirect` query param set by authGuard;
 * - admins land on /admin/dashboard, students on /dashboard.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="auth-title">Đăng nhập</h1>
    <p class="auth-subtitle">Dùng email đã xác thực để vào Learning Hub.</p>

    <form class="mt-6" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (errorMessages().length > 0) {
        <div class="alert alert-error" role="alert" aria-live="polite">
          @for (message of errorMessages(); track message) {
            <p>{{ message }}</p>
          }
        </div>
      }

      @if (requiresVerification()) {
        <div class="alert alert-info" role="status">
          <p class="font-medium">Tài khoản chưa xác thực email</p>
          <p class="mt-1">Mở link trong email đã gửi, hoặc yêu cầu gửi lại.</p>
          <button
            type="button"
            class="btn-secondary mt-2 w-full"
            [disabled]="resending()"
            (click)="resend()"
          >
            {{ resending() ? 'Đang gửi...' : 'Gửi lại email xác thực' }}
          </button>
        </div>
      }

      @if (resendMessage()) {
        <p class="alert alert-success" role="status">{{ resendMessage() }}</p>
      }

      <div class="field">
        <label class="field-label" for="email">Email</label>
        <input
          id="email"
          class="field-input"
          type="email"
          formControlName="email"
          autocomplete="email"
          placeholder="tenban@example.com"
          [attr.aria-invalid]="showError('email')"
        />
        @if (showError('email')) {
          <p class="field-error">Nhập địa chỉ email hợp lệ.</p>
        }
      </div>

      <div class="field">
        <label class="field-label" for="password">Mật khẩu</label>
        <input
          id="password"
          class="field-input"
          type="password"
          formControlName="password"
          autocomplete="current-password"
          [attr.aria-invalid]="showError('password')"
        />
        @if (showError('password')) {
          <p class="field-error">Nhập mật khẩu.</p>
        }
      </div>

      <p class="mt-2 text-right text-sm">
        <a class="auth-link" routerLink="/auth/forgot-password">Quên mật khẩu?</a>
      </p>

      <button class="btn-primary mt-6" type="submit" [disabled]="submitting()">
        {{ submitting() ? 'Đang đăng nhập...' : 'Đăng nhập' }}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-slate-500">
      Chưa có tài khoản?
      <a class="auth-link" routerLink="/auth/register">Đăng ký</a>
    </p>
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessages = signal<string[]>([]);
  protected readonly requiresVerification = signal(false);
  protected readonly resending = signal(false);
  protected readonly resendMessage = signal<string | null>(null);

  protected showError(control: 'email' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessages.set([]);
    this.requiresVerification.set(false);
    this.resendMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: (session) => {
        this.submitting.set(false);

        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        const fallback = session.user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
        const target = redirect?.startsWith('/') ? redirect : fallback;

        void this.router.navigateByUrl(target);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        const code = getApiErrorCode(error);
        this.requiresVerification.set(code === 'EMAIL_NOT_VERIFIED');

        // The verification panel below already says the account is unverified,
        // so a red alert with the same sentence would only duplicate it.
        this.errorMessages.set(code === 'EMAIL_NOT_VERIFIED' ? [] : getApiErrorMessages(error));
      },
    });
  }

  protected resend(): void {
    const email = this.form.controls.email.value.trim();

    if (!email) {
      this.form.controls.email.markAsTouched();
      return;
    }

    this.resending.set(true);
    this.resendMessage.set(null);
    this.errorMessages.set([]);

    this.auth.resendVerification(email).subscribe({
      next: (result) => {
        this.resending.set(false);
        this.resendMessage.set(result.message);
      },
      error: (error: unknown) => {
        this.resending.set(false);
        this.errorMessages.set(getApiErrorMessages(error));
      },
    });
  }
}
